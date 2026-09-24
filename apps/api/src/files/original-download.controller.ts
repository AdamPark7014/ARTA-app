import { Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { type RoleKey } from '../common/rbac/roles';
import { DirectionService } from '../common/rbac/direction.service';

type AuthUser = { id: string; roleKey: string; organizationId?: string | null };

@Controller('files')
@UseGuards(JwtAuthGuard)
export class OriginalDownloadController {
  constructor(private prisma: PrismaService, private direction: DirectionService) {}

  /** Direction-only: request to download original editable file. Audited. */
  @Post(':id/download-original')
  async downloadOriginal(@Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> }, @Param('id') id: string) {
    const file = await this.prisma.eventFile.findUnique({ where: { id } });
    if (!file) throw new ForbiddenException('Archivo no encontrado');
    const event = file.eventId ? await this.prisma.event.findUnique({ where: { id: file.eventId } }) : null;
    const ok = await this.direction.isDirection(req.user, event?.organizationId ?? req.user.organizationId ?? null);
    if (!ok) {
      throw new ForbiddenException('Solo dirección puede descargar originales');
    }
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: event?.organizationId ?? req.user.organizationId ?? null,
        action: 'download_original',
        resource: 'EventFile',
        resourceId: id,
        metaJson: { fileName: file.fileName, url: file.url },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });
    // The UI should use this endpoint to decide permission; returning the URL for the browser to fetch.
    return { url: file.url, fileName: file.fileName };
  }
}

