'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

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

/** Mes con los días de cada concepto y del show. Sin librerías. */
export function MonthCalendar({
  items,
  onDayClick,
  renderDay,
}: {
  items: CalendarItem[];
  /** El día completo (no un chip ni un enlace) se puede tocar — p. ej. para escribir una nota. */
  onDayClick?: (dayKey: string) => void;
  /** Contenido extra bajo los chips del show, por ejemplo notas del equipo. */
  renderDay?: (dayKey: string) => import('react').ReactNode;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

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
            ‹
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
            ›
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
          return (
            <div
              key={key}
              className={`mcal__day ${out ? 'is-out' : ''} ${key === todayKey ? 'is-today' : ''} ${onDayClick ? 'is-clickable' : ''}`}
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
              {active.slice(0, MAX_CHIPS).map((it) => {
                const cls = `mcal__chip ${it.tone === 'show' ? 'mcal__chip--show' : ''}`;
                return it.href ? (
                  <Link key={it.key} className={cls} href={it.href} title={it.label}>
                    {it.label}
                  </Link>
                ) : (
                  <span key={it.key} className={cls} title={it.label}>
                    {it.label}
                  </span>
                );
              })}
              {active.length > MAX_CHIPS ? <span className="mcal__more">+{active.length - MAX_CHIPS} más</span> : null}
              {renderDay ? renderDay(key) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
