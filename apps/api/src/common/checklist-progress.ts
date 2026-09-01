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
 */

export type ChecklistItem = {
  id?: string;
  label?: string;
  type?: string;
  done?: boolean;
  value?: unknown;
};

export type ChecklistSection = {
  id?: string;
  title?: string;
  items?: ChecklistItem[];
};

export type ChecklistData = { sections?: ChecklistSection[] };

/** Secciones que no cuentan para el avance. */
export const NON_SCORING_SECTIONS = new Set(['firmas']);

/** Tipos de ítem que no cuentan para el avance. */
const NON_SCORING_TYPES = new Set(['signature']);

export function isItemComplete(item: ChecklistItem): boolean {
  if (item.type === 'check' || !item.type) return !!item.done;
  return item.value !== null && item.value !== undefined && String(item.value).trim() !== '';
}

/** Los ítems que sí puntúan, ya sin secciones ni tipos excluidos. */
export function scoringItems(data: unknown): ChecklistItem[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as ChecklistData;
  return (root.sections ?? [])
    .filter((s) => !NON_SCORING_SECTIONS.has(String(s?.id ?? '')))
    .flatMap((s) => s?.items ?? [])
    .filter((i) => !!i && !NON_SCORING_TYPES.has(String(i.type ?? '')));
}

export function calcProgress(data: unknown): number {
  const items = scoringItems(data);
  if (!items.length) return 0;
  const scored = items.filter(isItemComplete).length;
  return Math.round((scored / items.length) * 100);
}
