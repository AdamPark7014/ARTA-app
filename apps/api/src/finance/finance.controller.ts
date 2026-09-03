import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DocType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, canAccessEventOps, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { calcProgress } from '../common/checklist-progress';
import { diffFinanceRows } from '../common/doc-diff';
import { actorFrom, RevisionService } from '../common/revisions/revision.service';
import { withServerTotals, type FinancePayload } from './finance-totals';

type AuthUser = {
  id: string;
  roleKey: string;
  permissions: string[];
  entities: string[];
  organizationId?: string | null;
};

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private prisma: PrismaService,
    private revisions: RevisionService,
  ) {}

  private async assertEventOps(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ForbiddenException('Evento no encontrado');
    assertSameTenant(user, event.organizationId);
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return event;
  }

  private assertFinanceView(user: AuthUser) {
    const role = user.roleKey as RoleKey;
    if (
      !hasPermission(role, user.permissions, PERMISSIONS.FINANCE_VIEW) &&
      !hasPermission(role, user.permissions, PERMISSIONS.FINANCE_EDIT)
    ) {
      throw new ForbiddenException('Sin permiso para ver finanzas');
    }
  }

  /** Mirror FinanceRun into CORRIDA_FINANCIERA checklist checks */
  private async syncCorridaChecklist(eventId: string, data: FinancePayload, locked: boolean) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { eventId, template: { key: 'CORRIDA_FINANCIERA' } },
      include: { template: true },
    });
    if (!instance) return;

    const income = Number(data.totalIncome || 0);
    const expense = Number(data.totalExpense || 0);
    const rows = data.rows || [];
    const flags: Record<string, boolean> = {
      'Presupuesto cargado': rows.length > 0,
      'Ingresos capturados': income > 0,
      'Egresos capturados': expense > 0,
      'Cierre cuadrado': locked || (rows.length > 0 && income >= 0 && expense >= 0),
    };

    const root = (instance.dataJson || { sections: [] }) as {
      sections?: Array<{
        id: string;
        title: string;
        items?: Array<{ id: string; label: string; type?: string; done?: boolean; value?: unknown }>;
      }>;
    };

    const sections = (root.sections || []).map((s) => ({
      ...s,
      items: (s.items || []).map((it) => {
        if (it.label in flags) return { ...it, done: flags[it.label] };
        return it;
      }),
    }));

    // ensure summary section with live totals
    let nextSections = sections;
    const summaryIdx = nextSections.findIndex((s) => s.id === 'resumen_corrida');
    const summarySection = {
      id: 'resumen_corrida',
      title: 'Resumen (sync corrida)',
      items: [
        { id: 'total_ingreso', label: 'Total ingresos', type: 'number', value: income },
        { id: 'total_egreso', label: 'Total egresos', type: 'number', value: expense },
        { id: 'neto', label: 'Neto', type: 'number', value: income - expense },
        { id: 'filas', label: 'Filas en corrida', type: 'number', value: rows.length },
      ],
    };
    if (summaryIdx >= 0) nextSections[summaryIdx] = summarySection;
    else nextSections = [...nextSections, summarySection];

    // Misma fórmula que el resto del sistema (una sola implementación).
    const progressPct = calcProgress({ sections: nextSections });

    await this.prisma.checklistInstance.update({
      where: { id: instance.id },
      data: {
        dataJson: { sections: nextSections } as Prisma.InputJsonValue,
        progressPct,
        lastEditedAt: new Date(),
      },
    });
  }

  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    this.assertFinanceView(req.user);
    await this.assertEventOps(req.user, eventId);
    return this.prisma.financeRun.findMany({ where: { eventId } });
  }

  @Post('advances')
  async createAdvance(
    @Req() req: { user: AuthUser },
    @Body() body: { eventId: string; label?: string; amount?: number; fileUrl: string },
  ) {
    if (
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.FINANCE_EDIT) &&
      !hasPermission(req.user.roleKey as RoleKey, req.user.permissions, PERMISSIONS.FINANCE_VIEW)
    ) {
      throw new ForbiddenException('Sin permiso para registrar anticipos');
    }
    const event = await this.assertEventOps(req.user, body.eventId);
    assertEventNotClosed(event.status);
    return this.prisma.paymentProof.create({
      data: {
        eventId: body.eventId,
        label: body.label || 'Anticipo',
        amount: body.amount,
        fileUrl: body.fileUrl,
        uploadedById: req.user.id,
      },
    });
  }

  @Get('advances/event/:eventId')
  async advances(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    this.assertFinanceView(req.user);
    await this.assertEventOps(req.user, eventId);
    return this.prisma.paymentProof.findMany({
      where: { eventId, purchaseOrderId: null },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { fullName: true } } },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
    @Body() body: { dataJson?: object; title?: string; locked?: boolean },
  ) {
    const role = req.user.roleKey as RoleKey;
    if (!hasPermission(role, req.user.permissions, PERMISSIONS.FINANCE_EDIT)) {
      throw new ForbiddenException(
        'Solo gerencia de Arta y dirección general pueden editar corrida financiera',
      );
    }
    const existing = await this.prisma.financeRun.findUnique({
      where: { id },
      include: { event: { select: { status: true } } },
    });
    if (!existing) throw new ForbiddenException('Corrida no encontrada');
    await this.assertEventOps(req.user, existing.eventId);
    assertEventNotClosed(existing.event.status);

    /*
     * Sellar y editar son acciones distintas.
     *
     * Antes la guarda era `if (existing.locked && body.locked !== false)`, así
     * que mandando `{ locked: false, dataJson: {...} }` se desbloqueaba y se
     * editaba en la MISMA petición: el sello no protegía nada. Ahora una
     * corrida sellada no acepta cambios, y quitar el sello es una operación
     * aparte reservada a dirección, igual que reabrir un evento.
     */
    const wantsUnlock = body.locked === false;
    const wantsContentChange = body.dataJson !== undefined || body.title !== undefined;

    if (existing.locked) {
      if (wantsContentChange) {
        throw new ForbiddenException(
          'Corrida sellada — quita el sello primero (solo dirección) y vuelve a intentarlo',
        );
      }
      if (wantsUnlock && role !== 'dir_general' && role !== 'super_admin') {
        throw new ForbiddenException('Solo dirección general puede quitar el sello de una corrida');
      }
    }

    let dataJson = body.dataJson as FinancePayload | undefined;
    /*
     * Los totales SIEMPRE los recalcula el servidor. Antes solo se recalculaban
     * `if (dataJson.rows)`, así que mandando el payload sin `rows` se persistían
     * `totalIncome`/`totalExpense` inventados que el dashboard daba por buenos.
     */
    if (dataJson) dataJson = withServerTotals(dataJson);

    const updated = await this.prisma.financeRun.update({
      where: { id },
      data: {
        dataJson: dataJson as Prisma.InputJsonValue | undefined,
        title: body.title,
        locked: body.locked,
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
        revision: { increment: 1 },
      },
      include: { event: { select: { organizationId: true } } },
    });

    // La corrida deja de ser el único documento sin autor ni historial.
    if (dataJson) {
      await this.revisions.record({
        organizationId: updated.event?.organizationId || '(sin-organizacion)',
        eventId: updated.eventId,
        docType: DocType.FINANCE,
        docId: updated.id,
        revision: updated.revision,
        snapshotJson: dataJson as unknown,
        diff: diffFinanceRows(existing.dataJson, dataJson),
        note: body.title ? `Título: ${body.title}` : null,
        actor: actorFrom(req as never),
      });

      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          organizationId: updated.event?.organizationId,
          action: 'finance.update',
          resource: 'FinanceRun',
          resourceId: id,
          metaJson: { totalIncome: dataJson.totalIncome, totalExpense: dataJson.totalExpense },
          ip: req.ip,
          userAgent: req.headers?.['user-agent']?.slice(0, 300),
        },
      });
    }

    const payload = (dataJson || updated.dataJson) as FinancePayload;
    await this.syncCorridaChecklist(updated.eventId, withServerTotals(payload), updated.locked);

    return updated;
  }

  /**
   * Quitar el sello de una corrida — acción propia, no un campo del PATCH.
   *
   * Antes bastaba mandar `{ locked: false, dataJson: {...} }` para desbloquear
   * y editar en la misma petición: el sello no protegía nada y nadie quedaba
   * registrado.
   */
  @Post(':id/unlock')
  async unlock(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const role = req.user.roleKey as RoleKey;
    if (role !== 'dir_general' && role !== 'super_admin') {
      throw new ForbiddenException('Solo dirección general puede quitar el sello de una corrida');
    }
    const reason = (body.reason || '').trim();
    if (reason.length < 5) {
      throw new BadRequestException('Hace falta un motivo para quitar el sello');
    }

    const existing = await this.prisma.financeRun.findUnique({
      where: { id },
      include: { event: { select: { status: true, organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Corrida no encontrada');
    await this.assertEventOps(req.user, existing.eventId);

    const updated = await this.prisma.financeRun.update({
      where: { id },
      data: {
        locked: false,
        status: 'DRAFT',
        reopenReason: reason,
        revision: { increment: 1 },
        lastEditedById: req.user.id,
        lastEditedAt: new Date(),
      },
    });

    await this.revisions.record({
      organizationId: existing.event?.organizationId || '(sin-organizacion)',
      eventId: existing.eventId,
      docType: DocType.FINANCE,
      docId: id,
      revision: updated.revision,
      fromStatus: 'SEALED',
      toStatus: 'DRAFT',
      note: `Sello retirado: ${reason}`,
      actor: actorFrom(req as never),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: existing.event?.organizationId,
        action: 'finance.unlock',
        resource: 'FinanceRun',
        resourceId: id,
        metaJson: { reason },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });

    return updated;
  }

  /** Historial de la corrida, con el diff de renglones. */
  @Get(':id/revisions')
  async revisionHistory(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertFinanceView(req.user);
    const run = await this.prisma.financeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    await this.assertEventOps(req.user, run.eventId);
    return this.revisions.history(DocType.FINANCE, id);
  }
}
