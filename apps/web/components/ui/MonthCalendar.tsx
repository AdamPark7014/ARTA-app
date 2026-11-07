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
const MAX_CHIPS = 3;

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
        .filter((x): x is NonNullable<typeof x> => !!x),
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
          <div key={d} className="mcal__dow">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const key = dayKey(d);
          const active = normalized
            .filter((it) => it.fromDay <= key && key <= it.toDay)
            .sort((a, b) => (a.tone === 'show' ? -1 : 0) - (b.tone === 'show' ? -1 : 0));
          const out = d.getMonth() !== month.getMonth();
          const expanded = !!expandedDays[key];
          const shown = expanded ? active : active.slice(0, MAX_CHIPS);
          return (
            <div
              key={key}
              data-day={key}
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
              {shown.map((it) => {
                const cls = `mcal__chip ${it.tone === 'show' ? 'mcal__chip--show' : ''}`;
                return it.href ? (
                  // El chip vive dentro del día, que también se toca (la nota): abrir el show
                  // no debe abrir además el cuadro de la nota.
                  <Link
                    key={it.key}
                    className={cls}
                    href={it.href}
                    title={it.label}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {it.label}
                  </Link>
                ) : (
                  <span key={it.key} className={cls} title={it.label}>
                    {it.label}
                  </span>
                );
              })}
              {active.length > MAX_CHIPS ? (
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
                  {expanded ? 'Ver menos' : `+${active.length - MAX_CHIPS} más`}
                </button>
              ) : null}
              {renderDay ? renderDay(key) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
