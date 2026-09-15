/**
 * Boletera: quién vende los boletos y cómo se lee en el documento
 * «Creación de boletera» (junta 11-09-2026).
 */

export const KNOWN_BOLETERAS = ['Arema', 'eTicket'] as const;

export type KnownBoletera = (typeof KNOWN_BOLETERAS)[number];

export function boleteraChoiceOf(boletera: string): KnownBoletera | 'Otra' {
  return (KNOWN_BOLETERAS as readonly string[]).includes(boletera) ? (boletera as KnownBoletera) : 'Otra';
}

export function boleteraCustomOf(boletera: string): string {
  return boleteraChoiceOf(boletera) === 'Otra' && boletera !== 'Otra' ? boletera : '';
}

/** Resolve stored boletera name from select + optional custom label. */
export function resolveBoleteraName(choice: string, customName: string): string | null {
  if (choice !== 'Otra') return choice;
  const name = customName.trim();
  if (!name || name.toLowerCase() === 'otra') return null;
  return name;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function validDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

const dd = (d: Date) => String(d.getDate()).padStart(2, '0');

/** Un show que termina de madrugada sigue siendo «un día». */
const SAME_SHOW_MS = 18 * 60 * 60 * 1000;

/**
 * Fecha como la escribe el machote:
 * «19 de septiembre de 2026» o «29 de octubre al 02 de noviembre de 2026».
 */
export function boleteraDateLabel(startsAt?: string | Date | null, endsAt?: string | Date | null): string {
  const start = validDate(startsAt);
  if (!start) return '';
  const end = validDate(endsAt);
  const single = `${dd(start)} de ${MONTHS[start.getMonth()]} de ${start.getFullYear()}`;
  if (!end || end.getTime() - start.getTime() < SAME_SHOW_MS) return single;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return single;
  const tail = `${dd(end)} de ${MONTHS[end.getMonth()]} de ${end.getFullYear()}`;
  if (start.getFullYear() !== end.getFullYear()) return `${single} al ${tail}`;
  if (start.getMonth() !== end.getMonth()) {
    return `${dd(start)} de ${MONTHS[start.getMonth()]} al ${tail}`;
  }
  return `${dd(start)} al ${tail}`;
}

/**
 * Link de artes listo para abrir. Acepta «drive.google.com/…» sin protocolo;
 * devuelve '' si no es un link http(s) utilizable.
 */
export function normalizeArtsUrl(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (!url.hostname.includes('.')) return '';
    return url.href;
  } catch {
    return '';
  }
}
