import { Injectable } from '@nestjs/common';
import { ChecklistTemplateKey, EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { financeTotals } from '../finance/finance-totals';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async overview(entity: EntityKey, organizationId: string) {
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86_400_000);
    const day30 = new Date(now.getTime() - 30 * 86_400_000);
    const day90 = new Date(now.getTime() - 90 * 86_400_000);

    const [events, checklists, pos, tasks, financeRuns, recentAudit] = await Promise.all([
      this.prisma.event.findMany({
        where: { entity, organizationId },
        select: {
          id: true,
          name: true,
          artist: true,
          status: true,
          startsAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.checklistInstance.findMany({
        where: { event: { entity, organizationId } },
        select: {
          id: true,
          eventId: true,
          title: true,
          progressPct: true,
          deliveredAt: true,
          authorizedAt: true,
          lastEditedAt: true,
          template: { select: { key: true, name: true } },
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { event: { entity, organizationId } },
        select: {
          id: true,
          eventId: true,
          status: true,
          amount: true,
          createdAt: true,
          authorizedAt: true,
          paidAt: true,
          rubro: true,
          vendorName: true,
        },
      }),
      this.prisma.taskAssignment.findMany({
        where: { event: { entity, organizationId } },
        select: { id: true, status: true, assigneeId: true, dueAt: true },
      }),
      this.prisma.financeRun.findMany({
        where: { event: { entity, organizationId } },
        select: { eventId: true, locked: true, dataJson: true, updatedAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          createdAt: { gte: day30 },
          user: { organizationId },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { fullName: true } } },
      }),
    ]);

    const eventIds = events.map((e) => e.id);
    const advances = eventIds.length
      ? await this.prisma.paymentProof.findMany({
          where: { eventId: { in: eventIds }, purchaseOrderId: null },
          select: { amount: true },
        })
      : [];

    const byStatus = { DRAFT: 0, ACTIVE: 0, CLOSED: 0, CANCELLED: 0 };
    for (const e of events) byStatus[e.status] = (byStatus[e.status] || 0) + 1;

    const progressByEvent = new Map<string, { sum: number; n: number }>();
    const templateAcc: Record<string, { count: number; pendingAuth: number; sum: number }> = {};
    let pendingDelivered = 0;
    let pendingAuthorized = 0;

    for (const c of checklists) {
      const bucket = progressByEvent.get(c.eventId) || { sum: 0, n: 0 };
      bucket.sum += c.progressPct;
      bucket.n += 1;
      progressByEvent.set(c.eventId, bucket);

      const key = c.template?.key || 'CUSTOM';
      if (!templateAcc[key]) templateAcc[key] = { count: 0, pendingAuth: 0, sum: 0 };
      templateAcc[key].count += 1;
      templateAcc[key].sum += c.progressPct;
      if (!c.authorizedAt) templateAcc[key].pendingAuth += 1;

      if (!c.deliveredAt) pendingDelivered += 1;
      if (c.deliveredAt && !c.authorizedAt) pendingAuthorized += 1;
    }

    const byTemplate: Record<string, { count: number; avgProgress: number; pendingAuth: number }> = {};
    for (const [k, t] of Object.entries(templateAcc)) {
      byTemplate[k] = {
        count: t.count,
        pendingAuth: t.pendingAuth,
        avgProgress: t.count ? Math.round(t.sum / t.count) : 0,
      };
    }

    const eventHealth = events
      .filter((e) => e.status === 'ACTIVE' || e.status === 'DRAFT')
      .map((e) => {
        const p = progressByEvent.get(e.id);
        const avg = p?.n ? Math.round(p.sum / p.n) : 0;
        const daysToShow = e.startsAt ? daysBetween(now, e.startsAt) : null;
        let risk: 'critical' | 'watch' | 'healthy' = 'healthy';
        if (avg < 40 || (daysToShow !== null && daysToShow <= 7 && avg < 70)) risk = 'critical';
        else if (avg < 60 || (daysToShow !== null && daysToShow <= 14 && avg < 80)) risk = 'watch';
        return {
          id: e.id,
          name: e.name,
          artist: e.artist,
          status: e.status,
          startsAt: e.startsAt,
          avgProgress: avg,
          checklistCount: p?.n || 0,
          risk,
          daysToShow,
        };
      })
      .sort((a, b) => {
        const rank = { critical: 0, watch: 1, healthy: 2 };
        return rank[a.risk] - rank[b.risk] || a.avgProgress - b.avgProgress;
      });

    const atRisk = eventHealth.filter((e) => e.risk !== 'healthy');
    const upcoming = events
      .filter((e) => e.startsAt && e.startsAt >= now && e.startsAt <= in14 && e.status !== 'CANCELLED')
      .sort((a, b) => (a.startsAt!.getTime() - b.startsAt!.getTime()))
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        name: e.name,
        artist: e.artist,
        startsAt: e.startsAt,
        status: e.status,
        avgProgress: (() => {
          const p = progressByEvent.get(e.id);
          return p?.n ? Math.round(p.sum / p.n) : 0;
        })(),
      }));

    const poByStatus: Record<string, { count: number; amount: number }> = {};
    let poPipeline = 0;
    let poPaid = 0;
    let poAgingOver7 = 0;
    for (const po of pos) {
      const amt = Number(po.amount || 0);
      if (!poByStatus[po.status]) poByStatus[po.status] = { count: 0, amount: 0 };
      poByStatus[po.status].count += 1;
      poByStatus[po.status].amount += amt;
      if (po.status === 'PENDING_AUTH' || po.status === 'AUTHORIZED') poPipeline += amt;
      if (po.status === 'PAID') poPaid += amt;
      if (
        (po.status === 'PENDING_AUTH' || po.status === 'AUTHORIZED') &&
        daysBetween(po.createdAt, now) > 7
      ) {
        poAgingOver7 += 1;
      }
    }

    let portfolioIncome = 0;
    let portfolioExpense = 0;
    let lockedRuns = 0;
    const marginByEvent: Array<{ eventId: string; income: number; expense: number; net: number }> = [];
    const financeByEventId = new Map<string, ReturnType<typeof financeTotals>>();
    for (const run of financeRuns) {
      const t = financeTotals(run.dataJson);
      portfolioIncome += t.income;
      portfolioExpense += t.expense;
      if (run.locked) lockedRuns += 1;
      financeByEventId.set(run.eventId, t);
      marginByEvent.push({ eventId: run.eventId, ...t });
    }

    const topMargin = marginByEvent
      .map((m) => {
        const ev = events.find((e) => e.id === m.eventId);
        return { ...m, name: ev?.name || m.eventId, artist: ev?.artist };
      })
      .sort((a, b) => b.net - a.net)
      .slice(0, 5);

    const bottomMargin = [...marginByEvent]
      .map((m) => {
        const ev = events.find((e) => e.id === m.eventId);
        return { ...m, name: ev?.name || m.eventId, artist: ev?.artist };
      })
      .sort((a, b) => a.net - b.net)
      .slice(0, 5);

    const advanceTotal = advances.reduce((s, a) => s + Number(a.amount || 0), 0);

    const openTasks = tasks.filter((t) => t.status !== 'DONE').length;
    const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
    const overdueTasks = tasks.filter(
      (t) => t.dueAt && t.dueAt < now && t.status !== 'DONE',
    ).length;

    const createdTrend: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      createdTrend[monthKey(d)] = 0;
    }
    for (const e of events) {
      const k = monthKey(e.createdAt);
      if (k in createdTrend) createdTrend[k] += 1;
    }

    const avgOpsProgress =
      checklists.length > 0
        ? Math.round(checklists.reduce((s, c) => s + c.progressPct, 0) / checklists.length)
        : 0;

    const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; code: string; message: string; href?: string }> =
      [];

    for (const e of atRisk.slice(0, 6)) {
      alerts.push({
        severity: e.risk === 'critical' ? 'critical' : 'warning',
        code: 'EVENT_RISK',
        message: `${e.name}: avance ops ${e.avgProgress}%${
          e.daysToShow != null ? ` · show en ${e.daysToShow}d` : ''
        }`,
        href: `/events/${e.id}`,
      });
    }
    if (poAgingOver7 > 0) {
      alerts.push({
        severity: 'warning',
        code: 'PO_AGING',
        message: `${poAgingOver7} OC con más de 7 días sin pagar/autorizar`,
        href: '/purchase-orders',
      });
    }
    if (pendingAuthorized > 5) {
      alerts.push({
        severity: 'warning',
        code: 'SIG_BACKLOG',
        message: `${pendingAuthorized} checklists entregados pendientes de autorización`,
        href: '/checklists',
      });
    }
    if (overdueTasks > 0) {
      alerts.push({
        severity: 'critical',
        code: 'TASK_OVERDUE',
        message: `${overdueTasks} tareas vencidas`,
        href: '/tasks',
      });
    }
    if (portfolioExpense > 0 && portfolioIncome > 0 && portfolioIncome - portfolioExpense < 0) {
      alerts.push({
        severity: 'critical',
        code: 'PORTFOLIO_LOSS',
        message: `Portfolio neto negativo: $${(portfolioIncome - portfolioExpense).toLocaleString('es-MX')}`,
        href: '/finance',
      });
    }

    const activity90 = events.filter((e) => e.updatedAt >= day90).length;

    return {
      generatedAt: now.toISOString(),
      entity,
      kpis: {
        eventsTotal: events.length,
        eventsActive: byStatus.ACTIVE || 0,
        eventsDraft: byStatus.DRAFT || 0,
        eventsClosed: byStatus.CLOSED || 0,
        eventsCancelled: byStatus.CANCELLED || 0,
        eventsAtRisk: atRisk.length,
        upcoming14d: upcoming.length,
        avgOpsProgress,
        pendingDelivered,
        pendingAuthorized,
        openTasks,
        blockedTasks,
        overdueTasks,
        poCount: pos.length,
        poPipelineAmount: poPipeline,
        poPaidAmount: poPaid,
        poAgingOver7,
        portfolioIncome,
        portfolioExpense,
        portfolioNet: portfolioIncome - portfolioExpense,
        lockedFinanceRuns: lockedRuns,
        advanceTotal,
        activity90d: activity90,
      },
      eventsByStatus: byStatus,
      checklistByTemplate: byTemplate,
      poByStatus,
      eventHealth: eventHealth.slice(0, 12),
      atRisk: atRisk.slice(0, 8),
      upcoming,
      topMargin,
      bottomMargin,
      createdTrend: Object.entries(createdTrend).map(([month, count]) => ({ month, count })),
      alerts,
      recentActivity: recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        resource: a.resource,
        at: a.createdAt,
        user: a.user?.fullName || 'Sistema',
      })),
    };
  }

  async finance(entity: EntityKey, organizationId: string) {
    const events = await this.prisma.event.findMany({
      where: { entity, organizationId },
      select: {
        id: true,
        name: true,
        artist: true,
        status: true,
        startsAt: true,
        financeRuns: { select: { id: true, title: true, locked: true, dataJson: true, updatedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const rows = events.map((e) => {
      const run = e.financeRuns[0];
      const t = financeTotals(run?.dataJson);
      const marginPct = t.income > 0 ? Math.round((t.net / t.income) * 1000) / 10 : null;
      return {
        eventId: e.id,
        name: e.name,
        artist: e.artist,
        status: e.status,
        startsAt: e.startsAt,
        runId: run?.id || null,
        title: run?.title || null,
        locked: !!run?.locked,
        ...t,
        marginPct,
        updatedAt: run?.updatedAt || null,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.income += r.income;
        acc.expense += r.expense;
        acc.net += r.net;
        if (r.locked) acc.locked += 1;
        if (!r.locked && (r.income > 0 || r.expense > 0)) acc.open += 1;
        if (r.net < 0) acc.lossMaking += 1;
        return acc;
      },
      { income: 0, expense: 0, net: 0, locked: 0, open: 0, lossMaking: 0 },
    );

    const byStatus: Record<string, { income: number; expense: number; net: number; count: number }> = {};
    for (const r of rows) {
      if (!byStatus[r.status]) byStatus[r.status] = { income: 0, expense: 0, net: 0, count: 0 };
      byStatus[r.status].income += r.income;
      byStatus[r.status].expense += r.expense;
      byStatus[r.status].net += r.net;
      byStatus[r.status].count += 1;
    }

    return {
      entity,
      totals,
      byStatus,
      ranking: [...rows].sort((a, b) => b.net - a.net),
      rows,
      alerts: [
        ...(totals.lossMaking
          ? [
              {
                severity: 'critical' as const,
                message: `${totals.lossMaking} eventos con neto negativo`,
              },
            ]
          : []),
        ...(totals.open > 3
          ? [
              {
                severity: 'warning' as const,
                message: `${totals.open} corridas abiertas con movimiento`,
              },
            ]
          : []),
      ],
    };
  }

  async purchaseOrders(entity: EntityKey, organizationId: string) {
    const now = new Date();
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { event: { entity, organizationId } },
      include: {
        event: { select: { id: true, name: true, status: true, startsAt: true } },
        createdBy: { select: { fullName: true } },
        authorizedBy: { select: { fullName: true } },
        _count: { select: { proofs: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const byStatus: Record<string, { count: number; amount: number }> = {};
    const byRubro: Record<string, { count: number; amount: number }> = {};
    const byVendor: Record<string, { count: number; amount: number; paid: number }> = {};
    let agingSum = 0;
    let agingN = 0;
    const agingBuckets = { d0_3: 0, d4_7: 0, d8_14: 0, d15plus: 0 };

    const enriched = orders.map((o) => {
      const amount = Number(o.amount || 0);
      const ageDays = daysBetween(o.createdAt, now);
      const open = o.status === 'PENDING_AUTH' || o.status === 'AUTHORIZED' || o.status === 'DRAFT';
      if (open) {
        agingSum += ageDays;
        agingN += 1;
        if (ageDays <= 3) agingBuckets.d0_3 += 1;
        else if (ageDays <= 7) agingBuckets.d4_7 += 1;
        else if (ageDays <= 14) agingBuckets.d8_14 += 1;
        else agingBuckets.d15plus += 1;
      }
      if (!byStatus[o.status]) byStatus[o.status] = { count: 0, amount: 0 };
      byStatus[o.status].count += 1;
      byStatus[o.status].amount += amount;
      const rubro = o.rubro || 'Sin rubro';
      if (!byRubro[rubro]) byRubro[rubro] = { count: 0, amount: 0 };
      byRubro[rubro].count += 1;
      byRubro[rubro].amount += amount;
      const vendor = o.vendorName || 'Sin proveedor';
      if (!byVendor[vendor]) byVendor[vendor] = { count: 0, amount: 0, paid: 0 };
      byVendor[vendor].count += 1;
      byVendor[vendor].amount += amount;
      if (o.status === 'PAID') byVendor[vendor].paid += amount;

      return {
        id: o.id,
        eventId: o.event.id,
        eventName: o.event.name,
        eventStatus: o.event.status,
        rubro: o.rubro,
        vendorName: o.vendorName,
        paymentMethod: o.paymentMethod,
        payeeType: o.payeeType,
        withIva: o.withIva,
        proofCount: o._count.proofs,
        status: o.status,
        amount,
        ageDays,
        createdBy: o.createdBy?.fullName,
        authorizedBy: o.authorizedBy?.fullName,
        createdAt: o.createdAt,
        authorizedAt: o.authorizedAt,
        paidAt: o.paidAt,
      };
    });

    const pipeline =
      (byStatus.PENDING_AUTH?.amount || 0) + (byStatus.AUTHORIZED?.amount || 0) + (byStatus.DRAFT?.amount || 0);
    const paid = byStatus.PAID?.amount || 0;
    const authRate =
      orders.length > 0
        ? Math.round(
            ((orders.filter((o) => o.status === 'AUTHORIZED' || o.status === 'PAID').length) / orders.length) *
              100,
          )
        : 0;

    return {
      entity,
      kpis: {
        total: orders.length,
        pipeline,
        paid,
        authRate,
        avgAgingDays: agingN ? Math.round(agingSum / agingN) : 0,
        agingOver7: agingBuckets.d8_14 + agingBuckets.d15plus,
      },
      byStatus,
      byRubro: Object.entries(byRubro)
        .map(([rubro, v]) => ({ rubro, ...v }))
        .sort((a, b) => b.amount - a.amount),
      byVendor: Object.entries(byVendor)
        .map(([vendor, v]) => ({ vendor, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      agingBuckets,
      agingQueue: enriched
        .filter((o) => o.status === 'PENDING_AUTH' || o.status === 'AUTHORIZED')
        .sort((a, b) => b.ageDays - a.ageDays)
        .slice(0, 20),
      orders: enriched,
    };
  }

  async opsDiscipline(entity: EntityKey, templateKeys: string[], organizationId: string) {
    const checklists = await this.prisma.checklistInstance.findMany({
      where: {
        event: { entity, organizationId },
        template: { key: { in: templateKeys as ChecklistTemplateKey[] } },
      },
      include: {
        template: { select: { key: true, name: true } },
        event: {
          select: {
            id: true,
            name: true,
            artist: true,
            status: true,
            startsAt: true,
            entity: true,
          },
        },
        lastEditedBy: { select: { fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date();
    const rows = checklists.map((c) => {
      const daysToShow = c.event.startsAt ? daysBetween(now, c.event.startsAt) : null;
      let risk: 'critical' | 'watch' | 'healthy' = 'healthy';
      if (c.progressPct < 40 || (daysToShow !== null && daysToShow <= 7 && c.progressPct < 70)) {
        risk = 'critical';
      } else if (c.progressPct < 65 || (daysToShow !== null && daysToShow <= 14 && c.progressPct < 85)) {
        risk = 'watch';
      }
      return {
        checklistId: c.id,
        title: c.title,
        progressPct: c.progressPct,
        templateKey: c.template.key,
        deliveredAt: c.deliveredAt,
        authorizedAt: c.authorizedAt,
        lastEditedAt: c.lastEditedAt,
        lastEditedBy: c.lastEditedBy?.fullName || null,
        dataJson: c.dataJson,
        risk,
        daysToShow,
        event: c.event,
      };
    });

    const avg =
      rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.progressPct, 0) / rows.length) : 0;
    const pendingAuth = rows.filter((r) => r.deliveredAt && !r.authorizedAt).length;
    const incomplete = rows.filter((r) => r.progressPct < 100).length;
    const critical = rows.filter((r) => r.risk === 'critical').length;

    return {
      entity,
      templateKeys,
      kpis: {
        total: rows.length,
        avgProgress: avg,
        incomplete,
        pendingAuth,
        critical,
        authorized: rows.filter((r) => !!r.authorizedAt).length,
      },
      byRisk: {
        critical: rows.filter((r) => r.risk === 'critical').length,
        watch: rows.filter((r) => r.risk === 'watch').length,
        healthy: rows.filter((r) => r.risk === 'healthy').length,
      },
      rows: rows.sort((a, b) => {
        const rank = { critical: 0, watch: 1, healthy: 2 };
        return rank[a.risk] - rank[b.risk] || a.progressPct - b.progressPct;
      }),
    };
  }

  async usersGovernance(organizationId: string) {
    const now = new Date();
    const day30 = new Date(now.getTime() - 30 * 86_400_000);
    const day7 = new Date(now.getTime() - 7 * 86_400_000);

    const [users, auditCounts, editCounts, sessionCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          title: true,
          roleKey: true,
          entities: true,
          permissions: true,
          active: true,
          lastLoginAt: true,
          failedLoginCount: true,
          lockedUntil: true,
          createdAt: true,
          _count: { select: { assignedTasks: true, auditLogs: true, purchaseOrders: true } },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: day30 },
          userId: { not: null },
          user: { organizationId },
        },
        _count: { _all: true },
      }),
      this.prisma.checklistInstance.groupBy({
        by: ['lastEditedById'],
        where: {
          lastEditedAt: { gte: day30 },
          lastEditedById: { not: null },
          event: { organizationId },
        },
        _count: { _all: true },
      }),
      this.prisma.userSession.groupBy({
        by: ['userId'],
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          user: { organizationId },
        },
        _count: { _all: true },
      }),
    ]);

    const auditMap = new Map(auditCounts.map((a) => [a.userId!, a._count._all]));
    const editMap = new Map(editCounts.map((e) => [e.lastEditedById!, e._count._all]));
    const sessionMap = new Map(sessionCounts.map((s) => [s.userId, s._count._all]));

    const enriched = users.map((u) => {
      const last = u.lastLoginAt;
      const inactive30 = !last || last < day30;
      const inactive7 = !last || last < day7;
      const locked = !!(u.lockedUntil && u.lockedUntil > now);
      let riskScore = 0;
      if (!u.active) riskScore += 40;
      if (locked) riskScore += 35;
      if (u.failedLoginCount >= 3) riskScore += 15;
      if (inactive30 && u.active) riskScore += 20;
      if (u.permissions.includes('everything') || u.roleKey === 'super_admin') riskScore += 5;
      const risk: 'high' | 'medium' | 'low' =
        riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';

      return {
        ...u,
        activity30d: auditMap.get(u.id) || 0,
        checklistEdits30d: editMap.get(u.id) || 0,
        activeSessions: sessionMap.get(u.id) || 0,
        inactive7,
        inactive30,
        locked,
        risk,
        riskScore,
      };
    });

    return {
      kpis: {
        total: users.length,
        active: users.filter((u) => u.active).length,
        inactive: users.filter((u) => !u.active).length,
        neverLoggedIn: users.filter((u) => !u.lastLoginAt).length,
        inactive30d: enriched.filter((u) => u.inactive30 && u.active).length,
        lockedNow: enriched.filter((u) => u.locked).length,
        highRisk: enriched.filter((u) => u.risk === 'high').length,
        loggedIn7d: enriched.filter((u) => u.lastLoginAt && u.lastLoginAt >= day7).length,
      },
      byRole: users.reduce(
        (acc, u) => {
          acc[u.roleKey] = (acc[u.roleKey] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      users: enriched.sort((a, b) => b.riskScore - a.riskScore || a.fullName.localeCompare(b.fullName)),
    };
  }

  async ticketing(entity: EntityKey, organizationId: string) {
    const setups = await this.prisma.ticketingSetup.findMany({
      where: { event: { entity, organizationId } },
      include: {
        event: { select: { id: true, name: true, artist: true, status: true, startsAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date();
    const rows = setups.map((s) => {
      const zones = (Array.isArray(s.zonesJson) ? s.zonesJson : []) as Array<{
        zona?: string;
        aforo?: number;
        precio?: number;
        sold?: number;
      }>;
      const capacity = zones.reduce((sum, z) => sum + Number(z.aforo || 0), 0);
      const sold = zones.reduce((sum, z) => sum + Number(z.sold || 0), 0);
      const potential = zones.reduce(
        (sum, z) => sum + Number(z.aforo || 0) * Number(z.precio || 0),
        0,
      );
      const realized = zones.reduce(
        (sum, z) => sum + Number(z.sold || 0) * Number(z.precio || 0),
        0,
      );
      const sellThroughPct = capacity > 0 ? Math.round((sold / capacity) * 1000) / 10 : 0;
      const holdUntil = s.holdUntil;
      const holdExpired = holdUntil ? holdUntil < now : false;
      const holdDays =
        holdUntil != null ? Math.round((holdUntil.getTime() - now.getTime()) / 86_400_000) : null;
      return {
        id: s.id,
        boletera: s.boletera,
        holdUntil,
        holdExpired,
        holdDays,
        artist: s.artist,
        promoter: s.promoter,
        capacity,
        sold,
        sellThroughPct,
        potentialRevenue: potential,
        realizedRevenue: realized,
        zoneCount: zones.length,
        zones: zones.map((z) => {
          const aforo = Number(z.aforo || 0);
          const soldZ = Number(z.sold || 0);
          return {
            zona: z.zona || '—',
            aforo,
            sold: soldZ,
            precio: Number(z.precio || 0),
            potential: aforo * Number(z.precio || 0),
            realized: soldZ * Number(z.precio || 0),
            sellThroughPct: aforo > 0 ? Math.round((soldZ / aforo) * 1000) / 10 : 0,
          };
        }),
        event: s.event,
      };
    });

    const capacityTotal = rows.reduce((s, r) => s + r.capacity, 0);
    const soldTotal = rows.reduce((s, r) => s + r.sold, 0);
    const potentialTotal = rows.reduce((s, r) => s + r.potentialRevenue, 0);
    const realizedTotal = rows.reduce((s, r) => s + r.realizedRevenue, 0);
    const holdRisk = rows.filter((r) => r.holdExpired || (r.holdDays != null && r.holdDays <= 3)).length;
    const sellThroughPct =
      capacityTotal > 0 ? Math.round((soldTotal / capacityTotal) * 1000) / 10 : 0;

    return {
      entity,
      kpis: {
        setups: rows.length,
        capacityTotal,
        soldTotal,
        sellThroughPct,
        potentialRevenue: potentialTotal,
        realizedRevenue: realizedTotal,
        avgTicket: capacityTotal > 0 ? Math.round(potentialTotal / capacityTotal) : 0,
        holdRisk,
        eventsCovered: new Set(rows.map((r) => r.event.id)).size,
      },
      ranking: [...rows].sort((a, b) => b.sellThroughPct - a.sellThroughPct),
      rows,
    };
  }

  async auditIntel(take = 200, organizationId?: string) {
    const day30 = new Date(Date.now() - 30 * 86_400_000);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: day30 },
        // La revisión automática corre cada hora: en producción eran >1,000 filas
        // que tapaban lo que hizo el equipo. No es un movimiento de nadie.
        action: { not: 'automation.scan' },
        // Solo logs de usuarios del tenant — no mezclar system logs (userId null) cross-tenant
        ...(organizationId ? { user: { organizationId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    const byAction: Record<string, number> = {};
    const byResource: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    for (const l of logs) {
      byAction[l.action] = (byAction[l.action] || 0) + 1;
      byResource[l.resource] = (byResource[l.resource] || 0) + 1;
      const u = l.user?.fullName || 'Sistema';
      byUser[u] = (byUser[u] || 0) + 1;
    }

    const topActions = Object.entries(byAction)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topUsers = Object.entries(byUser)
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const anomalies = logs.filter(
      (l) =>
        l.action.includes('delete') ||
        l.action.includes('cancel') ||
        l.action === 'user.removed' ||
        l.action === 'finance.unlock',
    );

    return {
      kpis: {
        events30d: logs.length,
        uniqueActors: Object.keys(byUser).length,
        uniqueActions: Object.keys(byAction).length,
        destructive: anomalies.filter((a) => a.action.includes('delete') || a.action.includes('cancel'))
          .length,
      },
      topActions,
      topUsers,
      byResource,
      anomalies: anomalies.slice(0, 20).map((a) => ({
        id: a.id,
        action: a.action,
        resource: a.resource,
        at: a.createdAt,
        user: a.user?.fullName || 'Sistema',
      })),
      logs,
    };
  }
}
