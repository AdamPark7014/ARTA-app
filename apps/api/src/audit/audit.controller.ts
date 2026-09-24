import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, PERMISSIONS, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from '../uploads/upload-storage';
import { PdfBrandingService } from '../uploads/pdf-branding.service';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService, private branding: PdfBrandingService = new PdfBrandingService()) {}

  @Get()
  async list(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('take') take?: string,
  ) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección ve audit log');
    }
    const limit = Math.min(Number(take) || 100, 300);
    // AuditLog no tiene organizationId propio; se acota por el org del autor.
    // super_admin ve todo (incluye eventos de sistema con userId null).
    const isSuper = req.user.roleKey === 'super_admin';
    return this.prisma.auditLog.findMany({
      where: {
        ...(resource ? { resource } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(isSuper ? {} : { user: { organizationId: tenantIdOf(req.user) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  /** PDF con el historial (DocRevision) de un documento del evento, con marca. */
  @Get('resource/:docType/:docId/pdf')
  async historyPdf(
    @Req() req: { user: { roleKey: string; permissions: string[]; organizationId?: string | null } },
    @Param('docType') docType: 'CHECKLIST' | 'FILE' | 'DOCUMENT' | 'FINANCE',
    @Param('docId') docId: string,
  ) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.USERS_MANAGE) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.EVERYTHING)
    ) {
      throw new ForbiddenException('Solo dirección descarga historial');
    }
    const rows = await this.prisma.docRevision.findMany({
      where: { docType, docId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { fullName: true } }, event: { select: { id: true, name: true, entity: true } } },
      take: 500,
    });
    if (!rows.length) throw new NotFoundException('Sin historial');
    const event = rows[0].event!;

    const dir = join(uploadRoot, 'documents');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const out = join(dir, `hist-${docType.toLowerCase()}-${docId}-${Date.now()}.pdf`);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
      const stream = createWriteStream(out);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      doc.on('error', reject);
      const left = 56;
      const right = 556;
      const meta = {
        entity: event.entity,
        eventName: event.name,
        fileName: `Historial ${docType.toLowerCase()}`,
        version: rows.length,
        generatedBy: null,
        generatedAt: new Date(),
      } as const;
      this.branding.drawHeaderFooter(doc, meta, right - left, 100);
      doc.moveDown(3.2);
      doc.fillColor('#111').fontSize(14).text(`Historial ${docType.toLowerCase()}`, { width: right - left });
      doc.moveDown(0.6);
      for (const r of rows) {
        const when = new Date(r.createdAt).toLocaleString('es-MX');
        const who = r.author?.fullName || '—';
        doc
          .fillColor('#6b6b72')
          .fontSize(9)
          .text(`${when} · ${who}`, { width: right - left });
        const status =
          r.fromStatus || r.toStatus
            ? ` · estado: ${r.fromStatus || '—'} → ${r.toStatus || '—'}`
            : '';
        const note = r.note ? ` · nota: ${r.note}` : '';
        doc.fillColor('#222').fontSize(10).text(`Rev. ${r.revision}${status}${note}`, { width: right - left });
        doc.moveDown(0.4);
      }
      doc.end();
    });
    return { url: `/uploads/documents/${out.split('/').pop()}` };
  }
}
