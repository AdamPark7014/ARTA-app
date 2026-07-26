export type ZoneSold = {
  zona: string;
  aforo: number;
  precio: number;
  sold?: number;
};

export interface TicketingProvider {
  readonly name: string;
  /** Fetch sold counts for zones; returns updated zones array. */
  fetchSold(input: {
    boletera: string;
    eventName: string;
    eventId?: string;
    externalId?: string | null;
    zones: ZoneSold[];
  }): Promise<ZoneSold[]>;
}

function stubOccupancy(zones: ZoneSold[]): ZoneSold[] {
  const target = Math.min(0.95, Math.max(0.05, Number(process.env.TICKETING_STUB_OCCUPANCY || 0.42)));
  return zones.map((z) => {
    const aforo = Number(z.aforo || 0);
    const current = Number(z.sold || 0);
    const desired = Math.floor(aforo * target);
    // Never decrease sold; only fill toward stub occupancy
    return { ...z, sold: Math.min(aforo, Math.max(current, desired)) };
  });
}

function normalizeZones(raw: unknown, fallback: ZoneSold[]): ZoneSold[] {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  return raw.map((z, i) => {
    const row = z as Record<string, unknown>;
    const base = fallback[i] || fallback[0];
    const aforo = Number(row.aforo ?? base?.aforo ?? 0);
    const sold = Math.min(aforo, Math.max(0, Number(row.sold ?? 0)));
    return {
      zona: String(row.zona ?? base?.zona ?? `Z${i + 1}`),
      aforo,
      precio: Number(row.precio ?? base?.precio ?? 0),
      sold,
    };
  });
}

/**
 * Live HTTP adapter: POST TICKETING_SYNC_URL with event + zones.
 * Auth via TICKETING_SYNC_TOKEN (Bearer) when set.
 * Failures throw — never silently invent sold counts.
 */
export class LiveHttpTicketingProvider implements TicketingProvider {
  readonly name = 'live-http';

  async fetchSold(input: {
    boletera: string;
    eventName: string;
    eventId?: string;
    externalId?: string | null;
    zones: ZoneSold[];
  }): Promise<ZoneSold[]> {
    const url = process.env.TICKETING_SYNC_URL;
    if (!url) throw new Error('TICKETING_SYNC_URL requerido en modo live');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = process.env.TICKETING_SYNC_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider: input.boletera,
            event: input.eventName,
            eventId: input.eventId,
            externalId: input.externalId || undefined,
            zones: input.zones,
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) {
          throw new Error(`boletera HTTP ${res.status}`);
        }
        const data = (await res.json()) as { zones?: unknown };
        return normalizeZones(data.zones, input.zones);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastErr || new Error('boletera sync failed');
  }
}

/** Deterministic stub for demos / CI without a live boletera. */
export class AremaStubProvider implements TicketingProvider {
  readonly name = 'arema-stub';

  async fetchSold(input: {
    boletera: string;
    eventName: string;
    zones: ZoneSold[];
  }): Promise<ZoneSold[]> {
    void input.boletera;
    void input.eventName;
    return stubOccupancy(input.zones);
  }
}

export function resolveProvider(_boletera: string): TicketingProvider {
  void _boletera;
  const mode = (process.env.TICKETING_SYNC_MODE || 'stub').toLowerCase();
  if (mode === 'live') return new LiveHttpTicketingProvider();
  return new AremaStubProvider();
}
