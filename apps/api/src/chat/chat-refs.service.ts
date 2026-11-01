import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ChatChannelKind } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { tenantIdOf } from '../common/tenant';
import { canSeeEntity, entityScope } from '../common/entity-scope';
import {
  canAccessEventOps,
  canJoinEventChannels,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { NotificationsService } from '../notifications/notifications.service';
import {
  chatRefNotice,
  dayLabel,
  daysFromToday,
  facts,
  money,
  poRef,
  type ChatRefRole,
} from '../notifications/notification-text';
import { targetFromLink } from '../notifications/notification-push-meta';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { canApproveTask, isTaskAssignee, taskAssigneeIds, taskNeedsApproval, withAssignees } from '../tasks/task-workflow';
import {
  cleanRefInput,
  isRefKind,
  matchesQuery,
  normalizeSearch,
  refKey,
  refLabel,
  refStub,
  REF_KINDS,
  type ChatRefDto,
  type RefAction,
  type RefKind,
  type RefTarget,
  type RefTone,
} from './chat-refs';
import { chatPreview } from './chat-text';

export type RefViewer = {
  id: string;
  roleKey: string;
  organizationId?: string | null;
  fullName?: string;
  entities?: string[] | null;
  permissions?: string[];
};

const eventBrief = { select: { id: true, name: true, entity: true, organizationId: true, status: true } } as const;

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  dueAt: true,
  eventId: true,
  entity: true,
  organizationId: true,
  assigneeId: true,
  createdById: true,
  assignee: { select: { id: true, fullName: true } },
  coAssignees: { select: { userId: true, user: { select: { id: true, fullName: true } } } },
  event: eventBrief,
} as const;

const EVENT_SELECT = {
  id: true,
  name: true,
  artist: true,
  entity: true,
  organizationId: true,
  status: true,
  startsAt: true,
  venue: true,
  city: true,
} as const;

const PO_SELECT = {
  id: true,
  rubro: true,
  vendorName: true,
  description: true,
  amount: true,
  currency: true,
  status: true,
  createdById: true,
  eventId: true,
  event: eventBrief,
} as const;

const FORMAT_SELECT = {
  id: true,
  title: true,
  progressPct: true,
  status: true,
  eventId: true,
  lastEditedById: true,
  deliveredById: true,
  event: eventBrief,
} as const;

const DOC_SELECT = {
  id: true,
  title: true,
  status: true,
  version: true,
  eventId: true,
  createdById: true,
  event: eventBrief,
} as const;

const ADVANCE_SELECT = {
  id: true,
  label: true,
  note: true,
  amount: true,
  advanceStatus: true,
  entity: true,
  eventId: true,
  uploadedById: true,
  createdAt: true,
} as const;

const TASK_STATUS: Record<string, string> = {
  OPEN: 'Pendiente',
  IN_PROGRESS: 'En curso',
  PENDING_APPROVAL: 'Por revisar',
  BLOCKED: 'Bloqueada',
  DONE: 'Terminada',
};
const EVENT_STATUS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};
const PO_STATUS: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_AUTH: 'Por autorizar',
  AUTHORIZED: 'Autorizada',
  PAID: 'Pagada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};
const DOC_STATUS: Record<string, string> = {
  DRAFT: 'Borrador',
  REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  SEALED: 'Sellado',
};
const ADVANCE_STATUS: Record<string, string> = {
  PENDING: 'Por aprobar',
  APPROVED: 'Por pagar',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
};

/** Cuántos resultados por tipo: con búsqueda se enseña más, sin ella solo lo más a la mano. */
const SEARCH_PER_KIND = 6;
const EMPTY_PER_KIND = 4;
const JUST_CREATED_MS = 2 * 60 * 1000;
/** Candidatos por tipo antes de filtrar sin acentos en memoria. */
const SEARCH_POOL = 300;

function day(value: Date | null | undefined, now: Date): string {
  return value ? dayLabel(value, now).replace(/^el /, '') : '';
}

function sameTenant(user: RefViewer, organizationId?: string | null): boolean {
  return !organizationId || organizationId === tenantIdOf(user) || user.roleKey === 'super_admin';
}

function canSeeEvent(user: RefViewer, event?: { entity: string; organizationId: string | null } | null): boolean {
  if (!event) return false;
  return (
    canAccessEventOps((user.entities ?? []) as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey) &&
    sameTenant(user, event.organizationId)
  );
}

