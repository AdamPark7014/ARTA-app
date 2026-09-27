/**
 * Cómo viaja cada tipo de aviso al teléfono: canal de Android (el usuario puede
 * silenciar uno sin perder los demás, como en WhatsApp) y prioridad.
 *
 * Los canales deben existir igual en la app (`ArtaNotifications.kt` / `PushManager.swift`).
 */
export type PushChannel = 'chat' | 'approvals' | 'tasks' | 'finance' | 'events' | 'general';

export type PushMeta = { channel: PushChannel; priority: 'high' | 'normal' };

/** Lo que pide una decisión de alguien (autorizar, revisar) suena aunque esté en segundo plano. */
const APPROVAL_TYPES = new Set(['po.requested', 'task.submitted', 'checklist.submitted']);
const URGENT_TASK_TYPES = new Set(['task.assigned', 'task.reassigned', 'task.rejected', 'task.blocked']);

export function pushMetaFor(type: string): PushMeta {
  const t = (type || '').toLowerCase();
  if (t.startsWith('chat.')) return { channel: 'chat', priority: 'high' };
  if (APPROVAL_TYPES.has(t) || t.endsWith('.review')) return { channel: 'approvals', priority: 'high' };
  if (t.startsWith('task.')) {
    return { channel: 'tasks', priority: URGENT_TASK_TYPES.has(t) ? 'high' : 'normal' };
  }
  if (t.startsWith('po.') || t.startsWith('finance.') || t.endsWith('.paid')) {
    return { channel: 'finance', priority: 'normal' };
  }
  if (t.startsWith('campaign.') || t.startsWith('convenios.') || t.startsWith('checklist.')) {
    return { channel: 'approvals', priority: 'normal' };
  }
  if (t.startsWith('event.')) return { channel: 'events', priority: 'normal' };
  return { channel: 'general', priority: 'normal' };
}

/** «Arturo Taja Ramírez» → «Arturo T.»: cabe en el título de un aviso. */
export function shortName(fullName?: string | null): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}
