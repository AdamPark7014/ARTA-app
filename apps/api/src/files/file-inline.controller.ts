import { Controller, Get, NotFoundException, Param, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';
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

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileInlineController {
  constructor(private prisma: PrismaService) {}

  /** In-app bytes for viewing/editing (inline). Not a "download original" action. */
  @Get(':id/inline')
  async inline(@Req() req: { user: AuthUser }, @Res() res: Response, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    if (file.event) {
      if (
        !canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, file.event.entity as EntityKey)
      ) {
        res.status(403).send('Sin acceso a este evento');
        return;
      }
      assertSameTenant(req.user, file.event.organizationId);
    }
    const rel = String(file.url || '').replace(/^\/uploads\//, '');
    const abs = join(uploadRoot, rel);
    if (!abs.startsWith(uploadRoot) || !existsSync(abs)) {
      throw new NotFoundException('Archivo no está en disco');
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName || 'archivo')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(readFileSync(abs));
  }
}

