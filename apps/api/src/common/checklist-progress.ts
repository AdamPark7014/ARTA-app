/**
 * Avance de un checklist — implementación ÚNICA.
 *
 * Antes vivía copiada en tres sitios (`checklists.controller.ts`,
 * `finance.controller.ts` y el panel web) y las tres contaban distinto, así que
 * el porcentaje del servidor y el de la pantalla no coincidían.
 *
 * La sección `firmas` queda fuera del cálculo: el seed la añade a TODAS las
 * plantillas con dos ítems de texto ya rellenados («Usar botón Firmar
 * entregado»), que contaban siempre como completados e inflaban el avance. Las
 * firmas se registran en `DigitalSignature`, no como progreso.
 *
 * Desde el 23-10-2026 un formato terminado y mandado cuenta 100 %
 * (`formatProgress`); `calcProgress` es lo capturado y nada más.
 */

import { isFormatItemComplete, type FormatItem } from './format-schema';

export type ChecklistItem = {
  id?: string;
  label?: string;
  type?: string;
  done?: boolean;
  value?: unknown;
  /** Tabla: renglones capturados. */
  rows?: unknown;
  /** Adjunto del formato. */
  fileId?: string | null;
  /** No cuenta para el avance si está vacío. */
  optional?: boolean;
};

export type ChecklistSection = {
  id?: string;
  title?: string;
  items?: ChecklistItem[];
};

export type ChecklistData = { sections?: ChecklistSection[] };

/** Secciones que no cuentan para el avance. */
export const NON_SCORING_SECTIONS = new Set(['firmas']);

/** Tipos de ítem que no cuentan para el avance (firmas y texto fijo del documento). */
const NON_SCORING_TYPES = new Set(['signature', 'paragraph']);

export function isItemComplete(item: ChecklistItem): boolean {
  return isFormatItemComplete(item as FormatItem);
}

/**
 * Los ítems que sí puntúan, ya sin secciones ni tipos excluidos.
 *
 * Un ítem `optional` (observaciones, tabla de traslados…) solo cuenta cuando
 * ya tiene algo: vacío no resta avance.
 */
export function scoringItems(data: unknown): ChecklistItem[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as ChecklistData;
  return (root.sections ?? [])
    .filter((s) => !NON_SCORING_SECTIONS.has(String(s?.id ?? '')))
    .flatMap((s) => s?.items ?? [])
    .filter((i) => !!i && !NON_SCORING_TYPES.has(String(i.type ?? '')))
    .filter((i) => !i.optional || isItemComplete(i));
}

/** Campos que puntúan y cuántos llevan algo: el «x/y campos» de la pantalla. */
export function captureCount(data: unknown): { done: number; total: number } {
  const items = scoringItems(data);
  return { done: items.filter(isItemComplete).length, total: items.length };
}

/**
 * Avance por lo capturado: cuántos de los campos que puntúan llevan algo.
 * Es la cifra «cruda»; lo que se guarda en `progressPct` es `formatProgress`.
 */
export function calcProgress(data: unknown): number {
  const { done, total } = captureCount(data);
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

/**
 * Lo que dice si un formato ya se terminó y se mandó. Basta con los campos de
 * `ChecklistInstance`; todo es opcional para que sirva con cualquier `select`.
 */
export type FormatSendState = {
  status?: string | null;
  deliveredAt?: Date | string | null;
  authorizedAt?: Date | string | null;
  deliveredSignature?: unknown;
  authorizedSignature?: unknown;
};

/** Estados en que el formato ya salió de manos de quien lo llena. */
export const SENT_STATUSES: ReadonlySet<string> = new Set(['REVIEW', 'APPROVED', 'SEALED']);

const hasSignature = (sig: unknown) => !!sig && typeof sig === 'object';

/**
 * ¿Ya se terminó y se mandó? — junta de Adam con el cliente (23-10-2026).
 *
 * Cuenta como mandado cuando hay firma de entrega o de autorización, o cuando
 * se mandó a revisión, se aprobó o se selló. Es la misma frontera que separa
 * «Por completar» de «En revisión» y «Listos» en la lista de formatos del
 * panel (`checklistBucket`), así que el 100 % y la píldora siempre coinciden.
 *
 * Regresar a borrador quita el 100 % solo si no hay firma: la firma de entrega
 * se queda en el documento y el formato sigue «Por autorizar».
 */
export function isFormatSent(doc: FormatSendState | null | undefined): boolean {
  if (!doc) return false;
  return (
    SENT_STATUSES.has(String(doc.status ?? '')) ||
    !!doc.deliveredAt ||
    !!doc.authorizedAt ||
    hasSignature(doc.deliveredSignature) ||
    hasSignature(doc.authorizedSignature)
  );
}

/**
 * El avance que se GUARDA en `progressPct` y que leen la lista de formatos, el
 * resumen del evento, la analítica («Formatos al día», riesgo), los digests y
 * las apps.
 *
 * No todos los eventos usan todas las casillas de cada checklist: un formato
 * terminado y mandado vale 100 % aunque no se haya palomeado todo. Lo
 * capturado de verdad (`captureCount`) se sigue enseñando aparte en el
 * formato abierto, para que nadie confunda «mandado» con «todo palomeado».
 */
export function formatProgress(data: unknown, doc: FormatSendState | null | undefined): number {
  return isFormatSent(doc) ? 100 : calcProgress(data);
}
