/** Zonas de boletera: cada venue arma las suyas. */

export type TicketZone = {
  zona: string;
  aforo: number;
  precio: number;
  sold: number;
};

export type TicketZonePreset = {
  id: string;
  label: string;
  hint: string;
  zones: TicketZone[];
};

function z(zona: string): TicketZone {
  return { zona, aforo: 0, precio: 0, sold: 0 };
}

/** Presets de partida; el usuario puede renombrar, agregar o quitar. */
export const TICKET_ZONE_PRESETS: TicketZonePreset[] = [
  {
    id: 'metal',
    label: 'Metal / VIP',
    hint: 'Diamante → Bronce (Arema y arenas similares)',
    zones: [z('Diamante'), z('Oro'), z('Plata'), z('Bronce')],
  },
  {
    id: 'teatro',
    label: 'Teatro / auditorio',
    hint: 'Platea, palcos y galería',
    zones: [z('Platea'), z('Palcos'), z('Galería'), z('General')],
  },
  {
    id: 'estadio',
    label: 'Estadio / gradas',
    hint: 'Preferente, lateral y general',
    zones: [z('Preferente'), z('Lateral'), z('General'), z('Luna')],
  },
  {
    id: 'simple',
    label: 'Una sola zona',
    hint: 'Aforo único sin mapear gradas',
    zones: [z('General')],
  },
  {
    id: 'blank',
    label: 'En blanco',
    hint: 'Empieza de cero y nombra cada zona',
    zones: [z('')],
  },
];

export const DEFAULT_TICKET_ZONES: TicketZone[] = TICKET_ZONE_PRESETS[0].zones.map((row) => ({
  ...row,
}));

export function cloneTicketZones(zones: TicketZone[]): TicketZone[] {
  return zones.map((row) => ({ ...row }));
}

export function emptyTicketZone(): TicketZone {
  return z('');
}

export function ticketZonesSummary(zones: TicketZone[]) {
  const aforo = zones.reduce((s, row) => s + Number(row.aforo || 0), 0);
  const sold = zones.reduce((s, row) => s + Number(row.sold || 0), 0);
  const potential = zones.reduce(
    (s, row) => s + Number(row.aforo || 0) * Number(row.precio || 0),
    0,
  );
  const realized = zones.reduce(
    (s, row) => s + Number(row.sold || 0) * Number(row.precio || 0),
    0,
  );
  const pct = aforo > 0 ? Math.round((sold / aforo) * 100) : 0;
  return { aforo, sold, pct, potential, realized };
}

/** Al menos una zona con nombre; si no, la config no sirve. */
export function ticketZonesReady(zones: TicketZone[]): boolean {
  return zones.some((row) => row.zona.trim().length > 0);
}

export function normalizeTicketZones(zones: TicketZone[]): TicketZone[] {
  return zones
    .map((row) => ({
      zona: row.zona.trim(),
      aforo: Number(row.aforo || 0),
      precio: Number(row.precio || 0),
      sold: Number(row.sold || 0),
    }))
    .filter((row) => row.zona.length > 0);
}
