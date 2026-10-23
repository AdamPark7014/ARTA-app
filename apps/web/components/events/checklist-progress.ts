/**
 * Avance de un formato en el panel — espejo de `apps/api/src/common/checklist-progress.ts`.
 *
 * Junta del 23-10-2026: no todos los eventos usan todas las casillas de cada
 * checklist, así que un formato terminado y mandado cuenta 100 % aunque no se
 * haya palomeado todo. El servidor ya GUARDA así `progressPct` (lista de
 * formatos, resumen del evento, analítica y apps lo leen de ahí); esto es para
 * el formato abierto, que cuenta en vivo mientras se captura.
 */

import { isItemDone, isScoringItem, type Checklist, type ChecklistSection } from './event-detail.types';

/** Lo que dice si un formato ya se mandó (viene en la lista y en el formato abierto). */
export type ChecklistSendState = Pick<
  Checklist,
  'status' | 'deliveredAt' | 'authorizedAt' | 'deliveredSignature' | 'authorizedSignature'
>;

/**
 * ¿Ya se terminó y se mandó? Espejo de `isFormatSent`: firma de entrega o de
 * autorización, o mandado a revisión, aprobado o sellado. Es la misma frontera
 * que separa «Por completar» del resto en la lista de formatos
 * (`checklistBucket`).
 */
export function isChecklistSent(c?: ChecklistSendState | null): boolean {
  if (!c) return false;
  return (
    c.status === 'REVIEW' ||
    c.status === 'APPROVED' ||
    c.status === 'SEALED' ||
    !!c.deliveredAt ||
    !!c.authorizedAt ||
    !!c.deliveredSignature ||
    !!c.authorizedSignature
  );
}

/** Campos que puntúan y cuántos llevan algo (misma cuenta que `captureCount` del API). */
export function captureCount(sections: ChecklistSection[]): { done: number; total: number } {
  const scoring = sections.filter((s) => s.id !== 'firmas').flatMap((s) => s.items.filter(isScoringItem));
  return { done: scoring.filter(isItemDone).length, total: scoring.length };
}

/**
 * Avance del formato abierto con la regla del servidor (`formatProgress`):
 * mandado = 100 %; si no, lo capturado. `done/total` es lo capturado de verdad
 * y se enseña al lado, para que nadie confunda «mandado» con «todo palomeado».
 */
export function checklistProgress(
  c: (ChecklistSendState & { progressPct?: number }) | null | undefined,
  sections: ChecklistSection[],
): { pct: number; done: number; total: number; sent: boolean } {
  const { done, total } = captureCount(sections);
  const sent = isChecklistSent(c);
  const pct = sent ? 100 : total ? Math.round((done / total) * 100) : c?.progressPct || 0;
  return { pct, done, total, sent };
}
