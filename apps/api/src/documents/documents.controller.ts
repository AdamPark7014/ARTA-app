import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocType, Prisma } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { readFileSync } from 'fs';
import * as mammoth from 'mammoth';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import {
  canAccessEventOps,
  hasPermission,
  isDirectionRole,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { actorFrom, RevisionService } from '../common/revisions/revision.service';
import { MULTER_OPTIONS, discardUpload } from '../uploads/upload-storage';
import {
  DocumentPdfService,
  normalizeBlocks,
  type DocBlock,
} from './document-pdf.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  permissions?: string[];
  organizationId?: string | null;
};

class CreateDocumentDto {
  @IsString() eventId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() blocks?: unknown;
  @IsOptional() @IsString() sourceFileId?: string;
}

const DOC_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EventDocumentInclude;

/** .docx (HTML de mammoth) → bloques del editor embebido. */
function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const re =
    /<(h1|h2|p|li)[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase().startsWith('<hr')) {
      blocks.push({ type: 'divider', text: '' });
      continue;
    }
    const tag = m[1].toLowerCase();
    const text = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (!text && tag !== 'p') continue;
    if (tag === 'h1') blocks.push({ type: 'h1', text });
    else if (tag === 'h2') blocks.push({ type: 'h2', text });
    else if (tag === 'li') blocks.push({ type: 'bullet', text });
    else blocks.push({ type: 'p', text });
  }
  if (!blocks.length) {
    const plain = html
      .replace(/<[^>]+>/g, '\n')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of plain.slice(0, 500)) blocks.push({ type: 'p', text: line });
  }
  return normalizeBlocks(blocks.length ? blocks : [{ type: 'p', text: '' }]);
}

