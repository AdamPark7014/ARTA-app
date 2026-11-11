'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type CalendarItem = {
  key: string;
  label: string;
  /** YYYY-MM-DD o ISO */
  from: string;
  to?: string | null;
  tone?: 'show' | 'run';
  href?: string;
};

const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
/** Carriles de barras por semana; lo que no cabe queda en «+N más» del día. */
const MAX_LANES = 3;

type Normalized = CalendarItem & { fromDay: string; toDay: string };
type Bar = { item: Normalized; week: number; col: number; span: number; lane: number; continues: boolean; continued: boolean };

/**
 * Un show de varios días es UNA barra por semana con el nombre completo, no un chip cortado
 * repetido en cada casilla (recorrido 11-11-2026, maqueta aprobada). Reparte las barras en carriles
 * para que la misma barra no cambie de altura de un día a otro.
 */
function layoutBars(items: Normalized[], weeks: string[][]) {
  const bars: Bar[] = [];
  const overflow = new Map<string, Normalized[]>();
  const lanesUsed: number[] = [];
  weeks.forEach((days, w) => {
    const first = days[0];
    const last = days[6];
    const inWeek = items
      .filter((it) => it.fromDay <= last && it.toDay >= first)
      .sort(
        (a, b) =>
          (a.tone === 'show' ? 0 : 1) - (b.tone === 'show' ? 0 : 1) ||
          (a.fromDay < first ? first : a.fromDay).localeCompare(b.fromDay < first ? first : b.fromDay) ||
          b.toDay.localeCompare(a.toDay) ||
          a.key.localeCompare(b.key),
      );
    const lanes: boolean[][] = [];
    let used = 0;
    for (const it of inWeek) {
      const col = Math.max(0, days.findIndex((d) => d >= it.fromDay));
      let end = 6;
      for (let i = 6; i >= 0; i -= 1) if (days[i] <= it.toDay) { end = i; break; }
      let lane = -1;
      for (let l = 0; l < MAX_LANES; l += 1) {
        lanes[l] = lanes[l] || Array(7).fill(false);
        if (lanes[l].slice(col, end + 1).every((x) => !x)) { lane = l; break; }
      }
      if (lane < 0) {
        for (let i = col; i <= end; i += 1) overflow.set(days[i], [...(overflow.get(days[i]) || []), it]);
        continue;
      }
      for (let i = col; i <= end; i += 1) lanes[lane][i] = true;
      used = Math.max(used, lane + 1);
      bars.push({ item: it, week: w, col, span: end - col + 1, lane, continued: it.fromDay < first, continues: it.toDay > last });
    }
    lanesUsed[w] = used;
  });
  return { bars, overflow, lanesUsed };
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDay(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mes con los días de cada concepto y del show. Sin librerías. */
export function MonthCalendar({
  items,
  onDayClick,
  renderDay,
  focusDay,
}: {
  items: CalendarItem[];
  /** «YYYY-MM-DD» que un aviso pidió ver: abre en su mes y lo marca. */
  focusDay?: string | null;
  /** El día completo (no un chip ni un enlace) se puede tocar — p. ej. para escribir una nota. */
  onDayClick?: (dayKey: string) => void;
  /** Contenido extra bajo los chips del show, por ejemplo notas del equipo. */
  renderDay?: (dayKey: string) => import('react').ReactNode;
}) {
  const [month, setMonth] = useState(() => {
    const d = focusDay && /^\d{4}-\d{2}-\d{2}$/.test(focusDay) ? new Date(`${focusDay}T12:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  /** Días con «+N más» abierto: enseñan todos sus chips hasta que se vuelven a cerrar. */
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const toggleExpanded = (key: string) => setExpandedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  useEffect(() => {
    if (!focusDay || !/^\d{4}-\d{2}-\d{2}$/.test(focusDay)) return;
    const d = new Date(`${focusDay}T12:00:00`);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    const t = window.setTimeout(
      () => document.querySelector(`[data-day="${focusDay}"]`)?.scrollIntoView({ block: 'center' }),
      80,
    );
    return () => window.clearTimeout(t);
  }, [focusDay]);

  const normalized = useMemo(
    () =>
      items
        .map((it) => {
          const from = toDay(it.from);
          const to = toDay(it.to) || from;
          return from ? { ...it, fromDay: from, toDay: to && to < from ? from : to! } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x) as Normalized[],
    [items],
  );

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const weeks = Math.ceil((offset + lastOfMonth.getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const todayKey = dayKey(new Date());
  const weekKeys = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7).map(dayKey));
    return out;
  }, [cells]);
  const { bars, overflow, lanesUsed } = useMemo(() => layoutBars(normalized, weekKeys), [normalized, weekKeys]);

  return (
    <div className="mcal">
      <div className="mcal__head">
        <h3 className="mcal__title">
          {month.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="sx-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <Chevron dir="left" />
          </button>
          <button
            className="btn-quiet"
            type="button"
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
          >
            Hoy
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>
      <div className="mcal__grid">
        {DOW.map((d) => (
          <div key={d} className="mcal__dow" style={{ gridRow: 1 }}>
            {d}
          </div>
        ))}
        {cells.map((d, idx) => {
          const key = dayKey(d);
          const week = Math.floor(idx / 7);
          const extra = overflow.get(key) || [];
          const out = d.getMonth() !== month.getMonth();
          const expanded = !!expandedDays[key];
          return (
            <div
              key={key}
              data-day={key}
              style={{ gridRow: week + 2, gridColumn: (idx % 7) + 1 }}
              className={`mcal__day ${out ? 'is-out' : ''} ${key === todayKey ? 'is-today' : ''} ${key === focusDay ? 'is-focus' : ''} ${onDayClick ? 'is-clickable' : ''}`}
              aria-current={key === todayKey ? 'date' : undefined}
              onClick={onDayClick ? () => onDayClick(key) : undefined}
              role={onDayClick ? 'button' : undefined}
              tabIndex={onDayClick ? 0 : undefined}
              onKeyDown={
                onDayClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onDayClick(key);
                      }
                    }
                  : undefined
              }
            >
              <span className="mcal__num">{d.getDate()}</span>
              {/* Lugar para las barras de la semana, que se pintan encima de las casillas. */}
              {lanesUsed[week] ? (
                <span className="mcal__lanes" style={{ height: `calc(${lanesUsed[week]} * var(--mcal-lane))` }} aria-hidden />
              ) : null}
              {expanded
                ? extra.map((it) => <CalendarChip key={it.key} it={it} />)
                : null}
              {extra.length ? (
                <button
                  type="button"
                  className="mcal__more"
                  aria-expanded={expanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(key);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {expanded ? 'Ver menos' : `+${extra.length} más`}
                </button>
              ) : null}
              {renderDay ? renderDay(key) : null}
            </div>
          );
        })}
        {bars.map((b) => (
          <CalendarChip
            key={`${b.item.key}-${b.week}`}
            it={b.item}
            bar={b}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarChip({ it, bar }: { it: Normalized; bar?: Bar }) {
  const cls = [
    'mcal__chip',
    it.tone === 'show' ? 'mcal__chip--show' : '',
    bar ? 'mcal__bar' : '',
    bar?.continued ? 'is-continued' : '',
    bar?.continues ? 'is-continues' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = bar
    ? ({
        gridRow: bar.week + 2,
        gridColumn: `${bar.col + 1} / span ${bar.span}`,
        marginTop: `calc(var(--mcal-bar-top) + ${bar.lane} * var(--mcal-lane))`,
      } as const)
    : undefined;
  const label = bar?.continued ? `› ${it.label}` : it.label;
  return it.href ? (
    // La barra vive sobre el día, que también se toca (la nota): abrir el show no debe abrir además
    // el cuadro de la nota.
    <Link
      className={cls}
      style={style}
      href={it.href}
      title={it.label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  ) : (
    <span className={cls} style={style} title={it.label}>
      {label}
    </span>
  );
}
