/**
 * Cómo se presenta cada aviso según su tipo. Las categorías son las mismas que
 * usa el push (`apps/api/src/notifications/notification-push-meta.ts`) y las que
 * se pueden apagar en Configuración.
 */
export type NoticeChannel = 'chat' | 'approvals' | 'tasks' | 'finance' | 'events' | 'documents' | 'general';

export const CHANNEL_LABELS: Record<NoticeChannel, string> = {
  chat: 'Chat',
  approvals: 'Aprobaciones',
  tasks: 'Tareas',
  finance: 'Finanzas',
  events: 'Eventos',
  documents: 'Documentos',
  general: 'General',
};

/** Qué entra en cada categoría, para la pantalla de preferencias. */
export const CHANNEL_HINTS: Record<NoticeChannel, string> = {
  chat: 'Mensajes, menciones y respuestas.',
  approvals: 'Lo que espera tu visto bueno, tu firma o tu revisión.',
  tasks: 'Lo que te asignan, lo que vence y lo que te regresan.',
  finance: 'Órdenes de compra, anticipos y corrida.',
  events: 'Cambios de fecha, cancelaciones y boletera.',
  documents: 'Archivos, carpetas y formatos ya resueltos.',
  general: 'Lo demás de tu cuenta y de la organización.',
};

/** Trazos de ícono de línea (24×24), como los del menú. */
export const CHANNEL_ICONS: Record<NoticeChannel, string> = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5.4A8 8 0 1 1 21 12z',
  approvals: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7',
  finance: 'M3 7h18v12H3zM3 11h18M16 15h2',
  events: 'M8 3v4M16 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  documents: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  general: 'M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.2h14l-1.5-3.5V8.5A5.5 5.5 0 0 0 12 3zM10 18a2 2 0 0 0 4 0',
};

const APPROVAL_TYPES = new Set([
  'advance.requested',
  'po.requested',
  'po.updated',
  'po.to_transfer',
  'task.submitted',
  'checklist.submitted',
  'checklist.signature_needed',
]);
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
const URGENT_FINANCE_TYPES = new Set(['advance.to_pay', 'advance.rejected', 'po.to_pay']);

export function channelOf(type: string | null | undefined): NoticeChannel {
  const t = (type || '').toLowerCase();
  if (t.startsWith('chat.')) return 'chat';
  if (APPROVAL_TYPES.has(t) || PENDING_TYPES.has(t) || t.endsWith('.review')) return 'approvals';
  if (t.startsWith('task.')) return 'tasks';
  if (t.startsWith('po.') || t.startsWith('finance.') || t.startsWith('advance.') || t.endsWith('.paid')) return 'finance';
  if (t.startsWith('campaign.') || t.startsWith('convenios.')) return 'approvals';
  if (/^(checklist|document|file|folder|slot)\./.test(t)) return 'documents';
  if (t.startsWith('event.') || t.startsWith('ticketing.')) return 'events';
  return 'general';
}

/** ¿Espera algo de quien lo lee? En la lista va con el ícono lleno y entra a «Por atender». */
export function needsAction(type: string | null | undefined): boolean {
  const t = (type || '').toLowerCase();
  return (
    APPROVAL_TYPES.has(t) ||
    PENDING_TYPES.has(t) ||
    URGENT_TASK_TYPES.has(t) ||
    URGENT_FINANCE_TYPES.has(t) ||
    t.endsWith('.review') ||
    t === 'chat.mention'
  );
}

const TASK_TO_DELIVER = new Set([
  'task.assigned',
  'task.reassigned',
  'task.rejected',
  'task.reopened',
  'task.due_soon',
  'task.overdue',
  'chat.ref.task',
]);

/**
 * El siguiente paso de un aviso sin leer, a un toque: entregar o revisar. Los mismos casos que los
 * botones del push (docs/AVISOS.md § Casos). Lo que solo informa no lleva botón.
 */
export function noticeAction(n: {
  type: string;
  targetKind?: string | null;
  targetId?: string | null;
  linkUrl?: string | null;
}): { label: string; href: string } | null {
  const t = (n.type || '').toLowerCase();
  const task =
    n.targetKind === 'task' ? n.targetId : n.targetKind ? null : (/[?&]task=([^&#]+)/.exec(n.linkUrl ?? '')?.[1] ?? null);
  if (task && TASK_TO_DELIVER.has(t)) return { label: 'Entregar', href: `/tasks?task=${task}&do=deliver` };
  if (task && t === 'task.submitted') return { label: 'Revisar', href: `/tasks?task=${task}` };
  if (n.linkUrl && channelOf(t) === 'approvals' && !t.startsWith('campaign.') && !t.startsWith('convenios.')) {
    return { label: 'Revisar', href: n.linkUrl };
  }
  return null;
}

/** «ahora», «hace 5 min», «hace 3 h»; de días pasados, la fecha. */
export function noticeAge(iso: string, now: number = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** «Hoy», «Ayer» o «Antes»: los grupos de la lista. */
export function noticeGroup(iso: string, now: Date = new Date()): 'Hoy' | 'Ayer' | 'Antes' {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (diff <= 0) return 'Hoy';
  return diff === 1 ? 'Ayer' : 'Antes';
}

export type GroupedNotices<T> = Array<{ label: 'Hoy' | 'Ayer' | 'Antes'; items: T[] }>;

export function groupNotices<T extends { createdAt: string }>(items: T[], now: Date = new Date()): GroupedNotices<T> {
  const groups: GroupedNotices<T> = [];
  const newestFirst = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const item of newestFirst) {
    const label = noticeGroup(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
