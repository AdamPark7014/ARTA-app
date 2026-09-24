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
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { EntityKey } from '@prisma/client';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEntity,
  hasPermission,
  isDirectionRole,
  PERMISSIONS,
  type EntityKey as EK,
  type RoleKey,
} from '../common/rbac/roles';
import { assertSameTenant, orgWhere, tenantIdOf } from '../common/tenant';
import { MULTER_OPTIONS } from '../uploads/upload-storage';
import type { Response } from 'express';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { uploadRoot } from '../uploads/upload-storage';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

class FolderDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() allowedRoles?: string[];
}

class FileDto {
  @IsString() fileName!: string;
  @IsString() url!: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() sizeBytes?: number;
}

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private prisma: PrismaService) {}

  private assertEntity(user: AuthUser, entity: EntityKey) {
    if (!canAccessEntity(user.entities as EK[], user.roleKey as RoleKey, entity as EK)) {
      throw new ForbiddenException();
    }
  }

  /**
   * Inline bytes (restringido por carpeta): Excel/Doc/Imagen para ver/editar en app.
   * Protege originales tras /api en lugar de /uploads públicos.
   */
  @Get('files/:fileId/inline')
  async inline(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Param('fileId') fileId: string,
  ) {
    const file = await this.prisma.sharedFile.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    assertSameTenant(req.user, file.folder.organizationId);
    this.assertEntity(req.user, file.folder.entity);
    if (!this.canSeeFolder(req.user, file.folder.allowedRoles)) throw new ForbiddenException();
    const rel = String(file.url || '').replace(/^\/uploads\//, '');
    const abs = join(uploadRoot, rel);
    if (!abs.startsWith(uploadRoot) || !existsSync(abs)) throw new NotFoundException('Archivo no está en disco');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName || 'archivo')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(readFileSync(abs));
  }

  private canEdit(user: AuthUser) {
    return hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.FOLDERS_EDIT);
  }

  private canSeeFolder(user: AuthUser, allowedRoles: string[]) {
    if (!allowedRoles.length) return true;
    if (isDirectionRole(user.roleKey)) return true;
    return allowedRoles.includes(user.roleKey);
  }

  @Get()
  async list(@Req() req: { user: AuthUser }, @Query('entity') entity?: EntityKey) {
    const ent = (entity && req.user.entities.includes(entity) ? entity : req.user.entities[0]) as EntityKey;
    this.assertEntity(req.user, ent);
    const folders = await this.prisma.sharedFolder.findMany({
      where: { entity: ent, ...orgWhere(req.user) },
      include: { _count: { select: { files: true } } },
      orderBy: { name: 'asc' },
    });
    return folders.filter((f) => this.canSeeFolder(req.user, f.allowedRoles));
  }

  @Get(':id')
  async one(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const folder = await this.prisma.sharedFolder.findUnique({
      where: { id },
      include: { files: { orderBy: { createdAt: 'desc' } } },
    });
    if (!folder) throw new NotFoundException();
    assertSameTenant(req.user, folder.organizationId);
    this.assertEntity(req.user, folder.entity);
    if (!this.canSeeFolder(req.user, folder.allowedRoles)) throw new ForbiddenException();
    return folder;
  }

  @Post()
  async create(
    @Req() req: { user: AuthUser },
    @Body() body: FolderDto & { entity: EntityKey },
  ) {
    if (!this.canEdit(req.user)) throw new ForbiddenException();
    this.assertEntity(req.user, body.entity);
    return this.prisma.sharedFolder.create({
      data: {
        organizationId: tenantIdOf(req.user),
        entity: body.entity,
        name: body.name,
        description: body.description,
        allowedRoles: body.allowedRoles || [],
        createdById: req.user.id,
      },
    });
  }

  @Patch(':id')
  async update(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: FolderDto) {
    if (!this.canEdit(req.user)) throw new ForbiddenException();
    const folder = await this.prisma.sharedFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    assertSameTenant(req.user, folder.organizationId);
    this.assertEntity(req.user, folder.entity);
    return this.prisma.sharedFolder.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        allowedRoles: body.allowedRoles,
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    if (!this.canEdit(req.user)) throw new ForbiddenException();
    const folder = await this.prisma.sharedFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    assertSameTenant(req.user, folder.organizationId);
    this.assertEntity(req.user, folder.entity);
    await this.prisma.sharedFolder.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/files')
  async addFile(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: FileDto) {
    if (!this.canEdit(req.user)) throw new ForbiddenException();
    const folder = await this.prisma.sharedFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    assertSameTenant(req.user, folder.organizationId);
    this.assertEntity(req.user, folder.entity);
    return this.prisma.sharedFile.create({
      data: {
        folderId: id,
        fileName: body.fileName,
        url: body.url,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        uploadedById: req.user.id,
      },
    });
  }

  /**
   * Guardar en el sitio un archivo de carpetas generales.
   *
   * El panel deja abrir el Excel en una hoja de cálculo y escribir encima del
   * PDF; al guardar manda el archivo ya reconstruido y aquí se reemplaza el
   * contenido **sin cambiar el id**, para que los enlaces que ya circulan
   * sigan sirviendo. El archivo anterior se queda en disco como respaldo.
   */
  @Put('files/:fileId/content')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async saveFileInPlace(
    @Req() req: { user: AuthUser },
    @Param('fileId') fileId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!this.canEdit(req.user)) throw new ForbiddenException();

    const current = await this.prisma.sharedFile.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });
    if (!current) throw new NotFoundException('Archivo no encontrado');
    assertSameTenant(req.user, current.folder.organizationId);
    this.assertEntity(req.user, current.folder.entity);

    // El tipo no puede cambiar a media edición: un .xlsx se guarda como .xlsx.
    const wasExt = extname(current.fileName || current.url).toLowerCase();
    const nowExt = extname(file.originalname).toLowerCase();
    if (wasExt && nowExt && wasExt !== nowExt) {
      throw new BadRequestException(
        `El archivo guardado debe seguir siendo ${wasExt} (llegó ${nowExt})`,
      );
    }

    return this.prisma.sharedFile.update({
      where: { id: fileId },
      data: {
        url: `/uploads/${file.filename}`,
        sizeBytes: file.size,
        mimeType: file.mimetype || current.mimeType,
        uploadedById: req.user.id,
      },
    });
  }

  @Delete(':id/files/:fileId')
  async removeFile(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    if (!this.canEdit(req.user)) throw new ForbiddenException();
    const file = await this.prisma.sharedFile.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });
    if (!file || file.folderId !== id) throw new NotFoundException();
    assertSameTenant(req.user, file.folder.organizationId);
    this.assertEntity(req.user, file.folder.entity);
    await this.prisma.sharedFile.delete({ where: { id: fileId } });
    return { ok: true };
  }
}
