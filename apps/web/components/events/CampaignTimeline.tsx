'use client';

import { EmptyLite } from '@/components/ui/Lite';

/**
 * Calendario de la campaña (junta 11-09-2026: «agregar opción de calendario»).
 *
 * Un Gantt de una sola pantalla: cada concepto es una barra entre sus fechas,
 * con la línea de hoy y la del show. Sin librerías: posiciones en porcentaje.
 */

export type TimelineRow = {
  key: string;
  label: string;
  sub?: string;
  from?: string | null;
  to?: string | null;
};

const DAY = 86400000;

function parseDay(value?: string | null): number | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function shortDay(ms: number) {
  return new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function CampaignTimeline({
  rows,
  showDate,
  emptyText = 'Pon fechas a los conceptos para verlos aquí.',
}: {
  rows: TimelineRow[];
  showDate?: string | null;
  emptyText?: string;
}) {
  const dated = rows
    .map((r) => {
      const from = parseDay(r.from) ?? parseDay(r.to);
      const to = parseDay(r.to) ?? from;
      return { ...r, fromMs: from, toMs: to !== null && from !== null && to < from ? from : to };
    })
    .filter((r) => r.label.trim());

  const show = parseDay(showDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points = dated.flatMap((r) => [r.fromMs, r.toMs]).filter((x): x is number => x !== null);

  if (!points.length) {
    return (
      <div className="timeline">
        <EmptyLite icon="◷" title="Calendario vacío" text={emptyText} />
      </div>
    );
  }

  if (show !== null) points.push(show);
  let start = Math.min(...points) - 3 * DAY;
  let end = Math.max(...points) + 4 * DAY;
  if (end - start < 21 * DAY) {
    const pad = (21 * DAY - (end - start)) / 2;
    start -= pad;
    end += pad;
  }
  const span = end - start;
  const pct = (ms: number) => `${((ms - start) / span) * 100}%`;

  // Meses visibles.
  const months: Array<{ left: number; label: string }> = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end) {
    const at = Math.max(cursor.getTime(), start);
    months.push({
      left: ((at - start) / span) * 100,
      label: cursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Rejilla semanal (lunes).
  const weeks: number[] = [];
  const w = new Date(start);
  w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() + ((8 - w.getDay()) % 7));
  while (w.getTime() < end) {
    weeks.push(((w.getTime() - start) / span) * 100);
    w.setDate(w.getDate() + 7);
  }

  const markers = (
    <>
      {weeks.map((left) => (
        <span key={left} className="timeline__grid" style={{ left: `${left}%` }} />
      ))}
      {today.getTime() >= start && today.getTime() <= end ? (
        <span className="timeline__today" style={{ left: pct(today.getTime()) }} />
      ) : null}
      {show !== null ? <span className="timeline__show" style={{ left: pct(show) }} /> : null}
    </>
  );

  return (
    <div className="timeline" role="figure" aria-label="Calendario de la campaña">
      <div className="timeline__scale">
        <div className="timeline__corner">Concepto</div>
        <div className="timeline__months">
          {months.map((m, i) => (
            <span
              key={m.label}
              className="timeline__month"
              style={{ left: `${m.left}%`, right: i < months.length - 1 ? `${100 - months[i + 1].left}%` : 0 }}
            >
              {m.label}
            </span>
          ))}
          {today.getTime() >= start && today.getTime() <= end ? (
            <span className="timeline__flag timeline__flag--today" style={{ left: pct(today.getTime()) }}>
              Hoy
            </span>
          ) : null}
          {show !== null ? (
            <span className="timeline__flag" style={{ left: pct(show) }}>
              Show
            </span>
          ) : null}
        </div>
      </div>
      {dated.map((r) => (
        <div key={r.key} className="timeline__row">
          <div className="timeline__label" title={r.label}>
            {r.label}
            {r.sub ? <small>{r.sub}</small> : null}
          </div>
          <div className="timeline__track">
            {markers}
            {r.fromMs !== null && r.toMs !== null ? (
              <span
                className="timeline__bar"
                style={{ left: pct(r.fromMs), width: `max(10px, ${((r.toMs + DAY - r.fromMs) / span) * 100}%)` }}
                title={`${shortDay(r.fromMs)} – ${shortDay(r.toMs)}`}
              >
                <span>
                  {r.fromMs === r.toMs ? shortDay(r.fromMs) : `${shortDay(r.fromMs)} – ${shortDay(r.toMs)}`}
                </span>
              </span>
            ) : (
              <span className="timeline__bar timeline__bar--undated" style={{ left: '1%', right: '1%' }}>
                <span style={{ color: 'var(--muted)' }}>Sin fechas</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
