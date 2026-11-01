/**
 * Cómo viaja cada tipo de aviso al teléfono: canal de Android (el usuario puede
 * silenciar uno sin perder los demás, como en WhatsApp) y prioridad.
 *
 * Los canales deben existir igual en la app (`ArtaNotifications.kt` / `PushManager.swift`).
 */
export type PushChannel = 'chat' | 'approvals' | 'tasks' | 'finance' | 'events' | 'documents' | 'general';

export type PushMeta = { channel: PushChannel; priority: 'high' | 'normal' };

/** Lo que pide una decisión de alguien (autorizar, revisar, firmar) suena aunque esté en segundo plano. */
const APPROVAL_TYPES = new Set([
  'advance.requested',
  'po.requested',
  'po.updated',
  'task.submitted',
  'checklist.submitted',
  'checklist.signature_needed',
]);
/** Esperan a alguien pero sin urgencia: van a Aprobaciones con prioridad normal. */
const PENDING_TYPES = new Set(['checklist.returned', 'checklist.signature_backlog', 'po.aging']);
const URGENT_TASK_TYPES = new Set([
  'task.assigned',
  'task.reassigned',
  'task.rejected',
  'task.blocked',
  'task.reopened',
  'task.due_soon',
  'task.overdue',
]);
const URGENT_EVENT_TYPES = new Set(['event.cancelled', 'event.rescheduled', 'event.deleted', 'event.risk']);
/** Anticipo por pagar o rechazado: alguien tiene que moverse. Aprobado y pagado, solo para enterarse. */
const URGENT_FINANCE_TYPES = new Set(['advance.to_pay', 'advance.rejected']);

export function pushMetaFor(type: string): PushMeta {
  const t = (type || '').toLowerCase();
  if (t.startsWith('chat.')) return { channel: 'chat', priority: 'high' };
  if (APPROVAL_TYPES.has(t) || t.endsWith('.review')) return { channel: 'approvals', priority: 'high' };
  if (PENDING_TYPES.has(t)) return { channel: 'approvals', priority: 'normal' };
  if (t.startsWith('task.')) {
    return { channel: 'tasks', priority: URGENT_TASK_TYPES.has(t) ? 'high' : 'normal' };
  }
  if (t.startsWith('po.') || t.startsWith('finance.') || t.startsWith('advance.') || t.endsWith('.paid')) {
    return { channel: 'finance', priority: URGENT_FINANCE_TYPES.has(t) ? 'high' : 'normal' };
  }
  if (t.startsWith('campaign.') || t.startsWith('convenios.')) {
    return { channel: 'approvals', priority: 'normal' };
  }
  // Formatos ya resueltos, archivos, carpetas y documentos: solo para enterarse.
  if (/^(checklist|document|file|folder|slot)\./.test(t)) {
    return { channel: 'documents', priority: 'normal' };
  }
  if (t.startsWith('event.') || t.startsWith('ticketing.')) {
    return { channel: 'events', priority: URGENT_EVENT_TYPES.has(t) || t === 'ticketing.sold_out' ? 'high' : 'normal' };
  }
  return { channel: 'general', priority: 'normal' };
}

/**
 * De qué trata el aviso. La liga dice dónde se abre; esto dice sobre qué actúan sus botones.
 * Se saca de la liga para que todos los avisos de siempre lo tengan sin tocarlos uno por uno.
 */
export type PushTargetKind = 'task' | 'event' | 'po' | 'format' | 'doc' | 'advance' | 'message';
export type PushTarget = { kind: PushTargetKind; id: string };

export function targetFromLink(link?: string | null): PushTarget | null {
  if (!link) return null;
  const param = (name: string) => new RegExp(`[?&]${name}=([^&#]+)`).exec(link)?.[1] ?? null;
  const pick = (kind: PushTargetKind, id: string | null): PushTarget | null => (id ? { kind, id } : null);
  return (
    pick('task', param('task')) ??
    pick('format', param('checklist')) ??
    pick('doc', param('doc')) ??
    pick('po', param('po')) ??
    pick('advance', param('advance')) ??
    pick('message', link.startsWith('/chat') ? param('msg') : null) ??
    pick('event', /^\/events\/([^/?#]+)/.exec(link)?.[1] ?? null)
  );
}

/**
 * Botones del aviso, por caso de uso (docs/AVISOS.md § Casos):
 * - `task.deliver`: te toca a ti. Entrega con una nota escrita ahí mismo.
 * - `task.approve`: esperan tu visto bueno y se aprueba con un toque.
 * - `review`: dinero o firma. Nunca se aprueba a ciegas: el botón abre la pantalla.
 * - `reply`: conversación.
 */
export type PushAction = 'open' | 'reply' | 'task.deliver' | 'task.approve' | 'review';

const TASK_TO_DELIVER = new Set([
  'task.assigned',
  'task.reassigned',
  'task.rejected',
  'task.reopened',
  'task.due_soon',
  'task.overdue',
  'chat.ref.task',
]);

export function pushActionsFor(type: string, target?: PushTarget | null): PushAction[] {
  const t = (type || '').toLowerCase();
  if (TASK_TO_DELIVER.has(t) && target?.kind === 'task') return ['task.deliver', 'open'];
  if (t === 'task.submitted' && target?.kind === 'task') return ['task.approve', 'open'];
  if (APPROVAL_TYPES.has(t) || PENDING_TYPES.has(t) || t.endsWith('.review')) return ['review'];
  if (t.startsWith('chat.ref.')) return ['open'];
  if (t.startsWith('chat.')) return ['reply', 'open'];
  return target ? ['open'] : [];
}

/** Categoría de iOS que dibuja esos botones. `null`: la de siempre (chat o evento). */
export function pushCategoryFor(actions: PushAction[]): string | null {
  if (actions.includes('task.deliver')) return 'ARTA_TASK';
  if (actions.includes('task.approve')) return 'ARTA_TASK_REVIEW';
  if (actions.includes('review')) return 'ARTA_APPROVAL';
  return null;
}

/** «Arturo Taja Ramírez» → «Arturo T.»: cabe en el título de un aviso. */
export function shortName(fullName?: string | null): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}
