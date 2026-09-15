'use client';

import { emptyTicketZone, ticketZonesCapacity, type TicketZone } from '@/lib/ticket-zones';

type Props = {
  zones: TicketZone[];
  onChange: (zones: TicketZone[]) => void;
  disabled?: boolean;
};

/** Vacío mientras se captura: nada de «0» pintado en el campo. */
function numOf(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Zona · Aforo · Precio, con la capacidad al pie. `sold` viaja intacto. */
export function TicketZonesEditor({ zones, onChange, disabled }: Props) {
  const capacity = ticketZonesCapacity(zones);

  function update(i: number, patch: Partial<TicketZone>) {
    onChange(zones.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function remove(i: number) {
    onChange(zones.length <= 1 ? [emptyTicketZone()] : zones.filter((_, idx) => idx !== i));
  }

  return (
    <div className="bol-zones">
      <div className="dtable-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Zona</th>
              <th className="num">Aforo</th>
              <th className="num">Precio</th>
              <th className="col-act" aria-label="Quitar" />
            </tr>
          </thead>
          <tbody>
            {zones.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="cell"
                    disabled={disabled}
                    value={row.zona}
                    placeholder="Ej. Diamante"
                    onChange={(e) => update(i, { zona: e.target.value })}
                    aria-label={`Zona ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="cell num"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    disabled={disabled}
                    value={row.aforo || ''}
                    placeholder="0"
                    onChange={(e) => update(i, { aforo: Math.round(numOf(e.target.value)) })}
                    aria-label={`Aforo zona ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="cell num"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    value={row.precio || ''}
                    placeholder="0.00"
                    onChange={(e) => update(i, { precio: numOf(e.target.value) })}
                    aria-label={`Precio zona ${i + 1}`}
                  />
                </td>
                <td className="col-act">
                  <button
                    className="icon-btn icon-btn--danger"
                    type="button"
                    disabled={disabled}
                    aria-label={`Quitar zona ${row.zona || i + 1}`}
                    onClick={() => remove(i)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="bol-zones__total-label">Capacidad</td>
              <td className="num">{capacity.toLocaleString('es-MX')}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        className="btn-quiet btn-quiet--accent bol-zones__add"
        type="button"
        disabled={disabled}
        onClick={() => onChange([...zones, emptyTicketZone()])}
      >
        + Agregar zona
      </button>
    </div>
  );
}