/**
 * Documentos tipo Word embebidos.
 *
 * Entrada: crear en blanco o importar .docx/.pdf→texto.
 * Trabajo: editar solo dentro del panel (auditoría por revisión).
 * Salida: PDF oficial registrado como EventFile.
 */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private prisma: PrismaService,
    private pdfs: DocumentPdfService,
    private revisions: RevisionService,
  ) {}

  private async assertEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (
      !canAccessEventOps(
        user.entities as EntityKey[],
        user.roleKey as RoleKey,
        event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  private assertOpen(status: string) {
    assertEventNotClosed(status);
  }

  private assertDocEdit(user: AuthUser) {
    if (
      !hasPermission(
        user.roleKey as RoleKey,
        user.permissions || [],
        PERMISSIONS.CHECKLIST_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para editar documentos');
    }
  }

  private async load(user: AuthUser, id: string) {
    const doc = await this.prisma.eventDocument.findUnique({
      where: { id },
      include: { ...DOC_INCLUDE, event: true },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.assertEvent(user, doc.eventId);
    return doc;
  }

  @Get('event/:eventId')
  async byEvent(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Query('module') module?: string,
  ) {
    await this.assertEvent(req.user, eventId);
    return this.prisma.eventDocument.findMany({
      where: { eventId, ...(module ? { module } : {}) },
      include: DOC_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id/revisions')
  async docRevisions(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    await this.load(req.user, id);
    return this.revisions.history(DocType.DOCUMENT, id);
  }

  @Get(':id')
  async one(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const { event: _e, ...doc } = await this.load(req.user, id);
    return doc;
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateDocumentDto) {
    this.assertDocEdit(req.user);
    const event = await this.assertEvent(req.user, dto.eventId);
    this.assertOpen(event.status);
    // Reabrir edición desde un PDF existente (pdf→documento) solo lo hace Dirección.
    if (dto.sourceFileId && !isDirectionRole(req.user.roleKey)) {
      throw new ForbiddenException('Solo dirección puede volver un PDF a editable');
    }
    const blocks = normalizeBlocks(dto.blocks);
    const created = await this.prisma.eventDocument.create({
      data: {
        eventId: dto.eventId,
        module: dto.module,
        title: dto.title.slice(0, 200) || 'Documento sin título',
        blocksJson: (blocks.length ? blocks : [{ type: 'p', text: '' }]) as Prisma.InputJsonValue,
        sourceFileId: dto.sourceFileId,
        createdById: req.user.id,
        updatedById: req.user.id,
        revision: 1,
      },
      include: DOC_INCLUDE,
    });
    await this.revisions.record({
      organizationId: event.organizationId || '(sin-organizacion)',
      eventId: event.id,
      docType: DocType.DOCUMENT,
      docId: created.id,
      revision: 1,
      snapshotJson: { title: created.title, blocks },
      note: 'Documento creado',
      actor: actorFrom(req as never),
    });
    return created;
  }

  /**
   * Importa un .docx como documento embebido (entrada única).
   * Después solo se edita en el panel y se sale en PDF.
   */
  @Post('import-docx')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async importDocx(
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { eventId?: string; module?: string; title?: string },
  ) {
    this.assertDocEdit(req.user);
    if (!file) throw new BadRequestException('Archivo .docx requerido');
    if (!body.eventId) {
      discardUpload(file.path);
      throw new BadRequestException('eventId requerido');
    }
    const event = await this.assertEvent(req.user, body.eventId);
    this.assertOpen(event.status);
    if (!/\.docx$/i.test(file.originalname)) {
      discardUpload(file.path);
      throw new BadRequestException('Solo se importa Word (.docx)');
    }

    let html = '';
    try {
      const result = await mammoth.convertToHtml({ buffer: readFileSync(file.path) });
      html = result.value || '';
    } catch {
      discardUpload(file.path);
      throw new BadRequestException('No se pudo leer el Word');
    }
    discardUpload(file.path);

    const blocks = htmlToBlocks(html);
    const title =
      (body.title || file.originalname.replace(/\.docx$/i, '')).slice(0, 200) ||
      'Documento importado';

    const created = await this.prisma.eventDocument.create({
      data: {
        eventId: event.id,
        module: body.module || 'general',
        title,
        blocksJson: blocks as Prisma.InputJsonValue,
        createdById: req.user.id,
        updatedById: req.user.id,
        revision: 1,
      },
      include: DOC_INCLUDE,
    });

    await this.revisions.record({
      organizationId: event.organizationId || '(sin-organizacion)',
      eventId: event.id,
      docType: DocType.DOCUMENT,
      docId: created.id,
      revision: 1,
      snapshotJson: { title, blocks },
      note: `Importado desde Word «${file.originalname}»`,
      actor: actorFrom(req as never),
    });

    return created;
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { title?: string; blocks?: unknown },
  ) {
    this.assertDocEdit(req.user);
    const doc = await this.load(req.user, id);
    this.assertOpen(doc.event.status);

    const data: Prisma.EventDocumentUpdateInput = {
      updatedBy: { connect: { id: req.user.id } },
    };
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.slice(0, 200);
    }
    const blocksChanged = body.blocks !== undefined;
    if (blocksChanged) {
      data.blocksJson = normalizeBlocks(body.blocks) as Prisma.InputJsonValue;
      data.version = { increment: 1 };
      data.revision = { increment: 1 };
    }

    const updated = await this.prisma.eventDocument.update({
      where: { id },
      data,
      include: DOC_INCLUDE,
    });

    if (blocksChanged) {
      await this.revisions.record({
        organizationId: doc.event.organizationId || '(sin-organizacion)',
        eventId: doc.eventId,
        docType: DocType.DOCUMENT,
        docId: updated.id,
        revision: updated.revision,
        snapshotJson: {
          title: updated.title,
          blocks: normalizeBlocks(updated.blocksJson),
        },
        note: 'Edición en panel',
        actor: actorFrom(req as never),
      });
    }

    return updated;
  }

  /**
   * Salida oficial: PDF. El Word/docx original no vuelve a salir.
   */
  @Post(':id/pdf')
  async exportPdf(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const doc = await this.load(req.user, id);

    const { url } = await this.pdfs.generate(doc.id, doc.version, {
      title: doc.title,
      eventName: doc.event.name,
      entity: doc.event.entity,
      blocks: normalizeBlocks(doc.blocksJson),
      updatedBy: doc.updatedBy?.fullName || req.user.fullName || null,
      updatedAt: doc.updatedAt,
    });

    const fileName = `${doc.title} (salida).pdf`;
    const existing = await this.prisma.eventFile.findFirst({
      where: { eventId: doc.eventId, url: { startsWith: `/uploads/documents/${doc.id}-` } },
    });

    const file = existing
      ? await this.prisma.eventFile.update({
          where: { id: existing.id },
          data: {
            url,
            fileName,
            version: { increment: 1 },
            updatedById: req.user.id,
            module: doc.module || 'general',
          },
        })
      : await this.prisma.eventFile.create({
          data: {
            eventId: doc.eventId,
            fileName,
            mimeType: 'application/pdf',
            url,
            kind: 'pdf',
            module: doc.module || 'general',
            updatedById: req.user.id,
          },
        });

    await this.prisma.eventDocument.update({
      where: { id: doc.id },
      data: { pdfUrl: url, pdfVersion: doc.version },
    });

    await this.revisions.record({
      organizationId: doc.event.organizationId || '(sin-organizacion)',
      eventId: doc.eventId,
      docType: DocType.DOCUMENT,
      docId: doc.id,
      revision: doc.revision,
      fileUrl: url,
      note: `Salida PDF v${doc.version}`,
      actor: actorFrom(req as never),
    });

    return { url, fileId: file.id, version: doc.version };
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertDocEdit(req.user);
    const doc = await this.load(req.user, id);
    this.assertOpen(doc.event.status);
    await this.prisma.eventDocument.delete({ where: { id } });
    return { ok: true };
  }
}
