/**
 * Borradores que sobreviven a cambiar de pestaña o recargar.
 *
 * Los paneles del evento se desmontan al cambiar de pestaña: sin esto, los
 * conceptos tecleados en Campaña se perdían al ir a Boletera y volver. Vive en
 * `sessionStorage` (solo esta pestaña del navegador) y se borra al guardar o
 * descartar.
 */
export function readDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin espacio o modo privado: el borrador vive solo en memoria */
  }
}

export function clearDraft(key: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nada que limpiar */
  }
}

/** Partidas que Campaña le deja a Órdenes de compra al pulsar «Crear OC». */
export function poHandoffKey(eventId: string) {
  return `arta.poDraft.${eventId}`;
}