function canSeeFinance(user: RefViewer): boolean {
  const role = user.roleKey as RoleKey;
  return (
    hasPermission(role, user.permissions ?? [], PERMISSIONS.FINANCE_VIEW) ||
    hasPermission(role, user.permissions ?? [], PERMISSIONS.FINANCE_EDIT)
  );
}

function card(ref: RefTarget, over: Partial<ChatRefDto>): ChatRefDto {
  const base = refStub({ kind: ref.kind, targetId: ref.id, label: over.label ?? '' });
  return { ...base, title: over.label ?? '', resolved: true, canOpen: true, ...over };
}

/**
 * Referencias del chat: lo que se puede arrobar, la tarjeta en vivo de cada cosa, a
 * quién le importa que la mencionen y dónde se ha hablado de ella.
 *
 * Toda la visibilidad se decide aquí con las mismas reglas de las pantallas: quien no
 * puede abrir una OC ve la etiqueta del mensaje, nunca el monto ni el estado.
 */
@Injectable()
export class ChatRefsService {
  private readonly logger = new Logger(ChatRefsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  // ─── Tarjetas ────────────────────────────────────────────────────────────

  /** Tarjetas para esta persona: una consulta por tipo, sin importar cuántas sean. */
  async cards(viewer: RefViewer, refs: RefTarget[], now = new Date()): Promise<Map<string, ChatRefDto>> {
    const idsOf = (kind: RefKind) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
    const taskIds = idsOf('task');
    const eventIds = idsOf('event');
    const poIds = idsOf('po');
    const formatIds = idsOf('format');
    const docIds = idsOf('doc');
    const advanceIds = idsOf('advance');

    const [tasks, events, pos, formats, docs, advances, progress] = await Promise.all([
      taskIds.length ? this.prisma.taskAssignment.findMany({ where: { id: { in: taskIds } }, select: TASK_SELECT }) : [],
      eventIds.length ? this.prisma.event.findMany({ where: { id: { in: eventIds } }, select: EVENT_SELECT }) : [],
      poIds.length ? this.prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: PO_SELECT }) : [],
      formatIds.length
        ? this.prisma.checklistInstance.findMany({ where: { id: { in: formatIds } }, select: FORMAT_SELECT })
        : [],
      docIds.length ? this.prisma.eventDocument.findMany({ where: { id: { in: docIds } }, select: DOC_SELECT }) : [],
      advanceIds.length
        ? this.prisma.paymentProof.findMany({
            where: { id: { in: advanceIds }, purchaseOrderId: null },
            select: ADVANCE_SELECT,
          })
        : [],
      this.eventProgress(eventIds),
    ]);
    const advanceEventIds = [...new Set(advances.map((a) => a.eventId).filter((id): id is string => !!id))];
    const advanceEvents = advanceEventIds.length
      ? await this.prisma.event.findMany({
          where: { id: { in: advanceEventIds } },
          select: { id: true, name: true, entity: true, organizationId: true, status: true },
        })
      : [];
    const advanceEventOf = new Map(advanceEvents.map((e) => [e.id, e]));

    const out = new Map<string, ChatRefDto>();
    const put = (kind: RefKind, id: string, value: ChatRefDto) => out.set(refKey({ kind, id }), value);

