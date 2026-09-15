/** Zonas de boletera: cada venue arma las suyas (Zona · Aforo · Precio). */

export type TicketZone = {
  zona: string;
  aforo: number;
  precio: number;
  /** Lo llena la integración con la boletera; el formulario lo conserva, no lo edita. */
  sold: number;
};

export function emptyTicketZone(): TicketZone {
  return { zona: '', aforo: 0, precio: 0, sold: 0 };
}

/** Punto de partida del formulario: una fila en blanco. */
export const DEFAULT_TICKET_ZONES: TicketZone[] = [emptyTicketZone()];

export function cloneTicketZones(zones: TicketZone[]): TicketZone[] {
  return zones.map((row) => ({ ...row }));
}

function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** `zonesJson` tal como venga del API → zonas tipadas, conservando `sold`. */
export function parseTicketZones(raw: unknown): TicketZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      zona: String(row.zona ?? ''),
      aforo: positive(row.aforo),
      precio: positive(row.precio),
      sold: positive(row.sold),
    }));
}

/** Capacidad = suma de aforos. */
export function ticketZonesCapacity(zones: Array<{ aforo?: number | string | null }>): number {
  return zones.reduce((sum, row) => sum + positive(row.aforo), 0);
}

/** Al menos una zona con nombre; si no, la config no sirve. */
export function ticketZonesReady(zones: TicketZone[]): boolean {
  return zones.some((row) => row.zona.trim().length > 0);
}

export function normalizeTicketZones(zones: TicketZone[]): TicketZone[] {
  return zones
    .map((row) => ({
      zona: row.zona.trim(),
      aforo: Math.round(positive(row.aforo)),
      precio: positive(row.precio),
      sold: Math.round(positive(row.sold)),
    }))
    .filter((row) => row.zona.length > 0);
}
