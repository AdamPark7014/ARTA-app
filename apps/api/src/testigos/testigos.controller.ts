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
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import PDFDocument = require('pdfkit');
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { entityScope } from '../common/entity-scope';
import { hasPermission, isDirectionRole, PERMISSIONS, canEditTestigos, canSeeModule, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { PdfBrandingService } from '../uploads/pdf-branding.service';
import {
  contentMatchesExtension,
  discardUpload,
  MEDIA_MULTER_OPTIONS,
  mediaMimeFor,
  uploadRoot,
} from '../uploads/upload-storage';

export const TESTIGO_MEDIA = ['ESPECTACULAR', 'PENDON', 'PRENSA', 'RADIO', 'TV', 'REDES', 'WEB', 'OTRO'] as const;

const MEDIUM_LABEL: Record<string, string> = {
  ESPECTACULAR: 'Espectaculares',
  PENDON: 'Pendones',
  PRENSA: 'Prensa',
  RADIO: 'Radio',
  TV: 'Televisión',
  REDES: 'Redes sociales',
  WEB: 'Web',
  OTRO: 'Otros',
};

type AuthUser = {
  id: string;
  roleKey: string;
  entities?: string[] | null;
  permissions?: string[] | null;
  organizationId?: string | null;
  fullName?: string;
};

/** Lo único que puede ir a la galería: una foto ya subida. */
function isSitePhoto(row: { fileUrl: string | null; mimeType: string | null }) {
  return !!row.fileUrl && !!row.mimeType?.startsWith('image/');
}

class TestigoDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(TESTIGO_MEDIA as unknown as string[]) medium?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @MaxLength(500) link?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  // En multipart llega como texto y la conversión implícita volvería «false» en true.
  @IsOptional() @Transform(({ obj }) => obj.isPublic === true || obj.isPublic === 'true') @IsBoolean() isPublic?: boolean;
}

const AUTHOR = { select: { id: true, fullName: true } } as const;

/**
 * Testigos de publicidad: la prueba de que la publicidad de un evento salió. Los suben los
 * practicantes (y quien edita el evento) y se juntan en un archivo final en PDF.
 */
