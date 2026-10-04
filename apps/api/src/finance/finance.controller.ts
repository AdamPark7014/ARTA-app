import {
  BadRequestException,
  Body,
  ConflictException,
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
import { AdvanceStatus, DocType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, canAccessEventOps, isDirectionRole, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { calcProgress } from '../common/checklist-progress';
import { diffFinanceRows } from '../common/doc-diff';
import { actorFrom, RevisionService } from '../common/revisions/revision.service';
import { withServerTotals, type FinancePayload } from './finance-totals';
import { NotificationsService } from '../notifications/notifications.service';
import { shortName } from '../notifications/notification-push-meta';

type AuthUser = {
  id: string;
  roleKey: string;
  permissions: string[];
  entities: string[];
  organizationId?: string | null;
  fullName?: string;
};

type AuditReq = { user: AuthUser; ip?: string; headers?: Record<string, string> };

type Person = { id: string; roleKey: string; entities: string[]; permissions: string[] };

/**
 * Misma forma en todas las rutas de anticipos (web y apps leen una sola).
 * `PaymentProof.eventId` no es relación en Prisma: `event` se pega con `withEvents`.
 */
const ADVANCE_INCLUDE = {
  uploadedBy: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  paidBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentProofInclude;

const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  PENDING: 'pendiente',
  APPROVED: 'aprobado',
  REJECTED: 'rechazado',
  PAID: 'pagado',
};

/** Quien autoriza OC en la entidad del evento (mismas reglas que en órdenes de compra). */
export function canApproveAdvance(p: Person, entity: string): boolean {
  const role = p.roleKey as RoleKey;
  if (!hasPermission(role, p.permissions, PERMISSIONS.PO_AUTHORIZE)) return false;
  if (!canAccessEventOps(p.entities as EntityKey[], role, entity as EntityKey)) return false;
  if (role === 'gerente_arta' && entity !== 'ARTA') return false;
  if (role === 'dir_auditorio' && entity !== 'EXPLANADA') return false;
  return true;
}

/** Quien marca OC pagadas o edita finanzas en la entidad del evento. */
export function canPayAdvance(p: Person, entity: string): boolean {
  const role = p.roleKey as RoleKey;
  if (
    !hasPermission(role, p.permissions, PERMISSIONS.PO_MARK_PAID) &&
    !hasPermission(role, p.permissions, PERMISSIONS.FINANCE_EDIT)
  ) {
    return false;
  }
  return canAccessEventOps(p.entities as EntityKey[], role, entity as EntityKey);
}

function mxn(amount: Prisma.Decimal | number | null | undefined) {
  return amount != null
    ? Number(amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
    : 'Sin monto';
}

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private prisma: PrismaService,
    private revisions: RevisionService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Aviso de finanzas: a quien puede editar finanzas en la entidad del evento
   * (y al equipo del evento cuando `team`), nunca al que hizo el cambio.
   */
  private async notifyFinance(
    user: AuthUser & { fullName?: string },
    event: { id: string; name: string; entity: string; organizationId: string | null },
    type: string,
    title: string,
    body: string,
    team = false,
  ) {
    try {
      const people = await this.prisma.user.findMany({
        where: { active: true, ...(event.organizationId ? { organizationId: event.organizationId } : {}) },
        select: { id: true, roleKey: true, entities: true, permissions: true },
      });
      const editors = people
        .filter((p) => p.id !== user.id)
        .filter((p) => hasPermission(p.roleKey as RoleKey, p.permissions, PERMISSIONS.FINANCE_EDIT))
        .filter((p) => canAccessEventOps(p.entities as EntityKey[], p.roleKey as RoleKey, event.entity as EntityKey))
        .map((p) => p.id);
      const input = {
        organizationId: event.organizationId,
        actorId: user.id,
        type,
        title,
        body,
        linkUrl: `/events/${event.id}?tab=finance`,
        entity: event.entity as EntityKey,
      };
      if (team) await this.notifications.notifyEventTeam(event.id, input, editors);
      else await this.notifications.notifyMany(editors.map((userId) => ({ ...input, userId })));
    } catch {
      /* un aviso que falla no tumba la operación */
    }
  }

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

  private async orgPeople(organizationId: string | null): Promise<Person[]> {
    return this.prisma.user.findMany({
      where: { active: true, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, roleKey: true, entities: true, permissions: true },
    });
  }

  /** Un anticipo (PaymentProof sin OC y con estado) que el usuario puede ver. */
  private async loadAdvance(user: AuthUser, id: string) {
    const proof = await this.prisma.paymentProof.findUnique({ where: { id } });
    if (!proof || proof.purchaseOrderId || !proof.advanceStatus || !proof.eventId) {
      throw new NotFoundException('Anticipo no encontrado');
    }
    const event = await this.prisma.event.findUnique({
      where: { id: proof.eventId },
      select: { id: true, name: true, entity: true, status: true, organizationId: true },
    });
    if (!event) throw new NotFoundException('Anticipo no encontrado');
    assertSameTenant(user, event.organizationId);
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return { ...proof, event, advanceStatus: proof.advanceStatus };
  }

  /** Pega `event { id, name, entity }` a cada anticipo (null si el evento ya no existe). */
  private async withEvents<T extends { eventId: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.eventId).filter((id): id is string => !!id))];
    const events = ids.length
      ? await this.prisma.event.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, entity: true } })
      : [];
    const byId = new Map(events.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...r, event: (r.eventId && byId.get(r.eventId)) || null }));
  }

  private async withAdvanceInclude(id: string) {
    const row = await this.prisma.paymentProof.findUnique({ where: { id }, include: ADVANCE_INCLUDE });
    if (!row) throw new NotFoundException('Anticipo no encontrado');
    return (await this.withEvents([row]))[0];
  }

  private async auditAdvance(
    req: AuditReq,
    organizationId: string | null,
    action: string,
    id: string,
    metaJson: Prisma.InputJsonObject,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId,
        action,
        resource: 'PaymentProof',
        resourceId: id,
        metaJson,
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });
  }

  /** Avisos de anticipos: siempre llevan a la tarjeta en `/advances`. Uno que falla no tumba la operación. */
  private async notifyAdvance(
    actor: AuthUser,
    event: { name: string; entity: string; organizationId: string | null },
    advanceId: string,
    items: Array<{ userIds: string[]; type: string; title: string; body: string }>,
  ) {
    try {
      const seen = new Set<string>([actor.id]);
      const inputs: Parameters<NotificationsService['notifyMany']>[0] = [];
      for (const item of items) {
        for (const userId of item.userIds) {
          if (!userId || seen.has(userId)) continue;
          seen.add(userId);
          inputs.push({
            userId,
            organizationId: event.organizationId,
            actorId: actor.id,
            type: item.type,
            title: item.title,
            body: item.body,
            linkUrl: `/advances?advance=${advanceId}`,
            entity: event.entity as EntityKey,
          });
        }
      }
      if (inputs.length) await this.notifications.notifyMany(inputs);
    } catch {
      /* un aviso que falla no tumba la operación */
    }
  }

  private assertAdvanceStatus(current: AdvanceStatus, expected: AdvanceStatus, verb: string) {
    if (current !== expected) {
      throw new ConflictException(
        `Este anticipo ya está ${ADVANCE_STATUS_LABEL[current]}; solo se puede ${verb} uno ${ADVANCE_STATUS_LABEL[expected]}`,
      );
    }
  }

  /**
   * Mueve el estado solo si sigue en `from`: dos personas resolviendo a la vez
   * no pueden aprobar y rechazar el mismo anticipo.
   */
  private async moveAdvance(
    id: string,
    from: AdvanceStatus,
    verb: string,
    data: Prisma.PaymentProofUncheckedUpdateManyInput,
  ) {
    const { count } = await this.prisma.paymentProof.updateMany({ where: { id, advanceStatus: from }, data });
    if (count === 0) {
      const now = await this.prisma.paymentProof.findUnique({ where: { id }, select: { advanceStatus: true } });
      this.assertAdvanceStatus(now?.advanceStatus ?? from, from, verb);
      throw new ConflictException('El anticipo cambió mientras lo resolvías; vuelve a cargarlo');
    }
    return this.withAdvanceInclude(id);
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

  /** Solicitar un anticipo: nace `PENDING` y le avisa a quien lo puede aprobar. */
  @Post('advances')
  async createAdvance(
    @Req() req: AuditReq,
    @Body() body: { eventId: string; label?: string; amount?: number | string; note?: string; fileUrl?: string },
  ) {
    const role = req.user.roleKey as RoleKey;
    if (
      (!hasPermission(role, req.user.permissions, PERMISSIONS.FINANCE_EDIT) &&
        !hasPermission(role, req.user.permissions, PERMISSIONS.FINANCE_VIEW)) ||
      !hasPermission(role, req.user.permissions, PERMISSIONS.CHECKLIST_EDIT)
    ) {
      throw new ForbiddenException('Sin permiso para solicitar anticipos');
    }
    const amount = Number(body?.amount);
    if (body?.amount == null || body.amount === '' || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Escribe el monto del anticipo (mayor a cero)');
    }
    if (!body.eventId) throw new BadRequestException('Elige el evento del anticipo');
    const event = await this.assertEventOps(req.user, body.eventId);
    assertEventNotClosed(event.status);

    const row = await this.prisma.paymentProof.create({
      data: {
        eventId: body.eventId,
        label: body.label?.trim() || 'Anticipo',
        amount,
        note: body.note?.trim() || null,
        fileUrl: body.fileUrl?.trim() || null,
        uploadedById: req.user.id,
        advanceStatus: 'PENDING',
      },
      include: ADVANCE_INCLUDE,
    });
    const created = { ...row, event: { id: event.id, name: event.name, entity: event.entity } };
    await this.auditAdvance(req, event.organizationId, 'advance.request', created.id, {
      eventId: event.id,
      label: created.label,
      amount,
      hasFile: !!created.fileUrl,
    });

    const approvers = (await this.orgPeople(event.organizationId))
      .filter((p) => canApproveAdvance(p, event.entity))
      .map((p) => p.id);
    await this.notifyAdvance(req.user, event, created.id, [
      {
        userIds: approvers,
        type: 'advance.requested',
        title: `${shortName(req.user.fullName) || 'Alguien del equipo'} pidió un anticipo`,
        body: `${created.label} · ${mxn(amount)} · ${event.name}`,
      },
    ]);
    return created;
  }

  @Get('advances/event/:eventId')
  async advances(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    this.assertFinanceView(req.user);
    const event = await this.assertEventOps(req.user, eventId);
    const rows = await this.prisma.paymentProof.findMany({
      where: { eventId, purchaseOrderId: null },
      orderBy: { createdAt: 'desc' },
      include: ADVANCE_INCLUDE,
    });
    return rows.map((r) => ({ ...r, event: { id: event.id, name: event.name, entity: event.entity } }));
  }

  /**
   * Lo que yo puedo resolver: `PENDING` donde apruebo (nunca lo que pedí yo) y
   * `APPROVED` donde pago. Solo eventos abiertos de mi organización.
   */
  @Get('advances/pending')
  async pendingAdvances(@Req() req: { user: AuthUser }) {
    const me = req.user;
    const events = await this.prisma.event.findMany({
      where: {
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        ...(me.roleKey === 'super_admin' ? {} : { organizationId: tenantIdOf(me) }),
      },
      select: { id: true, name: true, entity: true },
    });
    const byId = new Map(events.map((e) => [e.id, e]));
    if (!byId.size) return [];
    const rows = await this.prisma.paymentProof.findMany({
      where: {
        purchaseOrderId: null,
        advanceStatus: { in: ['PENDING', 'APPROVED'] },
        eventId: { in: [...byId.keys()] },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: ADVANCE_INCLUDE,
    });
    return rows
      .map((r) => ({ ...r, event: byId.get(r.eventId || '') || null }))
      .filter((r) => {
        if (!r.event) return false;
        if (r.advanceStatus === 'PENDING') return r.uploadedById !== me.id && canApproveAdvance(me, r.event.entity);
        return canPayAdvance(me, r.event.entity);
      });
  }

  /** Mis solicitudes, todas, más recientes primero. */
  @Get('advances/mine')
  async myAdvances(@Req() req: { user: AuthUser }) {
    const rows = await this.prisma.paymentProof.findMany({
      where: { uploadedById: req.user.id, purchaseOrderId: null, advanceStatus: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: ADVANCE_INCLUDE,
    });
    return this.withEvents(rows);
  }

  @Patch('advances/:id/approve')
  async approveAdvance(@Req() req: AuditReq, @Param('id') id: string) {
    const advance = await this.loadAdvance(req.user, id);
    if (!canApproveAdvance(req.user, advance.event.entity)) {
      throw new ForbiddenException('No puedes aprobar anticipos de esta entidad');
    }
    if (advance.uploadedById === req.user.id) {
      throw new ForbiddenException('No puedes aprobar tu propia solicitud');
    }
    assertEventNotClosed(advance.event.status);
    this.assertAdvanceStatus(advance.advanceStatus, 'PENDING', 'aprobar');

    const updated = await this.moveAdvance(id, 'PENDING', 'aprobar', {
      advanceStatus: 'APPROVED',
      decidedById: req.user.id,
      decidedAt: new Date(),
      rejectReason: null,
    });
    await this.auditAdvance(req, advance.event.organizationId, 'advance.approve', id, {
      eventId: advance.event.id,
      amount: Number(advance.amount ?? 0),
      requestedBy: advance.uploadedById,
    });

    const who = shortName(req.user.fullName) || 'Dirección';
    const detail = `${advance.label || 'Anticipo'} · ${mxn(advance.amount)} · ${advance.event.name}`;
    const payers = (await this.orgPeople(advance.event.organizationId))
      .filter((p) => canPayAdvance(p, advance.event.entity))
      .map((p) => p.id);
    await this.notifyAdvance(req.user, advance.event, id, [
      { userIds: [advance.uploadedById || ''], type: 'advance.approved', title: `${who} aprobó tu anticipo`, body: detail },
      { userIds: payers, type: 'advance.to_pay', title: `Anticipo aprobado por pagar · ${who}`, body: detail },
    ]);
    return updated;
  }

  @Patch('advances/:id/reject')
  async rejectAdvance(@Req() req: AuditReq, @Param('id') id: string, @Body() body: { reason?: string }) {
    const reason = (body?.reason || '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Escribe el motivo del rechazo (mínimo 3 caracteres)');
    }
    const advance = await this.loadAdvance(req.user, id);
    if (!canApproveAdvance(req.user, advance.event.entity)) {
      throw new ForbiddenException('No puedes rechazar anticipos de esta entidad');
    }
    if (advance.uploadedById === req.user.id) {
      throw new ForbiddenException('No puedes resolver tu propia solicitud');
    }
    assertEventNotClosed(advance.event.status);
    this.assertAdvanceStatus(advance.advanceStatus, 'PENDING', 'rechazar');

    const updated = await this.moveAdvance(id, 'PENDING', 'rechazar', {
      advanceStatus: 'REJECTED',
      decidedById: req.user.id,
      decidedAt: new Date(),
      rejectReason: reason,
    });
    await this.auditAdvance(req, advance.event.organizationId, 'advance.reject', id, {
      eventId: advance.event.id,
      amount: Number(advance.amount ?? 0),
      requestedBy: advance.uploadedById,
      reason,
    });

    const who = shortName(req.user.fullName) || 'Dirección';
    await this.notifyAdvance(req.user, advance.event, id, [
      {
        userIds: [advance.uploadedById || ''],
        type: 'advance.rejected',
        title: `${who} rechazó tu anticipo`,
        body: `${advance.label || 'Anticipo'} · ${mxn(advance.amount)} · ${advance.event.name} · Motivo: ${reason}`,
      },
    ]);
    return updated;
  }

  @Patch('advances/:id/paid')
  async markAdvancePaid(@Req() req: AuditReq, @Param('id') id: string, @Body() body: { proofUrl?: string }) {
    const advance = await this.loadAdvance(req.user, id);
    if (!canPayAdvance(req.user, advance.event.entity)) {
      throw new ForbiddenException('No puedes marcar anticipos como pagados');
    }
    assertEventNotClosed(advance.event.status);
    this.assertAdvanceStatus(advance.advanceStatus, 'APPROVED', 'marcar pagado');

    const proofUrl = body?.proofUrl?.trim() || null;
    const updated = await this.moveAdvance(id, 'APPROVED', 'marcar pagado', {
      advanceStatus: 'PAID',
      paidById: req.user.id,
      paidAt: new Date(),
      paidProofUrl: proofUrl,
    });
    await this.auditAdvance(req, advance.event.organizationId, 'advance.pay', id, {
      eventId: advance.event.id,
      amount: Number(advance.amount ?? 0),
      requestedBy: advance.uploadedById,
      hasProof: !!proofUrl,
    });

    const who = shortName(req.user.fullName) || 'Finanzas';
    await this.notifyAdvance(req.user, advance.event, id, [
      {
        userIds: [advance.uploadedById || ''],
        type: 'advance.paid',
        title: 'Tu anticipo ya se pagó',
        body: `${advance.label || 'Anticipo'} · ${mxn(advance.amount)} · ${advance.event.name} · ${who}`,
      },
    ]);
    return updated;
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
      if (wantsUnlock && !isDirectionRole(role)) {
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

    if (!existing.locked && updated.locked) {
      const event = await this.prisma.event.findUnique({ where: { id: updated.eventId } });
      if (event) {
        await this.notifyFinance(
          req.user,
          event,
          'finance.sealed',
          `${shortName((req.user as { fullName?: string }).fullName) || 'Finanzas'} selló la corrida financiera`,
          event.name,
          true,
        );
      }
    }

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
    if (!isDirectionRole(role)) {
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

    const event = await this.prisma.event.findUnique({ where: { id: existing.eventId } });
    if (event) {
      await this.notifyFinance(
        req.user,
        event,
        'finance.unlocked',
        `${shortName((req.user as { fullName?: string }).fullName) || 'Dirección'} quitó el sello de la corrida`,
        `${event.name} · ${reason}`,
        true,
      );
    }

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
