/**
 * Formato único de cifras y fechas del panel (pulido 12-10-2026).
 *
 * Regla: las cifras grandes (tarjetas, resúmenes, encabezados) van en pesos
 * redondos, sin centavos; los montos de detalle (filas, tablas, documentos,
 * botones que confirman un total) siempre con centavos. Antes convivían
 * «$264,283.20» y «$392,254» en la misma fila de tarjetas.
 */

function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Cifra de tarjeta o resumen: $264,283. */
export function moneyKpi(value: number | string | null | undefined): string {
  return Math.round(num(value)).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Monto de detalle: $186,412.00. */
export function moneyExact(value: number | string | null | undefined): string {
  return num(value).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function valid(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «11 oct» (con año si no es el actual: «12 sep 2025»). */
export function shortDate(iso: string | Date | null | undefined, now = new Date()): string {
  const d = valid(iso);
  if (!d) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** «11 oct, 23:32» en 24 h (con año si no es el actual). */
export function shortDateTime(iso: string | Date | null | undefined, now = new Date()): string {
  const d = valid(iso);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${shortDate(d, now)}, ${hh}:${mm}`;
}

/** Fecha y hora completas para el `title` de una fecha corta. */
export function fullDateTime(iso: string | Date | null | undefined): string {
  const d = valid(iso);
  if (!d) return '';
  return d.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Fecha de un show, siempre igual en tarjetas y listas: «sáb 9 dic · en 29 días»,
 * «15 – 17 ene · en 65 días», «vie 14 nov · en curso», «6 feb 2027». Antes la lista
 * de Eventos decía «En 29 días» junto a «febrero de 2027».
 */
export function eventWhen(
  startsAt: string | Date | null | undefined,
  endsAt?: string | Date | null,
  now = new Date(),
): string {
  const s = valid(startsAt);
  if (!s) return '';
  const e = valid(endsAt);
  const multi = !!e && dayStart(e) > dayStart(s);
  const year = s.getFullYear() !== now.getFullYear() || (multi && e!.getFullYear() !== now.getFullYear());
  let date: string;
  if (multi) {
    const sameMonth = s.getMonth() === e!.getMonth() && s.getFullYear() === e!.getFullYear();
    const from = sameMonth ? `${s.getDate()}` : `${s.getDate()} ${MONTHS[s.getMonth()]}`;
    date = `${from} – ${e!.getDate()} ${MONTHS[e!.getMonth()]}${year ? ` ${e!.getFullYear()}` : ''}`;
  } else {
    date = `${WEEKDAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]}${year ? ` ${s.getFullYear()}` : ''}`;
  }
  const today = dayStart(now);
  const days = Math.round((dayStart(s) - today) / 86400000);
  const lastDay = dayStart(e || s);
  let rel = '';
  if (days === 0) rel = 'hoy';
  else if (days === 1) rel = 'mañana';
  else if (days > 1 && days <= 90) rel = `en ${days} días`;
  else if (days < 0 && lastDay >= today) rel = 'en curso';
  return rel ? `${date} · ${rel}` : date;
}