    for (const t of tasks) {
      const open = t.eventId ? canSeeEvent(viewer, t.event) : sameTenant(viewer, t.organizationId) && canSeeEntity(viewer, t.entity);
      put('task', t.id, open ? this.taskCard(t, viewer, now) : this.lockedCard('task', t.id, refLabel(t.title, 'Tarea')));
    }
    for (const e of events) {
      put(
        'event',
        e.id,
        canSeeEvent(viewer, e) ? this.eventCard(e, progress.get(e.id) ?? null, now) : this.lockedCard('event', e.id, refLabel(e.name, 'Evento')),
      );
    }
    for (const p of pos) {
      put('po', p.id, canSeeEvent(viewer, p.event) ? this.poCard(p) : this.lockedCard('po', p.id, poRef(p.id)));
    }
    for (const f of formats) {
      put(
        'format',
        f.id,
        canSeeEvent(viewer, f.event) ? this.formatCard(f) : this.lockedCard('format', f.id, refLabel(f.title, 'Formato')),
      );
    }
    for (const d of docs) {
      put('doc', d.id, canSeeEvent(viewer, d.event) ? this.docCard(d) : this.lockedCard('doc', d.id, refLabel(d.title, 'Documento')));
    }
    for (const a of advances) {
      const event = a.eventId ? advanceEventOf.get(a.eventId) : null;
      const visible =
        a.uploadedById === viewer.id ||
        (canSeeFinance(viewer) && (a.eventId ? canSeeEvent(viewer, event) : canSeeEntity(viewer, a.entity)));
      put('advance', a.id, visible ? this.advanceCard(a, event?.name) : this.lockedCard('advance', a.id, this.advanceLabel(a.id)));
    }
    for (const ref of refs) {
      const key = refKey(ref);
      if (!out.has(key)) out.set(key, { ...refStub({ kind: ref.kind, targetId: ref.id, label: '' }), resolved: true, missing: true });
    }
    return out;
  }

  /** Tareas terminadas / total por evento: el avance de la tarjeta. */
  private async eventProgress(eventIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (eventIds.length === 0) return out;
    const rows = await this.prisma.taskAssignment.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });
    const total = new Map<string, number>();
    const done = new Map<string, number>();
    for (const r of rows) {
      if (!r.eventId) continue;
      total.set(r.eventId, (total.get(r.eventId) ?? 0) + r._count._all);
      if (r.status === 'DONE') done.set(r.eventId, (done.get(r.eventId) ?? 0) + r._count._all);
    }
    for (const [id, n] of total) out.set(id, n ? Math.round(((done.get(id) ?? 0) / n) * 100) : 0);
    return out;
  }

  private lockedCard(kind: RefKind, id: string, label: string): ChatRefDto {
    return { ...refStub({ kind, targetId: id, label }), resolved: true };
  }

  private advanceLabel(id: string): string {
    return `Anticipo ${id.slice(-6).toUpperCase()}`;
  }

  private taskCard(
    t: {
      id: string;
      title: string;
      status: string;
      dueAt: Date | null;
      eventId: string | null;
      assigneeId: string | null;
      createdById: string | null;
      assignee: { id: string; fullName: string } | null;
      coAssignees: Array<{ userId: string; user: { id: string; fullName: string } }>;
      event: { name: string; status: string } | null;
    },
    viewer: RefViewer,
    now: Date,
  ): ChatRefDto {
    const done = t.status === 'DONE';
    const late = !done && t.dueAt ? (daysFromToday(t.dueAt, now) as number) < 0 : false;
    const closed = t.event?.status === 'CLOSED' || t.event?.status === 'CANCELLED';
    const actions: RefAction[] = [];
    if (!closed && !done && t.status !== 'PENDING_APPROVAL' && isTaskAssignee(viewer.id, t)) {
      // Con quien revise, se entrega con nota o evidencia; si la pedí yo mismo, basta marcarla.
      actions.push(taskNeedsApproval(t) ? 'deliver' : 'complete');
    }
    if (!closed && t.status === 'PENDING_APPROVAL' && canApproveTask(viewer.id, viewer.roleKey, t)) actions.push('approve');
    const tone: RefTone = done ? 'done' : actions.length ? 'action' : late ? 'late' : 'info';
    const label = refLabel(t.title, 'Tarea');
    return card(
      { kind: 'task', id: t.id },
      {
        label,
        href: t.eventId ? `/events/${t.eventId}?tab=tasks&task=${t.id}` : `/tasks?task=${t.id}`,
        status: t.status,
        statusLabel: late ? 'Vencida' : (TASK_STATUS[t.status] ?? t.status),
        tone,
        subtitle:
          facts(t.dueAt && !done ? `${late ? 'venció' : 'vence'} ${day(t.dueAt, now)}` : '', t.event?.name) || null,
        dueAt: t.dueAt?.toISOString() ?? null,
        people: withAssignees(t).assignees.map((p) => ({ id: p.id, fullName: p.fullName })),
        actions,
      },
    );
  }

  private eventCard(
    e: { id: string; name: string; status: string; startsAt: Date | null; venue: string | null; city: string | null },
    progress: number | null,
    now: Date,
  ): ChatRefDto {
    const label = refLabel(e.name, 'Evento');
    return card(
      { kind: 'event', id: e.id },
      {
        label,
        href: `/events/${e.id}`,
        status: e.status,
        statusLabel: EVENT_STATUS[e.status] ?? e.status,
        tone: e.status === 'CLOSED' ? 'done' : 'info',
        subtitle: facts(day(e.startsAt, now), e.venue || e.city) || null,
        dueAt: e.startsAt?.toISOString() ?? null,
        progress,
      },
    );
  }

  private poCard(p: {
    id: string;
    rubro: string;
    vendorName: string | null;
    amount: unknown;
    currency: string;
    status: string;
    event: { name: string } | null;
  }): ChatRefDto {
    return card(
      { kind: 'po', id: p.id },
      {
        label: poRef(p.id),
        href: `/purchase-orders?po=${p.id}`,
        status: p.status,
        statusLabel: PO_STATUS[p.status] ?? p.status,
        tone: p.status === 'PAID' ? 'done' : p.status === 'PENDING_AUTH' ? 'action' : 'info',
        subtitle: facts(p.vendorName || p.rubro, p.event?.name) || null,
        amount: money(p.amount, p.currency) || null,
      },
    );
  }

  private formatCard(f: {
    id: string;
    title: string;
    progressPct: number;
    status: string;
    eventId: string;
    event: { name: string } | null;
  }): ChatRefDto {
    return card(
      { kind: 'format', id: f.id },
      {
        label: refLabel(f.title, 'Formato'),
        href: `/events/${f.eventId}?tab=checklists&checklist=${f.id}`,
        status: f.status,
        statusLabel: DOC_STATUS[f.status] ?? f.status,
        tone: f.status === 'SEALED' || f.status === 'APPROVED' ? 'done' : f.status === 'REVIEW' ? 'action' : 'info',
        subtitle: f.event?.name ?? null,
        progress: f.progressPct,
      },
    );
  }

  private docCard(d: {
    id: string;
    title: string;
    status: string;
    version: number;
    eventId: string;
    event: { name: string } | null;
  }): ChatRefDto {
    return card(
      { kind: 'doc', id: d.id },
      {
        label: refLabel(d.title, 'Documento'),
        href: `/events/${d.eventId}?tab=files&doc=${d.id}`,
        status: d.status,
        statusLabel: DOC_STATUS[d.status] ?? d.status,
        tone: d.status === 'SEALED' || d.status === 'APPROVED' ? 'done' : 'info',
        subtitle: facts(`Versión ${d.version}`, d.event?.name) || null,
      },
    );
  }

  private advanceCard(
    a: { id: string; label: string | null; note: string | null; amount: unknown; advanceStatus: string | null },
    eventName?: string | null,
  ): ChatRefDto {
    const status = a.advanceStatus ?? 'PENDING';
    return card(
      { kind: 'advance', id: a.id },
      {
        label: this.advanceLabel(a.id),
        title: refLabel(a.label || a.note, this.advanceLabel(a.id)),
        href: `/advances?advance=${a.id}`,
        status,
        statusLabel: ADVANCE_STATUS[status] ?? status,
        tone: status === 'PAID' ? 'done' : status === 'REJECTED' ? 'late' : 'action',
        subtitle: eventName ?? null,
        amount: a.amount != null ? money(a.amount) : null,
      },
    );
  }

  /** Cambia las etiquetas de los mensajes por tarjetas con los permisos de quien lee. */
  async hydrate<T extends { refs?: ChatRefDto[] }>(viewer: RefViewer, messages: T[]): Promise<T[]> {
    const wanted = new Map<string, RefTarget>();
    for (const m of messages) for (const r of m.refs ?? []) wanted.set(refKey(r), { kind: r.kind, id: r.id });
    if (wanted.size === 0) return messages;
    const cards = await this.cards(viewer, [...wanted.values()]);
    return messages.map((m) =>
      m.refs?.length
        ? {
            ...m,
            refs: m.refs.map((stub) => {
              const c = cards.get(refKey(stub));
              // `label` es lo escrito en el mensaje (encuentra el chip); `title` es el nombre de hoy.
              return c ? { ...c, label: stub.label, title: c.title || stub.label } : stub;
            }),
          }
        : m,
    );
  }

  /** Lo que un mensaje puede ligar: solo lo que su autor puede abrir y que sigue existiendo. */
  async forPost(user: RefViewer, raw: unknown): Promise<Array<{ kind: RefKind; targetId: string; label: string }>> {
    const refs = cleanRefInput(raw);
    if (refs.length === 0) return [];
    const cards = await this.cards(user, refs);
    return refs
      .map((r) => cards.get(refKey(r)))
      .filter((c): c is ChatRefDto => !!c && c.canOpen && !c.missing)
      .map((c) => ({ kind: c.kind, targetId: c.id, label: c.label }));
  }

  // ─── Buscar ──────────────────────────────────────────────────────────────

  /**
   * Selector del @: agrupado por tipo. Lo del evento de la conversación va primero;
   * sin texto solo sugiere lo que esta persona trae a la mano (no todo el catálogo).
   */
  async search(
    user: RefViewer,
    opts: { q?: string; kinds?: string; entity?: string; channelId?: string } = {},
  ): Promise<{ results: ChatRefDto[] }> {
    const q = (opts.q ?? '').trim().slice(0, 80);
    const wanted = (opts.kinds ?? '').split(',').filter(isRefKind);
    const kinds = new Set<RefKind>(wanted.length ? wanted : REF_KINDS);
    const scope = entityScope(user, opts.entity);
    const ops = eventOpsEntities((user.entities ?? []) as EntityKey[], user.roleKey as RoleKey).filter((e) =>
      scope.includes(e),
    );
    const org = user.roleKey === 'super_admin' ? {} : { organizationId: tenantIdOf(user) };
    const eventScope = { ...org, entity: { in: ops } };
    const context = opts.channelId
      ? ((
          await this.prisma.chatChannel.findFirst({
            where: { id: opts.channelId, organizationId: tenantIdOf(user) },
            select: { eventId: true },
          })
        )?.eventId ?? null)
      : null;
    const now = new Date();
    const limit = q ? SEARCH_PER_KIND : EMPTY_PER_KIND;

    /** Mejor primero: lo del evento de la conversación, lo mío, y lo que empieza con lo escrito. */
    const rank = (fields: { eventId?: string | null; mine?: boolean; title: string; open?: boolean }) => {
      let score = 0;
      if (context && fields.eventId === context) score += 4;
      if (fields.mine) score += 2;
      if (fields.open) score += 1;
      if (q && normalizeSearch(fields.title).startsWith(normalizeSearch(q))) score += 3;
      return score;
    };
    const top = <T extends { id: string }>(rows: Array<{ row: T; score: number }>, kind: RefKind): RefTarget[] =>
      rows
        .map((item, index) => ({ ...item, index }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, limit)
        .map(({ row }) => ({ kind, id: row.id }));

    const groups = await Promise.all([
      kinds.has('task')
        ? this.prisma.taskAssignment
            .findMany({
              where: {
                ...org,
                OR: [{ eventId: null, entity: { in: scope } }, ...(ops.length ? [{ event: { entity: { in: ops } } }] : [])],
              },
              select: {
                id: true,
                title: true,
                status: true,
                eventId: true,
                assigneeId: true,
                createdById: true,
                coAssignees: { select: { userId: true } },
                event: { select: { name: true } },
              },
              orderBy: { updatedAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((t) => {
                    const mine = isTaskAssignee(user.id, t) || t.createdById === user.id;
                    if (q) return matchesQuery(q, t.title, t.event?.name);
                    return t.status !== 'DONE' && (mine || (!!context && t.eventId === context));
                  })
                  .map((t) => ({
                    row: t,
                    score: rank({
                      eventId: t.eventId,
                      mine: isTaskAssignee(user.id, t),
                      title: t.title,
                      open: t.status !== 'DONE',
                    }),
                  })),
                'task',
              ),
            )
        : [],
      kinds.has('event') && ops.length
        ? this.prisma.event
            .findMany({
              where: eventScope,
              select: { id: true, name: true, artist: true, venue: true, startsAt: true, status: true },
              orderBy: { startsAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((e) =>
                    q
                      ? matchesQuery(q, e.name, e.artist, e.venue)
                      : e.id === context || (e.status !== 'CLOSED' && e.status !== 'CANCELLED' && !!e.startsAt && e.startsAt >= now),
                  )
                  // Sin texto: el show más próximo primero.
                  .sort((a, b) => (q ? 0 : (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)))
                  .map((e) => ({ row: e, score: rank({ eventId: e.id, title: e.name }) })),
                'event',
              ),
            )
        : [],
      kinds.has('po') && ops.length
        ? this.prisma.purchaseOrder
            .findMany({
              where: { event: eventScope },
              select: {
                id: true,
                rubro: true,
                vendorName: true,
                description: true,
                status: true,
                eventId: true,
                createdById: true,
                event: { select: { name: true } },
              },
              orderBy: { updatedAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((p) =>
                    q
                      ? matchesQuery(q, poRef(p.id), p.rubro, p.vendorName, p.description, p.event?.name)
                      : p.eventId === context || (p.createdById === user.id && p.status !== 'PAID'),
                  )
                  .map((p) => ({
                    row: p,
                    score: rank({ eventId: p.eventId, mine: p.createdById === user.id, title: poRef(p.id) }),
                  })),
                'po',
              ),
            )
        : [],
      kinds.has('format') && ops.length
        ? this.prisma.checklistInstance
            .findMany({
              where: { event: eventScope },
              select: { id: true, title: true, eventId: true, lastEditedById: true, event: { select: { name: true } } },
              orderBy: { updatedAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((f) => (q ? matchesQuery(q, f.title, f.event?.name) : f.eventId === context))
                  .map((f) => ({
                    row: f,
                    score: rank({ eventId: f.eventId, mine: f.lastEditedById === user.id, title: f.title }),
                  })),
                'format',
              ),
            )
        : [],
      kinds.has('doc') && ops.length
        ? this.prisma.eventDocument
            .findMany({
              where: { event: eventScope },
              select: { id: true, title: true, eventId: true, createdById: true, event: { select: { name: true } } },
              orderBy: { updatedAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((d) => (q ? matchesQuery(q, d.title, d.event?.name) : d.eventId === context))
                  .map((d) => ({
                    row: d,
                    score: rank({ eventId: d.eventId, mine: d.createdById === user.id, title: d.title }),
                  })),
                'doc',
              ),
            )
        : [],
      kinds.has('advance')
        ? this.prisma.paymentProof
            .findMany({
              where: {
                purchaseOrderId: null,
                advanceStatus: { not: null },
                entity: { in: scope },
                ...(canSeeFinance(user) ? {} : { uploadedById: user.id }),
              },
              select: { id: true, label: true, note: true, advanceStatus: true, eventId: true, uploadedById: true },
              orderBy: { createdAt: 'desc' },
              take: SEARCH_POOL,
            })
            .then((rows) =>
              top(
                rows
                  .filter((a) =>
                    q
                      ? matchesQuery(q, 'anticipo', this.advanceLabel(a.id), a.label, a.note)
                      : a.uploadedById === user.id && (a.advanceStatus === 'PENDING' || a.advanceStatus === 'APPROVED'),
                  )
                  .map((a) => ({
                    row: a,
                    score: rank({
                      eventId: a.eventId,
                      mine: a.uploadedById === user.id,
                      title: a.label || this.advanceLabel(a.id),
                    }),
                  })),
                'advance',
              ),
            )
        : [],
    ]);

    const targets = groups.flat();
    const cards = await this.cards(user, targets, now);
    return {
      results: targets
        .map((t) => cards.get(refKey(t)))
        .filter((c): c is ChatRefDto => !!c && c.canOpen && !c.missing),
    };
  }

  // ─── Dónde se ha hablado de esto ─────────────────────────────────────────

  private canReadChannel(
    person: { id?: string; roleKey: string; entities?: string[] | null },
    channel: { kind: ChatChannelKind; eventId: string | null; entity: string | null },
    isMember: boolean,
  ): boolean {
    if (isMember) return true;
    if (channel.kind !== ChatChannelKind.PUBLIC) return false;
    if (!canSeeEntity(person, channel.entity as EntityKey | null)) return false;
    return !channel.eventId || canJoinEventChannels(person.roleKey);
  }

  /** «Mencionado en»: los mensajes que ligan esta cosa, de las conversaciones que puedo leer. */
  async backlinks(user: RefViewer, kind: string, id: string) {
    if (!isRefKind(kind) || !id) throw new BadRequestException('Referencia inválida');
    const target = (await this.cards(user, [{ kind, id }])).get(refKey({ kind, id }));
    if (!target?.canOpen) throw new NotFoundException('No encontrado');
    const rows = await this.prisma.chatMessageRef.findMany({
      where: {
        kind,
        targetId: id,
        message: { deletedAt: null, channel: { organizationId: tenantIdOf(user), isArchived: false } },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        createdAt: true,
        message: {
          select: {
            id: true,
            body: true,
            parentId: true,
            sender: { select: { id: true, fullName: true } },
            channel: {
              select: {
                id: true,
                name: true,
                kind: true,
                isGroupDm: true,
                eventId: true,
                entity: true,
                members: { where: { userId: user.id }, select: { userId: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    const links = rows
      .filter((r) => this.canReadChannel(user, r.message.channel, r.message.channel.members.length > 0))
      .slice(0, 20)
      .map((r) => {
        const c = r.message.channel;
        return {
          messageId: r.message.id,
          channelId: c.id,
          channelName: c.kind === ChatChannelKind.DIRECT ? 'Mensaje directo' : c.isGroupDm ? c.name : `#${c.name}`,
          author: r.message.sender,
          excerpt: chatPreview(r.message.body),
          at: r.createdAt.toISOString(),
          href: `/chat?channel=${c.id}&msg=${r.message.id}`,
        };
      });
    return { links };
  }

  /** Panel «Ligados» de una conversación: cada cosa una vez, con su mensaje más reciente. */
  async forChannel(user: RefViewer, channelId: string) {
    const rows = await this.prisma.chatMessageRef.findMany({
      where: { channelId, message: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { kind: true, targetId: true, label: true, messageId: true, createdAt: true },
    });
    const latest = new Map<string, { kind: string; targetId: string; label: string; messageId: string; at: string; count: number }>();
    for (const r of rows) {
      const key = refKey({ kind: r.kind, id: r.targetId });
      const seen = latest.get(key);
      if (seen) seen.count += 1;
      else latest.set(key, { kind: r.kind, targetId: r.targetId, label: r.label, messageId: r.messageId, at: r.createdAt.toISOString(), count: 1 });
    }
    const items = [...latest.values()].filter((r) => isRefKind(r.kind));
    const cards = await this.cards(user, items.map((r) => ({ kind: r.kind as RefKind, id: r.targetId })));
    return {
      refs: items.map((r) => {
        const c = cards.get(refKey({ kind: r.kind, id: r.targetId }));
        return {
          ...(c ?? refStub(r)),
          label: r.label,
          title: c?.title || r.label,
          messageId: r.messageId,
          at: r.at,
          count: r.count,
        };
      }),
    };
  }

  // ─── Avisos ──────────────────────────────────────────────────────────────

  /**
   * A quién le importa que se mencione algo: la tarea, a quienes la tienen y a quien la
   * pidió; la OC y el anticipo, a quien los pidió; el formato, a quien lo llenó; el
   * documento, a quien lo hizo. El evento no avisa: es contexto, sería puro ruido.
   *
   * Quien no puede leer la conversación recibe el aviso sin el texto y con liga a la cosa.
   */
  async notifyFor(
    actor: RefViewer,
    channel: {
      id: string;
      organizationId: string;
      name: string;
      kind: ChatChannelKind;
      isGroupDm: boolean;
      eventId: string | null;
      entity: EntityKey | null;
    },
    message: { id: string; body: string; refs?: Array<{ kind: string; targetId: string; label: string }> | null },
    opts: { memberIds: Set<string>; skip: Set<string> },
  ) {
    const refs = (message.refs ?? []).filter((r) => isRefKind(r.kind) && r.kind !== 'event');
    if (refs.length === 0 || !this.notifications) return;

    const idsOf = (kind: RefKind) => refs.filter((r) => r.kind === kind).map((r) => r.targetId);
    const [tasks, pos, formats, docs, advances] = await Promise.all([
      idsOf('task').length
        ? this.prisma.taskAssignment.findMany({
            where: { id: { in: idsOf('task') } },
            select: {
              id: true,
              title: true,
              eventId: true,
              status: true,
              assigneeId: true,
              createdById: true,
              createdAt: true,
              coAssignees: { select: { userId: true } },
            },
          })
        : [],
      idsOf('po').length
        ? this.prisma.purchaseOrder.findMany({ where: { id: { in: idsOf('po') } }, select: { id: true, createdById: true } })
        : [],
      idsOf('format').length
        ? this.prisma.checklistInstance.findMany({
            where: { id: { in: idsOf('format') } },
            select: { id: true, title: true, eventId: true, lastEditedById: true },
          })
        : [],
      idsOf('doc').length
        ? this.prisma.eventDocument.findMany({
            where: { id: { in: idsOf('doc') } },
            select: { id: true, title: true, eventId: true, createdById: true },
          })
        : [],
      idsOf('advance').length
        ? this.prisma.paymentProof.findMany({
            where: { id: { in: idsOf('advance') }, purchaseOrderId: null },
            select: { id: true, uploadedById: true },
          })
        : [],
    ]);

    // Un aviso por persona y mensaje: el primero que le toca (lo escrito antes manda).
    const plan = new Map<string, { role: ChatRefRole; label: string; link: string; type: string }>();
    const add = (userId: string | null | undefined, item: { role: ChatRefRole; label: string; link: string; type: string }) => {
      if (!userId || userId === actor.id || opts.skip.has(userId) || plan.has(userId)) return;
      plan.set(userId, item);
    };
    for (const ref of refs) {
      if (ref.kind === 'task') {
        const t = tasks.find((x) => x.id === ref.targetId);
        if (!t || t.status === 'DONE') continue;
        // Recién creada desde el chat: a sus responsables ya les llegó «te asignó».
        if (t.createdById === actor.id && Date.now() - t.createdAt.getTime() < JUST_CREATED_MS) continue;
        const link = t.eventId ? `/events/${t.eventId}?tab=tasks&task=${t.id}` : `/tasks?task=${t.id}`;
        for (const uid of taskAssigneeIds(t)) add(uid, { role: 'task_owner', label: ref.label, link, type: 'chat.ref.task' });
        add(t.createdById, { role: 'task_requester', label: ref.label, link, type: 'chat.ref.task_requested' });
      } else if (ref.kind === 'po') {
        const p = pos.find((x) => x.id === ref.targetId);
        if (p) add(p.createdById, { role: 'po_owner', label: ref.label, link: `/purchase-orders?po=${p.id}`, type: 'chat.ref.po' });
      } else if (ref.kind === 'format') {
        const f = formats.find((x) => x.id === ref.targetId);
        if (f) {
          add(f.lastEditedById, {
            role: 'format_owner',
            label: ref.label,
            link: `/events/${f.eventId}?tab=checklists&checklist=${f.id}`,
            type: 'chat.ref.format',
          });
        }
      } else if (ref.kind === 'doc') {
        const d = docs.find((x) => x.id === ref.targetId);
        if (d) add(d.createdById, { role: 'doc_owner', label: ref.label, link: `/events/${d.eventId}?tab=files&doc=${d.id}`, type: 'chat.ref.doc' });
      } else if (ref.kind === 'advance') {
        const a = advances.find((x) => x.id === ref.targetId);
        if (a) add(a.uploadedById, { role: 'advance_owner', label: ref.label, link: `/advances?advance=${a.id}`, type: 'chat.ref.advance' });
      }
    }
    if (plan.size === 0) return;

    const people = await this.prisma.user.findMany({
      where: { id: { in: [...plan.keys()] }, active: true },
      select: { id: true, roleKey: true, entities: true },
    });
    const where =
      channel.kind === ChatChannelKind.DIRECT ? '' : channel.isGroupDm ? channel.name : `#${channel.name}`;
    const preview = chatPreview(message.body);
    await this.notifications.notifyMany(
      people.map((person) => {
        const item = plan.get(person.id)!;
        const reads = this.canReadChannel(person, channel, opts.memberIds.has(person.id));
        return {
          userId: person.id,
          organizationId: channel.organizationId,
          actorId: actor.id,
          type: item.type,
          ...chatRefNotice(item.role, {
            actor: actor.fullName,
            where: reads ? where : '',
            label: item.label,
            preview: reads ? preview : '',
          }),
          linkUrl: reads ? `/chat?channel=${channel.id}&msg=${message.id}` : item.link,
          entity: channel.entity ?? undefined,
          // El aviso abre la conversación, pero se trata de esta cosa: sus botones actúan sobre ella.
          target: targetFromLink(item.link),
        };
      }),
    );
  }

  /** Cambió una tarea u OC: las conversaciones que la mencionan refrescan su tarjeta. Nunca lanza. */
  async touched(kind: RefKind, id: string) {
    if (!this.realtime) return;
    try {
      const rows = await this.prisma.chatMessageRef.findMany({
        where: { kind, targetId: id },
        distinct: ['channelId'],
        select: { channelId: true },
      });
      for (const r of rows) this.realtime.emitToChannel(r.channelId, 'chat:refs-changed', { kind, id });
    } catch (err) {
      this.logger.warn(`No se pudo refrescar la referencia ${kind}:${id}: ${String(err)}`);
    }
  }
}
