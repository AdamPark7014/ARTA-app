/**
 * Textos de los avisos. La campana del panel, el push y las apps nativas pintan
 * el mismo `title` y `body` que salen de aquí.
 *
 * Junta con el cliente (23-10-2026): «especificidad en notificaciones». Cada
 * aviso dice quién hizo qué, sobre qué cosa y en qué evento; el monto si hay
 * dinero de por medio, y qué se espera de quien lo lee y hasta cuándo. En vez de
 * «Nueva orden de compra»:
 *
 *   Mateo R. pide autorizar la OC 4F2A9C
 *   Sonido Quetzal Pro · $37,700 · Noche de Boleros. Autorízala o recházala; el evento es el sáb 25 oct.
 *
 * El título es corto (una línea en el teléfono) y el cuerpo lleva el detalle;
 * los dos se recortan en palabra. Los tipos (`po.requested`…) y los canales
 * push no cambian: solo el texto.
 */
import { shortName } from './notification-push-meta';

/** Lo que cabe en la línea de título de iOS y Android sin cortarse. */
export const TITLE_MAX = 65;
/** iOS enseña unas 4 líneas en la pantalla bloqueada; Android, ~1 plegado y ~8 desplegado. */
export const BODY_MAX = 178;
/** Las fechas se dicen en la hora de Puebla, no en la del servidor (UTC). */
export const ORG_TZ = 'America/Mexico_City';

type Part = string | null | undefined | false;

export type Notice = { title: string; body: string };

/** Recorta en palabra y cierra con «…». */
export function clip(text: string | null | undefined, max: number): string {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s·,.;:–—-]+$/u, '')}…`;
}

/** Une las partes con « · » y se salta las vacías. */
export function facts(...parts: Part[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .join(' · ');
}

/** «$37,700» (sin centavos cuando son cero) · «$1,250.50». */
export function money(amount: unknown, currency = 'MXN'): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return '';
  const cents = Math.round(Math.abs(n) * 100) % 100 !== 0;
  try {
    return n.toLocaleString('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    });
  } catch {
    return `$${n.toFixed(cents ? 2 : 0)}`;
  }
}

/** «Arturo Taja» → «Arturo T.»; sin nombre, el respaldo. */
export function who(fullName: string | null | undefined, fallback = 'Alguien del equipo'): string {
  return shortName(fullName) || fallback;
}

/**
 * Título y cuerpo: «hechos · separados. Lo que se espera.» Si no cabe, se
 * recortan los hechos y la acción se queda entera: es lo que hay que hacer.
 */
export function notice(title: string, factLine: string, action?: Part): Notice {
  const t = clip(title, TITLE_MAX);
  const a = typeof action === 'string' ? action.replace(/\s+/g, ' ').trim() : '';
  const f = (factLine || '').trim();
  if (!a) return { title: t, body: clip(f, BODY_MAX) };
  if (!f) return { title: t, body: clip(a, BODY_MAX) };
  const room = BODY_MAX - a.length - 2;
  const head = room >= 40 ? clip(f, room) : f;
  const sep = /[.!?…]$/u.test(head) ? ' ' : '. ';
  return { title: t, body: clip(`${head}${sep}${a}`, BODY_MAX) };
}

/* ── Fechas ──────────────────────────────────────────────────────────────── */

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type DayParts = { y: number; m: number; d: number; hh: number; mm: number };

function partsIn(date: Date, timeZone: string): DayParts {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).formatToParts(date);
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour') % 24, mm: get('minute') };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El panel manda la fecha de entrega como `2026-10-24`: queda a medianoche UTC y es «solo día». */
export function isDateOnly(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

function dayOf(date: Date, timeZone: string): DayParts {
  return isDateOnly(date) ? partsIn(date, 'UTC') : partsIn(date, timeZone);
}

/** Días de calendario entre hoy (en la zona) y la fecha: 0 hoy, 1 mañana, -1 ayer. */
export function daysFromToday(
  value: Date | string | null | undefined,
  now: Date = new Date(),
  timeZone = ORG_TZ,
): number | null {
  const date = toDate(value);
  if (!date) return null;
  const p = dayOf(date, timeZone);
  const t = partsIn(now, timeZone);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t.y, t.m - 1, t.d)) / 86_400_000);
}

/** «hoy», «mañana», «ayer», «el vie 24 oct» (con año si no es este). */
export function dayLabel(value: Date | string | null | undefined, now: Date = new Date(), timeZone = ORG_TZ): string {
  const date = toDate(value);
  if (!date) return '';
  const diff = daysFromToday(date, now, timeZone) as number;
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  const p = dayOf(date, timeZone);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  const year = p.y !== partsIn(now, timeZone).y ? ` ${p.y}` : '';
  return `el ${DAYS[weekday]} ${p.d} ${MONTHS[p.m - 1]}${year}`;
}

/** Como `dayLabel`, más la hora cuando la fecha la trae: «hoy a las 18:00». */
export function whenLabel(value: Date | string | null | undefined, now: Date = new Date(), timeZone = ORG_TZ): string {
  const date = toDate(value);
  if (!date) return '';
  const day = dayLabel(date, now, timeZone);
  if (isDateOnly(date)) return day;
  const p = partsIn(date, timeZone);
  return `${day} a las ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

