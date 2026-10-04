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

export function pushMetaFor(type: string): PushMeta {
  const t = (type || '').toLowerCase();
  if (t.startsWith('chat.')) return { channel: 'chat', priority: 'high' };
  if (APPROVAL_TYPES.has(t) || t.endsWith('.review')) return { channel: 'approvals', priority: 'high' };
  if (PENDING_TYPES.has(t)) return { channel: 'approvals', priority: 'normal' };
  if (t.startsWith('task.')) {
    return { channel: 'tasks', priority: URGENT_TASK_TYPES.has(t) ? 'high' : 'normal' };
  }
  if (t.startsWith('po.') || t.startsWith('finance.') || t.endsWith('.paid')) {
    return { channel: 'finance', priority: 'normal' };
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

/** «Arturo Taja Ramírez» → «Arturo T.»: cabe en el título de un aviso. */
export function shortName(fullName?: string | null): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}
