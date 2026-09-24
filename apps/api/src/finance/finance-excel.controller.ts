import { Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertEventNotClosed } from '../common/event-guards';
import { canAccessEventOps, PERMISSIONS, hasPermission, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { FinanceExcelService } from './finance-excel.service';
import { ExcelPdfService } from '../uploads/excel-pdf.service';
import { uploadRoot } from '../uploads/upload-storage';
import { join } from 'path';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

type AuthUser = { id: string; roleKey: string; permissions: string[]; entities: string[]; fullName?: string | null };

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceExcelController {
  constructor(
    private prisma: PrismaService,
    private financeExcel?: FinanceExcelService,
    private excelPdf?: ExcelPdfService,
  ) {}

  /** Genera corrida financiera desde el machote estándar si no existe aún. */
  @Post('event/:eventId/generate')
  async generateCorrida(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string, @Body() _body?: {}) {
    const role = req.user.roleKey as RoleKey;
    if (!hasPermission(role, req.user.permissions || [], PERMISSIONS.FINANCE_EDIT)) {
      throw new ForbiddenException('Sin permiso para editar finanzas');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ForbiddenException('Evento no encontrado');
    if (!canAccessEventOps(req.user.entities as EntityKey[], role as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertEventNotClosed(event.status);

    // No sobrescribir si ya hay corrida
    const existing = await this.prisma.eventFile.findFirst({ where: { eventId, module: 'finance', deletedAt: null } });
    if (existing) return { skipped: true, reason: 'existing' };

    const srcPath = join(uploadRoot, 'format-corrida.xlsx');
    const svc = this.financeExcel || new FinanceExcelService();
    const { excelPath } = await svc.buildFromTemplate(srcPath, event.name);
    const buf = readFileSync(excelPath);
    const name = `CORRIDA ${event.name}.xlsx`;
    const excelFile = await this.prisma.eventFile.create({
      data: {
        eventId: event.id,
        fileName: name,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        url: `/uploads/${excelPath.split('/').pop()}`,
        kind: 'excel',
        module: 'finance',
        updatedById: req.user.id,
        sha256: createHash('sha256').update(buf).digest('hex'),
      },
    });
    const pdfSvc = this.excelPdf || new ExcelPdfService();
    const { url } = await pdfSvc.generate(excelFile.id, excelFile.version, excelPath, {
      eventName: event.name,
      entity: event.entity,
      fileName: name,
      exportedBy: req.user.fullName || null,
    });
    return { url, fileId: excelFile.id, excelUrl: excelFile.url };
  }
}