/* ── Órdenes de compra ───────────────────────────────────────────────────── */

/** El mismo folio que imprime el PDF de la OC al pie: «OC 4F2A9C». */
export function poRef(id: string | null | undefined): string {
  const tail = String(id || '').slice(-6).toUpperCase();
  return tail ? `OC ${tail}` : 'OC';
}

const PAYMENT_WORDS: Record<string, string> = {
  EFECTIVO: 'efectivo',
  TRANSFERENCIA: 'transferencia',
  CHEQUE: 'cheque',
  TARJETA: 'tarjeta',
  OTRO: 'otro medio',
};

export function paymentWord(method?: string | null): string {
  return PAYMENT_WORDS[method || 'TRANSFERENCIA'] || 'transferencia';
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Días de cobro, ya resueltos: si hoy se paga y, si no, cuándo («mañana», «el lunes»). */
export type PayDay = { open: boolean; next: string | null } | null;

/** «hoy, día de cobro» · «el lunes, próximo día de cobro» · «» si la regla está apagada. */
export function payWhen(payDay: PayDay): string {
  if (!payDay) return '';
  if (payDay.open) return 'hoy, día de cobro';
  return payDay.next ? `${payDay.next}, próximo día de cobro` : 'en día de cobro';
}

export type PoNoticeKind =
  | 'requested'
  | 'updated'
  | 'deleted'
  | 'deleted_mine'
  | 'authorized'
  | 'to_pay'
  | 'paid'
  | 'rejected'
  | 'cancelled'
  | 'reverted'
  | 'reverted_draft'
  | 'proof';

export type PoNoticeInput = {
  actor?: string | null;
  order: {
    id: string;
    vendorName?: string | null;
    amount: unknown;
    paymentMethod?: string | null;
    status?: string | null;
    proofCount?: number | null;
  };
  event: { name: string; startsAt?: Date | string | null };
  payDay?: PayDay;
  /** Monto antes del cambio (`updated`). */
  previousAmount?: unknown;
  /** Monto del comprobante (`proof`), si no es el de la orden. */
  proofAmount?: unknown;
  now?: Date;
};

/** Avisos de OC: «Mateo R. pide autorizar la OC 4F2A9C» + proveedor · monto · evento + qué sigue. */
export function poNotice(kind: PoNoticeKind, input: PoNoticeInput): Notice {
  const { order, event } = input;
  const now = input.now ?? new Date();
  const actor = who(input.actor, kind === 'paid' || kind === 'proof' ? 'Finanzas' : 'Alguien del equipo');
  const ref = poRef(order.id);
  const vendor = order.vendorName?.trim() || 'Sin proveedor';
  const total = money(order.amount);
  const method = paymentWord(order.paymentMethod);
  const cash = (order.paymentMethod || 'TRANSFERENCIA') === 'EFECTIVO';
  const when = payWhen(input.payDay ?? null);
  const base = facts(vendor, total, event.name);
  const eventDay = (daysFromToday(event.startsAt, now) ?? -1) >= 0 ? dayLabel(event.startsAt, now) : '';

  switch (kind) {
    case 'requested':
      return notice(
        `${actor} pide autorizar la ${ref}`,
        base,
        `Autorízala o recházala${eventDay ? `; el evento es ${eventDay}` : ''}.`,
      );
    case 'updated': {
      const before = input.previousAmount == null ? null : Number(input.previousAmount);
      const changed = before != null && Number.isFinite(before) && before !== Number(order.amount);
      return notice(
        `${actor} cambió la ${ref} por autorizar`,
        facts(vendor, changed ? `${money(before)} → ${total}` : total, event.name),
        'Revísala de nuevo antes de autorizar.',
      );
    }
    case 'deleted':
      return notice(`${actor} eliminó la ${ref}`, base, 'Ya no hay que autorizarla.');
    case 'deleted_mine':
      return notice(`${actor} eliminó tu ${ref}`, base, 'Si aún hace falta, crea otra.');
    case 'authorized':
      return notice(
        `${actor} autorizó tu ${ref}`,
        base,
        cash
          ? `Falta pagarla en efectivo${when ? ` ${when}` : ''}.`
          : `Falta el comprobante de ${method} y pagarla${when ? ` ${when}` : ''}.`,
      );
    case 'to_pay': {
      const proofs = order.proofCount ?? 0;
      return notice(
        `${actor} autorizó la ${ref}: falta pagarla`,
        facts(vendor, total, event.name, cap(method)),
        !cash && proofs === 0
          ? `Sube el comprobante y márcala pagada${when ? ` ${when}` : ''}.`
          : `Márcala pagada${when ? ` ${when}` : ''}.`,
      );
    }
    case 'paid':
      return notice(`${actor} pagó tu ${ref}`, facts(vendor, total, event.name, cap(method)), 'Queda completa.');
    case 'rejected':
      return notice(`${actor} rechazó tu ${ref}`, base, 'No se pagará; si sigue haciendo falta, crea otra.');
    case 'cancelled':
      return notice(`${actor} canceló tu ${ref}`, base, 'No se pagará.');
    case 'reverted':
      return notice(`${actor} regresó tu ${ref} a «Sin autorizar»`, base, 'Espera de nuevo el visto bueno.');
    case 'reverted_draft':
      return notice(`${actor} regresó tu ${ref} a borrador`, base, 'Revísala; se puede editar antes de autorizar.');
    case 'proof':
      return notice(
        `${actor} subió el comprobante de tu ${ref}`,
        facts(vendor, money(input.proofAmount ?? order.amount), event.name),
        order.status === 'AUTHORIZED' ? `Solo falta marcarla pagada${when ? ` ${when}` : ''}.` : null,
      );
  }
}

/** Recordatorio diario de OC estancadas (cron): cuántas, cuánto, en qué paso y la más vieja. */
export function poAgingNotice(input: {
  unauthorized: { count: number; amount: number };
  unpaid: { count: number; amount: number };
  oldest?: { vendorName?: string | null; eventName?: string | null; days: number } | null;
}): Notice {
  const total = input.unauthorized.count + input.unpaid.count;
  const title =
    total === 1 ? '1 OC lleva más de 7 días abierta' : `${total} OC llevan más de 7 días abiertas`;
  const line = facts(
    input.unauthorized.count ? `${input.unauthorized.count} sin autorizar (${money(input.unauthorized.amount)})` : '',
    input.unpaid.count
      ? `${input.unpaid.count} ${input.unpaid.count === 1 ? 'autorizada' : 'autorizadas'} sin pagar (${money(input.unpaid.amount)})`
      : '',
    input.oldest
      ? `la más antigua: ${facts(input.oldest.vendorName || 'Sin proveedor', input.oldest.eventName)} (${input.oldest.days} días)`
      : '',
  );
  return notice(
    title,
    line,
    input.unauthorized.count ? 'Autoriza o rechaza las que esperan tu visto bueno.' : 'Revisa por qué siguen sin pagarse.',
  );
}

/* ── Anticipos y corrida financiera ──────────────────────────────────────── */

export type AdvanceNoticeKind = 'requested' | 'approved' | 'to_pay' | 'rejected' | 'paid';

export function advanceNotice(
  kind: AdvanceNoticeKind,
  input: {
    actor?: string | null;
    label?: string | null;
    amount: unknown;
    event: { name: string };
    requester?: string | null;
    note?: string | null;
    reason?: string | null;
    hasProof?: boolean;
  },
): Notice {
  const total = money(input.amount);
  const label = input.label?.trim() && input.label.trim().toLowerCase() !== 'anticipo' ? input.label.trim() : '';
  const base = facts(label, input.event.name);
  switch (kind) {
    case 'requested':
      return notice(
        `${who(input.actor)} pide un anticipo de ${total}`,
        facts(label, input.event.name, input.note ? `«${clip(input.note, 60)}»` : ''),
        'Apruébalo o recházalo.',
      );
    case 'approved':
      return notice(`${who(input.actor, 'Dirección')} aprobó tu anticipo de ${total}`, base, 'Falta que lo paguen.');
    case 'to_pay':
      return notice(
        `${who(input.actor, 'Dirección')} aprobó un anticipo: falta pagarlo`,
        facts(label, total, input.event.name, input.requester ? `lo pidió ${who(input.requester)}` : ''),
        'Págalo y márcalo pagado.',
      );
    case 'rejected':
      return notice(
        `${who(input.actor, 'Dirección')} rechazó tu anticipo de ${total}`,
        facts(label, input.event.name, input.reason ? `Motivo: ${clip(input.reason, 90)}` : ''),
        'Si sigue haciendo falta, pide otro.',
      );
    case 'paid':
      return notice(
        `${who(input.actor, 'Finanzas')} pagó tu anticipo de ${total}`,
        base,
        input.hasProof ? 'El comprobante está en Anticipos.' : null,
      );
  }
}

export function financeNotice(
  kind: 'sealed' | 'unlocked',
  input: { actor?: string | null; event: { name: string }; reason?: string | null },
): Notice {
  if (kind === 'sealed') {
    return notice(
      `${who(input.actor, 'Finanzas')} selló la corrida financiera`,
      input.event.name,
      'Ya no se edita; para cambiarla hay que quitar el sello.',
    );
  }
  return notice(
    `${who(input.actor, 'Dirección')} quitó el sello de la corrida`,
    facts(input.event.name, input.reason ? `Motivo: ${clip(input.reason, 90)}` : ''),
    'Ya se puede editar otra vez.',
  );
}

/* ── Tareas ──────────────────────────────────────────────────────────────── */

export type TaskNoticeKind =
  | 'assigned'
  | 'reassigned'
  | 'evidence'
  | 'submitted'
  | 'done'
  | 'approved'
  | 'rejected'
  | 'unassigned'
  | 'reopened'
  | 'due_changed'
  | 'updated'
  | 'blocked'
  | 'status_changed'
  | 'deleted'
  | 'due_soon'
  | 'overdue';

export type TaskNoticeInput = {
  actor?: string | null;
  task: { title: string; dueAt?: Date | string | null };
  event?: { name: string } | null;
  /** Motivo del rechazo o del bloqueo. */
  note?: string | null;
  /** Nombre del archivo de evidencia. */
  evidence?: string | null;
  /** «título, fecha de entrega» */
  changes?: string[];
  /** Estado nuevo, en palabras («En curso»). */
  status?: string | null;
  now?: Date;
};

/** «Ana R. te asignó: Montar escenario» + evento + hasta cuándo. */
export function taskNotice(kind: TaskNoticeKind, input: TaskNoticeInput): Notice {
  const now = input.now ?? new Date();
  const actor = who(input.actor);
  const task = clip(input.task.title, 48);
  const event = input.event?.name || '';
  const due = whenLabel(input.task.dueAt, now);
  const deadline = due ? ` a más tardar ${due}` : '';
  switch (kind) {
    case 'assigned':
    case 'reassigned':
      return notice(
        `${actor} ${kind === 'assigned' ? 'te asignó' : 'te pasó'}: ${task}`,
        event,
        due ? `Entrégala${deadline}.` : 'No tiene fecha de entrega.',
      );
    case 'evidence':
      return notice(`${actor} subió evidencia: ${task}`, facts(input.evidence, event));
    case 'submitted':
      return notice(`${actor} entregó para tu revisión: ${task}`, event, 'Apruébala o pide corrección.');
    case 'done':
      return notice(`${actor} terminó: ${task}`, event, 'No queda nada pendiente.');
    case 'approved':
      return notice(`${actor} aprobó tu entrega: ${task}`, event, 'Queda cerrada.');
    case 'rejected':
      return notice(
        `${actor} pide corregir: ${task}`,
        facts(input.note ? `«${clip(input.note, 100)}»` : '', event),
        `Corrígela y vuelve a entregarla${deadline}.`,
      );
    case 'unassigned':
      return notice(`${actor} te quitó de: ${task}`, event, 'Ya no te toca.');
    case 'reopened':
      return notice(`${actor} reabrió: ${task}`, event, due ? `Vuelve a entregarla${deadline}.` : 'Vuelve a trabajarla.');
    case 'due_changed':
      return notice(
        `${actor} cambió la fecha: ${task}`,
        facts(event, due ? `ahora vence ${due}` : 'ya no tiene fecha de entrega'),
      );
    case 'updated':
      return notice(
        `${actor} actualizó: ${task}`,
        facts(input.changes?.length ? `cambió ${input.changes.join(', ')}` : '', event),
        due ? `Sigue venciendo ${due}.` : null,
      );
    case 'blocked':
      return notice(
        `${actor} bloqueó: ${task}`,
        facts(input.note ? `«${clip(input.note, 100)}»` : '', event),
        `Revisa con ${actor} qué la detiene.`,
      );
    case 'status_changed':
      return notice(`${actor} la pasó a «${input.status || '—'}»: ${task}`, event);
    case 'deleted':
      return notice(`${actor} eliminó: ${task}`, event, 'Ya no hay que hacerla.');
    case 'due_soon':
      return notice(`Vence ${due || 'pronto'}: ${task}`, event, 'Entrégala a tiempo.');
    case 'overdue':
      return notice(
        `Venció ${due || 'ya'}: ${task}`,
        event,
        'Entrégala o pide otra fecha a quien te la asignó.',
      );
  }
}

/* ── Eventos ─────────────────────────────────────────────────────────────── */

export type EventNoticeKind =
  | 'created'
  | 'closed'
  | 'reopened'
  | 'cancelled'
  | 'deleted'
  | 'rescheduled'
  | 'updated';

export function eventNotice(
  kind: EventNoticeKind,
  input: {
    actor?: string | null;
    event: { name: string; startsAt?: Date | string | null; venue?: string | null };
    previousStartsAt?: Date | string | null;
    changes?: string[];
    now?: Date;
  },
): Notice {
  const now = input.now ?? new Date();
  const actor = who(input.actor, 'Dirección');
  const name = clip(input.event.name, 40);
  const when = whenLabel(input.event.startsAt, now);
  switch (kind) {
    case 'created':
      return notice(`${actor} creó ${name}`, facts(when, input.event.venue));
    case 'closed':
      return notice(`${actor} cerró ${name}`, when, 'Ya no se editan tareas, formatos ni OC.');
    case 'reopened':
      return notice(`${actor} reabrió ${name}`, when, 'Ya se pueden editar tareas, formatos y OC.');
    case 'cancelled':
      return notice(`${actor} canceló ${name}`, when, 'Ya no se editan tareas, formatos ni OC.');
    case 'deleted':
      return notice(`${actor} eliminó el evento ${name}`, when);
    case 'rescheduled': {
      const before = whenLabel(input.previousStartsAt, now);
      return notice(
        `${actor} cambió la fecha de ${name}`,
        facts(when ? `ahora ${when}` : '', before ? `antes ${before}` : ''),
        'Revisa las fechas de tus tareas.',
      );
    }
    case 'updated':
      return notice(
        `${actor} actualizó ${name}`,
        facts(input.changes?.length ? `cambió ${input.changes.join(', ')}` : '', when),
      );
  }
}

/** Escaneo diario: «En riesgo: Noche de Boleros» + avance de formatos y días que faltan. */
export function eventRiskNotice(input: { name: string; avg: number; days: number | null }): Notice {
  const left =
    input.days == null || input.days < 0
      ? ''
      : input.days === 0
        ? 'el evento es hoy'
        : input.days === 1
          ? 'el evento es mañana'
          : `faltan ${input.days} días`;
  return notice(
    `En riesgo: ${clip(input.name, 50)}`,
    facts(`formatos al ${Math.round(input.avg)} %`, left),
    'Revisa los formatos pendientes.',
  );
}

/* ── Chat ────────────────────────────────────────────────────────────────── */

export function chatMembershipNotice(
  kind: 'added' | 'removed',
  input: { actor?: string | null; channel: { name: string; isGroupDm: boolean } },
): Notice {
  const actor = who(input.actor, 'Alguien');
  const group = input.channel.isGroupDm;
  if (kind === 'added') {
    return notice(
      `${actor} te agregó ${group ? `al grupo ${input.channel.name}` : `a #${input.channel.name}`}`,
      input.channel.isGroupDm ? 'Ya puedes leer y escribir en el grupo.' : 'Ya ves y escribes en el canal.',
    );
  }
  return notice(
    `${actor} te quitó ${group ? `del grupo ${input.channel.name}` : `de #${input.channel.name}`}`,
    'Ya no ves sus mensajes.',
  );
}

export function chatReportNotice(input: {
  where: string;
  reason: string;
  author?: string | null;
  preview: string;
}): Notice {
  return notice(
    `Reportaron un mensaje en ${input.where}`,
    facts(input.reason, `${who(input.author, 'Alguien')}: «${clip(input.preview, 90)}»`),
    'Revísalo y decide si se oculta.',
  );
}

/* ── Boletera ────────────────────────────────────────────────────────────── */

/** «Boletos agotados: Noche de Boleros» · «1,200 de 1,200 boletos · el evento es el sáb 25 oct». */
export function ticketingMilestoneNotice(input: {
  event: { name: string; startsAt?: Date | string | null };
  milestone: number;
  sold?: number;
  capacity?: number;
  now?: Date;
}): Notice {
  const now = input.now ?? new Date();
  const name = clip(input.event.name, 40);
  const count =
    input.capacity && input.capacity > 0
      ? `${(input.sold ?? 0).toLocaleString('es-MX')} de ${input.capacity.toLocaleString('es-MX')} boletos`
      : '';
  const days = daysFromToday(input.event.startsAt, now);
  const eventDay = days != null && days >= 0 ? `el evento es ${dayLabel(input.event.startsAt, now)}` : '';
  if (input.milestone >= 100) {
    return notice(`Boletos agotados: ${name}`, facts(count, eventDay));
  }
  return notice(`${name}: ${input.milestone} % vendido`, facts(count, eventDay));
}

/* ── Formatos (checklists) y campañas ────────────────────────────────────── */

export type ChecklistNoticeKind =
  | 'submitted'
  | 'approved'
  | 'sealed'
  | 'returned'
  | 'reopened'
  | 'signature_needed'
  | 'signed';

/** «Ana R. mandó a revisión: Rider técnico» + evento + qué se espera. */
export function checklistNotice(
  kind: ChecklistNoticeKind,
  input: { actor?: string | null; doc: { title: string }; event: { name: string } },
): Notice {
  const actor = who(input.actor);
  const doc = clip(input.doc.title, 45);
  const event = input.event.name;
  switch (kind) {
    case 'submitted':
      return notice(`${actor} mandó a revisión: ${doc}`, event, 'Apruébalo o regrésalo a borrador.');
    case 'approved':
      return notice(`${actor} aprobó tu formato: ${doc}`, event);
    case 'sealed':
      return notice(`${actor} selló tu formato: ${doc}`, event, 'Ya no se edita.');
    case 'returned':
      return notice(`${actor} regresó a borrador: ${doc}`, event, 'Corrígelo y vuelve a mandarlo a revisión.');
    case 'reopened':
      return notice(`${actor} reabrió el formato sellado: ${doc}`, event, 'Se puede editar otra vez.');
    case 'signature_needed':
      return notice(`${actor} firmó la entrega: ${doc}`, event, 'Falta la firma de autorización.');
    case 'signed':
      return notice(`${actor} firmó como Autorizado: ${doc}`, event, 'Queda autorizado.');
  }
}

/** Recorrido de la campaña (o de la campaña de convenios): quién la movió, de qué evento y qué sigue. */
export function campaignNotice(
  to: 'REVIEW' | 'AUTHORIZED' | 'PAID' | 'DRAFT',
  input: {
    actor?: string | null;
    scope: 'campaign' | 'convenios';
    event: { name: string; startsAt?: Date | string | null };
    now?: Date;
  },
): Notice {
  const now = input.now ?? new Date();
  const actor = who(input.actor);
  const what = input.scope === 'convenios' ? 'la campaña de convenios' : 'la campaña';
  const days = daysFromToday(input.event.startsAt, now);
  const line = facts(input.event.name, days != null && days >= 0 ? `el evento es ${dayLabel(input.event.startsAt, now)}` : '');
  switch (to) {
    case 'REVIEW':
      return notice(`${actor} mandó a revisión ${what}`, line, 'Autorízala o regrésala a borrador.');
    case 'AUTHORIZED':
      return notice(`${actor} autorizó ${what}`, line, 'Sigue registrar el pago.');
    case 'PAID':
      return notice(`${actor} marcó como pagada ${what}`, line);
    case 'DRAFT':
      return notice(`${actor} regresó ${what} a borrador`, line, 'Corrígela y vuelve a mandarla a revisión.');
  }
}
