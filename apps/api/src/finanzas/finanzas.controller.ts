import { Controller, ForbiddenException, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { entityScope } from '../common/entity-scope';
import { hasPermission, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';

type AuthUser = {
  id: string;
  roleKey: string;
  entities?: string[] | null;
  permissions?: string[] | null;
  organizationId?: string | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  ADENDUM: 'Adendum',
};

function parseDay(raw: string | undefined, fallback: Date) {
  const date = raw ? new Date(raw) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  // Una celda que empieza con =, +, - o @ Excel la correría como fórmula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Finanzas: lo contable de Arta y Auditorio en un solo lugar. Lo ven Paula, Chacho y Arturo; Paula
 * les rinde cuentas (01-11-2026). Junta lo que ya existe: OC, comprobantes, anticipos y adendums.
 * La corrida no entra: esa es de dirección, Leida y Sol.
 */
@Controller('finanzas')
@UseGuards(JwtAuthGuard)
export class FinanzasController {
  constructor(private readonly prisma: PrismaService) {}

  private assertAccess(user: AuthUser) {
    if (!hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.FINANZAS_VIEW)) {
      throw new ForbiddenException('Finanzas no está a tu alcance');
    }
  }

  private async load(user: AuthUser, entity: string | undefined, from?: string, to?: string) {
    this.assertAccess(user);
    const scope = entityScope(user as never, entity) as EntityKey[];
    const organizationId = tenantIdOf(user as never);
    const now = new Date();
    const start = parseDay(from, new Date(now.getFullYear(), now.getMonth(), 1));
    const end = parseDay(to, now);
    end.setHours(23, 59, 59, 999);

    const orders = await this.prisma.purchaseOrder.findMany({
      where: { event: { organizationId, entity: { in: scope } }, status: { in: ['PENDING_AUTH', 'AUTHORIZED', 'PAID'] } },
      select: {
        id: true,
        rubro: true,
        vendorName: true,
        amount: true,
        currency: true,
        status: true,
        paymentMethod: true,
        authorizedAt: true,
        paidAt: true,
        createdAt: true,
        adendumPerson: true,
        adendumAccount: true,
        adendumFileUrl: true,
        adendumFileName: true,
        event: { select: { id: true, name: true, entity: true, startsAt: true } },
        createdBy: { select: { fullName: true } },
        proofs: { select: { id: true, fileUrl: true, label: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const advances = await this.prisma.paymentProof.findMany({
      where: { purchaseOrderId: null, advanceStatus: { in: ['APPROVED', 'PAID'] }, entity: { in: scope } },
      select: {
        id: true,
        label: true,
        note: true,
        amount: true,
        advanceStatus: true,
        eventId: true,
        entity: true,
        paidAt: true,
        createdAt: true,
        paidProofUrl: true,
        fileUrl: true,
        uploadedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const eventIds = [...new Set(advances.map((a) => a.eventId).filter((id): id is string => !!id))];
    const events = eventIds.length
      ? await this.prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } })
      : [];
    return { orders, advances, eventName: new Map(events.map((e) => [e.id, e.name])), start, end };
  }

  @Get('resumen')
  async resumen(
    @Req() req: { user: AuthUser },
    @Query('entity') entity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { orders, advances, eventName, start, end } = await this.load(req.user, entity, from, to);
    const money = (n: unknown) => Number(n ?? 0);
    const inPeriod = (d?: Date | null) => !!d && d >= start && d <= end;
    const order = (o: (typeof orders)[number]) => ({
      id: o.id,
      rubro: o.rubro,
      vendorName: o.vendorName,
      amount: money(o.amount),
      currency: o.currency,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentLabel: PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
      authorizedAt: o.authorizedAt,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
      requestedBy: o.createdBy?.fullName ?? null,
      event: o.event,
      proofs: o.proofs,
      needsProof: o.paymentMethod !== 'EFECTIVO' && o.proofs.length === 0,
      adendum:
        o.paymentMethod === 'ADENDUM'
          ? { person: o.adendumPerson, account: o.adendumAccount, fileUrl: o.adendumFileUrl, fileName: o.adendumFileName }
          : null,
    });

    const toPay = orders.filter((o) => o.status === 'AUTHORIZED');
    const paid = orders.filter((o) => o.status === 'PAID' && inPeriod(o.paidAt));
    const pendingAuth = orders.filter((o) => o.status === 'PENDING_AUTH');
    const advancesToPay = advances.filter((a) => a.advanceStatus === 'APPROVED');
    const advancesPaid = advances.filter((a) => a.advanceStatus === 'PAID' && inPeriod(a.paidAt));
    const sum = (rows: Array<{ amount: unknown }>) => rows.reduce((total, r) => total + money(r.amount), 0);

    const byEvent = new Map<string, { id: string; name: string; entity: string; startsAt: Date | null; toPay: number; paid: number; pendingAuth: number }>();
    for (const o of orders) {
      const row =
        byEvent.get(o.event.id) ??
        { id: o.event.id, name: o.event.name, entity: o.event.entity, startsAt: o.event.startsAt, toPay: 0, paid: 0, pendingAuth: 0 };
      if (o.status === 'AUTHORIZED') row.toPay += money(o.amount);
      else if (o.status === 'PAID') row.paid += money(o.amount);
      else row.pendingAuth += money(o.amount);
      byEvent.set(o.event.id, row);
    }

    return {
      period: { from: start, to: end },
      kpis: {
        toPay: { amount: sum(toPay), count: toPay.length },
        transfers: { count: toPay.filter((o) => o.paymentMethod !== 'EFECTIVO').length },
        paid: { amount: sum(paid), count: paid.length },
        pendingAuth: { amount: sum(pendingAuth), count: pendingAuth.length },
        advancesToPay: { amount: sum(advancesToPay), count: advancesToPay.length },
        missingProof: { count: orders.filter((o) => o.status === 'PAID' && o.paymentMethod !== 'EFECTIVO' && o.proofs.length === 0).length },
      },
      toPay: toPay.map(order),
      paid: paid.map(order),
      adendums: orders.filter((o) => o.paymentMethod === 'ADENDUM').map(order),
      advances: [...advancesToPay, ...advancesPaid].map((a) => ({
        id: a.id,
        label: a.label || a.note || 'Anticipo',
        amount: money(a.amount),
        status: a.advanceStatus,
        entity: a.entity,
        event: a.eventId ? { id: a.eventId, name: eventName.get(a.eventId) ?? null } : null,
        requestedBy: a.uploadedBy?.fullName ?? null,
        paidAt: a.paidAt,
        proofUrl: a.paidProofUrl || a.fileUrl,
      })),
      byEvent: [...byEvent.values()].sort((a, b) => b.toPay + b.paid - (a.toPay + a.paid)),
    };
  }

  /** Lo pagado en el periodo, para el contador. */
  @Get('pagos.csv')
  async csv(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('entity') entity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { orders, start, end } = await this.load(req.user, entity, from, to);
    const rows = orders.filter((o) => o.status === 'PAID' && !!o.paidAt && o.paidAt >= start && o.paidAt <= end);
    const lines = [
      ['Fecha de pago', 'Negocio', 'Evento', 'Proveedor o persona', 'Rubro', 'Forma de pago', 'Cuenta', 'Monto', 'Moneda', 'Comprobantes', 'Pidió'],
      ...rows.map((o) => [
        o.paidAt?.toISOString().slice(0, 10),
        o.event.entity === 'ARTA' ? 'Arta' : 'Auditorio',
        o.event.name,
        o.paymentMethod === 'ADENDUM' ? o.adendumPerson : o.vendorName,
        o.rubro,
        PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod,
        o.adendumAccount,
        Number(o.amount).toFixed(2),
        o.currency,
        o.proofs.length,
        o.createdBy?.fullName,
      ]),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pagos.csv"');
    // El BOM hace que Excel lea bien los acentos.
    res.send(`﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`);
  }
}
