'use client';

import {
  DEFAULT_TICKET_ZONES,
  TICKET_ZONE_PRESETS,
  cloneTicketZones,
  emptyTicketZone,
  ticketZonesSummary,
  type TicketZone,
} from '@/lib/ticket-zones';

type Props = {
  zones: TicketZone[];
  onChange: (zones: TicketZone[]) => void;
  disabled?: boolean;
};

function money(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export function TicketZonesEditor({ zones, onChange, disabled }: Props) {
  const summary = ticketZonesSummary(zones);

  function update(i: number, patch: Partial<TicketZone>) {
    const next = [...zones];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  function remove(i: number) {
    if (zones.length <= 1) {
      onChange([emptyTicketZone()]);
      return;
    }
    onChange(zones.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= zones.length) return;
    const next = [...zones];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  return (
    <div className="ticket-zones">
      <div className="ticket-zones__head">
        <div>
          <h3 className="ticket-zones__title">Zonas del venue</h3>
          <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
            Nombra, ordena y ajusta aforo según el auditorio. Los presets solo arrancan; luego
            editas libre.
          </p>
        </div>
        <div className="ticket-zones__totals muted kpi-sub">
          Aforo {summary.aforo.toLocaleString('es-MX')} · Vendidos{' '}
          {summary.sold.toLocaleString('es-MX')} ({summary.pct}%) · Potencial{' '}
          {money(summary.potential)}
        </div>
      </div>

      <div className="ticket-zones__presets" role="group" aria-label="Plantillas de zonas">
        {TICKET_ZONE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn ghost btn-sm"
            disabled={disabled}
            title={p.hint}
            onClick={() => onChange(cloneTicketZones(p.zones))}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table ticket-zones__table">
          <thead>
            <tr>
              <th>Zona</th>
              <th className="num">Aforo</th>
              <th className="num">Vendidos</th>
              <th className="num">Precio</th>
              <th className="num">Total zona</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {zones.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="field"
                    disabled={disabled}
                    value={row.zona}
                    placeholder="Ej. Platea, Preferente…"
                    onChange={(e) => update(i, { zona: e.target.value })}
                    aria-label={`Nombre de zona ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={row.aforo}
                    onChange={(e) => update(i, { aforo: Number(e.target.value) })}
                    aria-label={`Aforo zona ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={row.sold}
                    onChange={(e) => update(i, { sold: Number(e.target.value) })}
                    aria-label={`Vendidos zona ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="field"
                    type="number"
                    min={0}
                    step="any"
                    disabled={disabled}
                    value={row.precio}
                    onChange={(e) => update(i, { precio: Number(e.target.value) })}
                    aria-label={`Precio zona ${i + 1}`}
                  />
                </td>
                <td className="num muted kpi-sub">
                  {money(Number(row.aforo || 0) * Number(row.precio || 0))}
                </td>
                <td>
                  <div className="row row--tight">
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      disabled={disabled || i === 0}
                      aria-label="Subir zona"
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      disabled={disabled || i === zones.length - 1}
                      aria-label="Bajar zona"
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      disabled={disabled}
                      aria-label="Quitar zona"
                      onClick={() => remove(i)}
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row row--tight">
        <button
          className="btn ghost btn-sm"
          type="button"
          disabled={disabled}
          onClick={() => onChange([...zones, emptyTicketZone()])}
        >
          + Agregar zona
        </button>
        <button
          className="btn ghost btn-sm"
          type="button"
          disabled={disabled}
          onClick={() => onChange(cloneTicketZones(DEFAULT_TICKET_ZONES))}
        >
          Restablecer metal
        </button>
      </div>
    </div>
  );
}
