import {
  Controller,
  Post,
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
import { diskStorage } from 'multer';
import { extname, join, basename } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';

const uploadRoot = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

/**
 * Uploaded files are served statically at /uploads/* on the API's own origin
 * (same-origin as the panel via the Traefik/Next proxy). An .html or .svg
 * upload would be served with a Content-Type that the browser executes,
 * giving stored XSS in an authenticated session. Allowlist by extension —
 * fail closed on anything else (no PHP/CGI execution risk on this Node
 * static server, so the concern is purely browser-rendered content).
 */
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.xlsx',
  '.xls',
  '.csv',
  '.doc',
  '.docx',
]);

function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new BadRequestException(`Tipo de archivo no permitido: ${ext || '(sin extensión)'}`), false);
    return;
  }
  cb(null, true);
}

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(uploadRoot);
          cb(null, uploadRoot);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 40 * 1024 * 1024 },
      fileFilter,
    }),
  )
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
