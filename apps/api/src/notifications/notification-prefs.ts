/**
 * Preferencias de avisos de cada persona (`User.notificationPrefs`).
 *
 * La campana siempre recibe todo: esto decide solo qué llega al teléfono o al
 * navegador como push. Dos llaves, las mismas en la web y en las apps:
 *
 * - `muted`: categorías que no quiere en el teléfono.
 * - `quietHours`: de noche solo llega lo que no espera (aprobaciones, tareas y
 *   eventos urgentes). Se mide en la hora de Puebla.
 *
 * Sin nada guardado: todo llega, siempre.
 */
import { ORG_TZ } from './notification-text';

export const MUTABLE_CHANNELS = ['chat', 'approvals', 'tasks', 'finance', 'events', 'documents', 'general'] as const;
export type MutableChannel = (typeof MUTABLE_CHANNELS)[number];

export type QuietHours = { enabled: boolean; start: string; end: string };
export type NotificationPrefs = { muted: MutableChannel[]; quietHours: QuietHours };

export const DEFAULT_PREFS: NotificationPrefs = {
  muted: [],
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lo guardado (o lo que manda el cliente), siempre con la forma completa y valores válidos. */
export function normalizePrefs(raw: unknown): NotificationPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as {
    muted?: unknown;
    quietHours?: { enabled?: unknown; start?: unknown; end?: unknown } | null;
  };
  const muted = Array.isArray(value.muted)
    ? MUTABLE_CHANNELS.filter((channel) => (value.muted as unknown[]).includes(channel))
    : [];
  const quiet = value.quietHours ?? {};
  return {
    muted,
    quietHours: {
      enabled: quiet.enabled === true,
      start: typeof quiet.start === 'string' && HHMM.test(quiet.start) ? quiet.start : DEFAULT_PREFS.quietHours.start,
      end: typeof quiet.end === 'string' && HHMM.test(quiet.end) ? quiet.end : DEFAULT_PREFS.quietHours.end,
    },
  };
}

function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** Minutos desde medianoche en la hora de Puebla. */
function localMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ORG_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/** ¿Estamos en horario silencioso? Cruza la medianoche si inicio > fin. */
export function inQuietHours(quiet: QuietHours, now: Date = new Date()): boolean {
  if (!quiet.enabled) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) return false;
  const at = localMinutes(now);
  return start < end ? at >= start && at < end : at >= start || at < end;
}

/** ¿Sale este push? Lo silencioso (sincronizar leídos) no pasa por aquí. */
export function pushAllowed(
  raw: unknown,
  push: { channel?: string | null; priority?: string | null },
  now: Date = new Date(),
): boolean {
  const prefs = normalizePrefs(raw);
  if (push.channel && prefs.muted.includes(push.channel as MutableChannel)) return false;
  if (!inQuietHours(prefs.quietHours, now)) return true;
  // De noche solo lo urgente, y un mensaje de chat puede esperar a la mañana.
  return push.priority === 'high' && push.channel !== 'chat';
}
