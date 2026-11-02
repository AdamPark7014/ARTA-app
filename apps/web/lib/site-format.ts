import { isSafeCtaHref } from './studio-templates';

/** Fecha de un show: la API la guarda a mediodía UTC, se pinta en UTC para no correrla de día. */
export function showDateParts(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const part = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('es-MX', { timeZone: 'UTC', ...opts }).replace(/\.$/, '');
  return {
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }).toUpperCase(),
    weekday: part({ weekday: 'short' }),
    year: part({ year: 'numeric' }),
    long: part({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    short: part({ day: 'numeric', month: 'short' }),
    /** «5 de noviembre», con el año solo si no es este. */
    dayMonth:
      d.getUTCFullYear() === new Date().getUTCFullYear()
        ? part({ day: 'numeric', month: 'long' })
        : part({ day: 'numeric', month: 'long', year: 'numeric' }),
    weekdayLong: part({ weekday: 'long' }),
  };
}

export function publishedLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
}

/** Hora del show para leerse (21:30 → 9:30 p. m.). */
export function showTimeLabel(time?: string | null): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!m) return '';
  const hours = Number(m[1]);
  const twelve = hours % 12 || 12;
  // Sin espacios normales: «8:30 p. m.» no se parte en dos renglones.
  return `${twelve}:${m[2]}\u00a0${hours < 12 ? 'a.\u00a0m.' : 'p.\u00a0m.'}`;
}

export const SHOW_STATUS_LABEL: Record<string, string> = {
  venta: 'A la venta',
  pronto: 'Próximamente',
  agotado: 'Agotado',
  pospuesto: 'Pospuesto',
  cancelado: 'Cancelado',
};

/** Estado que se enseña: el elegido en Studio o, si no, «A la venta» cuando hay enlace de boletos. */
export function showStatusOf(show: { showStatus?: string | null; ctaHref?: string | null }): string {
  if (show.showStatus && SHOW_STATUS_LABEL[show.showStatus]) return show.showStatus;
  return show.ctaHref ? 'venta' : 'pronto';
}

/** Solo se vende si el estado lo permite y hay enlace seguro. */
export function ticketHref(show: { showStatus?: string | null; ctaHref?: string | null }): string | null {
  const status = showStatusOf(show);
  if (status !== 'venta') return null;
  return safeHref(show.ctaHref);
}

/** Días que faltan para una fecha (UTC a mediodía). Hoy = 0; pasada = negativo. */
export function daysUntil(iso?: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((target - today) / 86400000);
}

export function countdownLabel(iso?: string | null): string {
  const days = daysUntil(iso);
  if (days === null || days < 0) return '';
  if (days === 0) return 'Es hoy';
  if (days === 1) return 'Es mañana';
  return `Faltan ${days} días`;
}

/** Para guardar un show en el calendario: Google por liga, Apple y Outlook con un archivo .ics. */
export function calendarLinks(show: {
  title: string;
  eventDate?: string | null;
  eventTime?: string | null;
  venue?: string | null;
  city?: string | null;
  excerpt?: string | null;
}) {
  if (!show.eventDate) return null;
  const d = new Date(show.eventDate);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toISOString().slice(0, 10).replace(/-/g, '');
  const time = /^(\d{2}):(\d{2})$/.exec(show.eventTime || '');
  const where = [show.venue, show.city].filter(Boolean).join(', ');
  // Sin hora se guarda como evento de todo el día. Con hora, tres horas: lo que suele durar una función.
  const nextDay = new Date(d.getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const start = time ? `${day}T${time[1]}${time[2]}00` : day;
  const end = time ? `${day}T${String(Math.min(Number(time[1]) + 3, 23)).padStart(2, '0')}${time[2]}00` : nextDay;
  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: show.title,
    dates: `${start}/${end}`,
    ctz: 'America/Mexico_City',
    location: where,
    details: show.excerpt || '',
  });
  const when = time
    ? [`DTSTART;TZID=America/Mexico_City:${start}`, `DTEND;TZID=America/Mexico_City:${end}`]
    : [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`];
  const escape = (text: string) => text.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arta Producciones//Cartelera//ES',
    'BEGIN:VEVENT',
    `UID:${day}-${encodeURIComponent(show.title).slice(0, 40)}@artaproducciones.com`,
    `DTSTAMP:${day}T000000Z`,
    ...when,
    `SUMMARY:${escape(show.title)}`,
    `LOCATION:${escape(where)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return {
    google: `https://calendar.google.com/calendar/render?${google.toString()}`,
    ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
  };
}

/** Enlaces escritos en Studio: lo que no sea web, ruta, ancla, correo o teléfono no se pinta. */
export function safeHref(href?: string | null): string | null {
  const value = (href || '').trim();
  return value && isSafeCtaHref(value) ? value : null;
}

export function externalProps(href: string) {
  return /^https?:\/\//i.test(href) ? ({ target: '_blank', rel: 'noopener noreferrer' } as const) : {};
}

/** Encuadre elegido en Studio. */
export function focusCss(focus?: string | null): string {
  if (focus === 'arriba') return 'center 18%';
  if (focus === 'abajo') return 'center 82%';
  return 'center';
}

export function paragraphs(text?: string | null): string[] {
  return (text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