@Controller('testigos')
@UseGuards(JwtAuthGuard)
export class TestigosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branding: PdfBrandingService,
  ) {}

  private async eventFor(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    assertSameTenant(user as never, event.organizationId);
    if (!canSeeModule(user, event.entity, 'testigos')) {
      throw new ForbiddenException('Los testigos de este evento no están a tu alcance');
    }
    return event;
  }

  /** Williams solo los ve en Arta; en Auditorio los edita. */
  private assertEdit(user: AuthUser, entity: string) {
    if (!canEditTestigos(user, entity)) {
      throw new ForbiddenException('No subes testigos de publicidad en este negocio');
    }
  }

  /** Eventos a los que un practicante les sube testigos: los de sus negocios, sin más detalle. */
  @Get('events')
  async events(@Req() req: { user: AuthUser }, @Query('entity') entity?: string) {
    const scope = entityScope(req.user as never, entity).filter((e) => canSeeModule(req.user, e, 'testigos'));
    const rows = await this.prisma.event.findMany({
      where: { organizationId: tenantIdOf(req.user as never), entity: { in: scope as EntityKey[] }, status: { not: 'CANCELLED' } },
      select: {
        id: true,
        name: true,
        entity: true,
        startsAt: true,
        venue: true,
        status: true,
        _count: { select: { publicityProofs: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    return rows.map(({ _count, ...e }) => ({ ...e, count: _count.publicityProofs }));
  }

  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.eventFor(req.user, eventId);
    return this.prisma.publicityProof.findMany({
      where: { eventId },
      include: { createdBy: AUTHOR },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  @Post('event/:eventId')
  @UseInterceptors(FileInterceptor('file', MEDIA_MULTER_OPTIONS))
  async create(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: TestigoDto,
  ) {
    const discard = () => file && discardUpload(file.path);
    let event;
    try {
      event = await this.eventFor(req.user, eventId);
      this.assertEdit(req.user, event.entity);
    } catch (e) {
      discard();
      throw e;
    }
    const link = dto.link?.trim() || null;
    if (!file && !link) throw new BadRequestException('Sube una foto o archivo, o pega una liga');
    if (file && !contentMatchesExtension(file.path, file.originalname)) {
      discard();
      throw new BadRequestException('El contenido del archivo no corresponde a su extensión');
    }
    if (link && !/^https?:\/\//i.test(link)) {
      discard();
      throw new BadRequestException('La liga debe empezar con http:// o https://');
    }
    const created = await this.prisma.publicityProof.create({
      data: {
        eventId,
        medium: dto.medium || 'OTRO',
        title: dto.title?.trim() || file?.originalname || 'Testigo',
        note: dto.note?.trim() || null,
        link,
        fileUrl: file ? `/uploads/${file.filename}` : null,
        fileName: file?.originalname ?? null,
        mimeType: file ? mediaMimeFor(file.originalname) || file.mimetype : null,
        sizeBytes: file?.size ?? null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        isPublic: false,
        createdById: req.user.id,
      },
      include: { createdBy: AUTHOR },
    });
    // Sin foto no hay qué mandar a la galería: se queda como testigo y ya.
    return dto.isPublic && isSitePhoto(created) ? this.sendToSite(created) : created;
  }

  /**
   * «Para el sitio»: la foto entra a la galería de Studio como borrador y ahí se publica o se baja, como
   * cualquier otra (01-11-2026, «subible a la página web»). Quien la quita de aquí la quita también de allá.
   */
  private async sendToSite<T extends { id: string; title: string; note: string | null; fileUrl: string | null }>(row: T) {
    const item = await this.prisma.siteItem.create({
      data: {
        kind: 'foto',
        title: row.title,
        caption: row.note,
        mediaUrl: row.fileUrl as string,
        mediaType: 'image',
        active: false,
      },
    });
    return this.prisma.publicityProof.update({
      where: { id: row.id },
      data: { isPublic: true, siteItemId: item.id },
      include: { createdBy: AUTHOR },
    });
  }

  private async removeFromSite(siteItemId: string | null) {
    if (siteItemId) await this.prisma.siteItem.deleteMany({ where: { id: siteItemId } });
  }

  @Patch(':id')
  async update(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() dto: TestigoDto) {
    const row = await this.prisma.publicityProof.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Testigo no encontrado');
    const event = await this.eventFor(req.user, row.eventId);
    this.assertEdit(req.user, event.entity);
    if (dto.isPublic === true && !row.isPublic) {
      if (!isSitePhoto(row)) throw new BadRequestException('A la galería del sitio solo van fotos');
      await this.sendToSite(row);
    }
    if (dto.isPublic === false && row.isPublic) await this.removeFromSite(row.siteItemId);
    return this.prisma.publicityProof.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || row.title } : {}),
        ...(dto.medium !== undefined ? { medium: dto.medium } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.link !== undefined ? { link: dto.link.trim() || null } : {}),
        ...(dto.publishedAt !== undefined ? { publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null } : {}),
        ...(dto.isPublic === false ? { isPublic: false, siteItemId: null } : {}),
      },
      include: { createdBy: AUTHOR },
    });
  }

  /** Lo borra quien lo subió o dirección. */
  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const row = await this.prisma.publicityProof.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Testigo no encontrado');
    const event = await this.eventFor(req.user, row.eventId);
    this.assertEdit(req.user, event.entity);
    if (row.createdById !== req.user.id && !isDirectionRole(req.user.roleKey)) {
      throw new ForbiddenException('Solo quien lo subió o dirección lo borra');
    }
    await this.removeFromSite(row.siteItemId);
    await this.prisma.publicityProof.delete({ where: { id } });
    return { ok: true };
  }

  /** Archivo final: todos los testigos del evento en un PDF, por medio. */
  @Post('event/:eventId/pdf')
  async pdf(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.eventFor(req.user, eventId);
    const rows = await this.prisma.publicityProof.findMany({
      where: { eventId },
      include: { createdBy: AUTHOR },
      orderBy: [{ medium: 'asc' }, { publishedAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!rows.length) throw new BadRequestException('Este evento todavía no tiene testigos');

    const dir = join(uploadRoot, 'testigos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fileName = `testigos-${event.id}-${Date.now()}.pdf`;
    const filePath = join(dir, fileName);
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 100, left: 40, right: 40, bottom: 90 }, bufferPages: true });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    const meta = {
      entity: event.entity,
      eventName: event.name,
      venue: event.venue,
      city: event.city,
      fileName: 'Testigos de publicidad',
      generatedBy: req.user.fullName ?? null,
      generatedAt: new Date(),
    };
    doc.on('pageAdded', () => {
      doc.y = this.branding.drawHeaderFooter(doc, meta);
    });
    doc.y = this.branding.drawHeaderFooter(doc, meta);

    const left = doc.page.margins.left;
    const width = doc.page.width - left * 2;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    let medium = '';
    for (const row of rows) {
      if (row.medium !== medium) {
        medium = row.medium;
        if (doc.y + 40 > bottom()) doc.addPage();
        doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#0c0c0d').text(MEDIUM_LABEL[medium] ?? medium, left, doc.y, { width });
        doc.moveDown(0.3);
      }
      const imagePath = this.imagePathOf(row);
      const imageH = imagePath ? 240 : 0;
      if (doc.y + imageH + 60 > bottom()) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0c0c0d').text(row.title, left, doc.y, { width });
      const facts = [
        row.publishedAt ? row.publishedAt.toISOString().slice(0, 10) : null,
        row.createdBy?.fullName ? `Subió ${row.createdBy.fullName}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (facts) doc.font('Helvetica').fontSize(8.5).fillColor('#3f3f45').text(facts, left, doc.y, { width });
      if (row.note) doc.font('Helvetica').fontSize(9).fillColor('#3f3f45').text(row.note, left, doc.y, { width });
      if (row.link) doc.font('Helvetica').fontSize(8.5).fillColor('#3f3f45').text(row.link, left, doc.y, { width, link: row.link, underline: true });
      if (!imagePath && row.fileName) doc.font('Helvetica').fontSize(8.5).fillColor('#3f3f45').text(`Archivo: ${row.fileName}`, left, doc.y, { width });
      if (imagePath) {
        const top = doc.y + 4;
        try {
          doc.image(imagePath, left, top, { fit: [width, imageH] });
          doc.y = top + imageH;
        } catch {
          doc.font('Helvetica').fontSize(8.5).fillColor('#3f3f45').text(`Archivo: ${row.fileName ?? ''}`, left, top, { width });
        }
      }
      doc.moveDown(0.8);
    }
    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
    return { url: `/uploads/testigos/${fileName}`, fileName: `Testigos ${event.name}.pdf`, count: rows.length };
  }

  /** PDFKit solo pinta JPG y PNG; lo demás queda listado con su nombre. */
  private imagePathOf(row: { fileUrl: string | null; mimeType: string | null }) {
    if (!row.fileUrl || !/image\/(jpe?g|png)/i.test(row.mimeType ?? '')) return null;
    const path = join(uploadRoot, basename(row.fileUrl));
    return existsSync(path) ? path : null;
  }
}
