import {
  Controller,
  Post,
  Put,
  Delete,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Body,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join, basename } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { MULTER_OPTIONS, uploadRoot } from './upload-storage';
import { assertSameTenant } from '../common/tenant';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private prisma: PrismaService) {}

  private async assertEventOps(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException('Sin acceso a archivos de este evento');
    }
    assertSameTenant(user, event.organizationId);
    return event;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async upload(
    @Req() req: { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { eventId?: string; checklistId?: string; kind?: string; module?: string },
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const mime = file.mimetype || 'application/octet-stream';
    let kind = body.kind || 'other';
    if (!body.kind) {
      if (mime.includes('pdf')) kind = 'pdf';
      else if (mime.includes('sheet') || mime.includes('excel') || file.originalname.match(/\.xlsx?$/i))
        kind = 'excel';
      else if (mime.startsWith('image/')) kind = 'image';
    }

    const url = `/uploads/${file.filename}`;

    // Upload suelto (Studio, anticipos, etc.) — solo JWT
    if (!body.eventId && !body.checklistId) {
      return { id: null, url, fileName: file.originalname, mimeType: mime, kind, sizeBytes: file.size };
    }

    let eventId = body.eventId;
    if (body.checklistId && !eventId) {
      const cl = await this.prisma.checklistInstance.findUnique({
        where: { id: body.checklistId },
        include: { event: true },
      });
      if (!cl) throw new NotFoundException('Checklist no encontrado');
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          cl.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, cl.event.organizationId);
      eventId = cl.eventId;
    } else if (eventId) {
      await this.assertEventOps(req.user, eventId);
    }

    const record = await this.prisma.eventFile.create({
      data: {
        eventId: eventId || undefined,
        checklistId: body.checklistId || undefined,
        fileName: file.originalname,
        mimeType: mime,
        url,
        sizeBytes: file.size,
        kind,
        // Sección del evento (campaign, finance…) para poder listar por módulo
        module: body.module ? String(body.module).slice(0, 40) : undefined,
      },
    });
    return record;
  }

  /**
   * Guardar en el sitio.
   *
   * El panel deja editar el Excel en una hoja de cálculo y escribir encima del
   * PDF; al guardar manda el archivo completo ya reconstruido y aquí se
   * reemplaza el contenido **sin cambiar el id**, para que los enlaces que ya
   * circulan sigan apuntando al mismo documento.
   *
   * El archivo anterior NO se borra del disco: queda como respaldo de la
   * versión previa. La fila apunta al nuevo y sube `version`.
   */
  @Put(':id/content')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async saveInPlace(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');

    const current = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!current) throw new NotFoundException('Archivo no encontrado');
    if (current.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          current.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException('Sin acceso a archivos de este evento');
      }
      assertSameTenant(req.user, current.event.organizationId);
      if (current.event.status === 'CLOSED' || current.event.status === 'CANCELLED') {
        throw new ForbiddenException('Evento cerrado — los archivos quedan en solo lectura');
      }
    }

    // El tipo no puede cambiar a media edición: un .xlsx se guarda como .xlsx.
    const wasExt = extname(current.fileName || current.url).toLowerCase();
    const nowExt = extname(file.originalname).toLowerCase();
    if (wasExt && nowExt && wasExt !== nowExt) {
      throw new BadRequestException(
        `El archivo guardado debe seguir siendo ${wasExt} (llegó ${nowExt})`,
      );
    }

    return this.prisma.eventFile.update({
      where: { id },
      data: {
        url: `/uploads/${file.filename}`,
        sizeBytes: file.size,
        mimeType: file.mimetype || current.mimeType,
        version: { increment: 1 },
        updatedById: req.user.id,
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');

    if (file.event) {
      if (
        !canAccessEventOps(
          req.user.entities as EntityKey[],
          req.user.roleKey as RoleKey,
          file.event.entity as EntityKey,
        )
      ) {
        throw new ForbiddenException();
      }
      assertSameTenant(req.user, file.event.organizationId);
    }

    const name = basename(file.url);
    const diskPath = join(uploadRoot, name);
    if (existsSync(diskPath)) {
      try {
        unlinkSync(diskPath);
      } catch {
        // ignore disk errors; DB row still removed
      }
    }

    await this.prisma.eventFile.delete({ where: { id } });
    return { ok: true };
  }
}
