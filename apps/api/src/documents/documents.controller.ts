import {
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
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { DocumentPdfService, normalizeBlocks } from './document-pdf.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  organizationId?: string | null;
};

class CreateDocumentDto {
  @IsString() eventId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() module?: string;
  @IsOptional() blocks?: unknown;
  /** Id del EventFile del que se importó el texto, si vino de un PDF */
  @IsOptional() @IsString() sourceFileId?: string;
}

const DOC_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EventDocumentInclude;

/**
 * Documentos editables del evento.
 *
 * Se escriben en el panel como bloques y se descargan en PDF. El PDF generado
 * se registra además como `EventFile`, así que aparece en la pestaña de
 * archivos del evento junto con lo demás.
 */
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private prisma: PrismaService,
    private pdfs: DocumentPdfService,
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
    if (status === 'CLOSED' || status === 'CANCELLED') {
      throw new ForbiddenException('Evento cerrado — los documentos quedan en solo lectura');
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

  @Get(':id')
  async one(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const { event, ...doc } = await this.load(req.user, id);
    return doc;
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: CreateDocumentDto) {
    const event = await this.assertEvent(req.user, dto.eventId);
    this.assertOpen(event.status);
    const blocks = normalizeBlocks(dto.blocks);
    return this.prisma.eventDocument.create({
      data: {
        eventId: dto.eventId,
        module: dto.module,
        title: dto.title.slice(0, 200) || 'Documento sin título',
        blocksJson: (blocks.length ? blocks : [{ type: 'p', text: '' }]) as Prisma.InputJsonValue,
        sourceFileId: dto.sourceFileId,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      include: DOC_INCLUDE,
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { title?: string; blocks?: unknown },
  ) {
    const doc = await this.load(req.user, id);
    this.assertOpen(doc.event.status);

    const data: Prisma.EventDocumentUpdateInput = { updatedBy: { connect: { id: req.user.id } } };
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.slice(0, 200);
    }
    if (body.blocks !== undefined) {
      data.blocksJson = normalizeBlocks(body.blocks) as Prisma.InputJsonValue;
      // Cada guardado es una versión: el PDF exportado queda obsoleto.
      data.version = { increment: 1 };
    }

    return this.prisma.eventDocument.update({
      where: { id },
      data,
      include: DOC_INCLUDE,
    });
  }

  /**
   * Exporta a PDF y lo deja como archivo del evento, para que se descargue y
   * se vea embebido igual que cualquier otro adjunto.
   */
  @Post(':id/pdf')
  async exportPdf(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const doc = await this.load(req.user, id);

    const { url } = await this.pdfs.generate(doc.id, doc.version, {
      title: doc.title,
      eventName: doc.event.name,
      entity: doc.event.entity,
      blocks: normalizeBlocks(doc.blocksJson),
      updatedBy: doc.updatedBy?.fullName || null,
      updatedAt: doc.updatedAt,
    });

    const fileName = `${doc.title}.pdf`;
    // Un solo EventFile por documento: se actualiza en vez de acumular copias.
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
          },
        })
      : await this.prisma.eventFile.create({
          data: {
            eventId: doc.eventId,
            fileName,
            mimeType: 'application/pdf',
            url,
            kind: 'pdf',
            module: doc.module,
            updatedById: req.user.id,
          },
        });

    await this.prisma.eventDocument.update({
      where: { id: doc.id },
      data: { pdfUrl: url, pdfVersion: doc.version },
    });

    return { url, fileId: file.id, version: doc.version };
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const doc = await this.load(req.user, id);
    this.assertOpen(doc.event.status);
    await this.prisma.eventDocument.delete({ where: { id } });
    return { ok: true };
  }
}
