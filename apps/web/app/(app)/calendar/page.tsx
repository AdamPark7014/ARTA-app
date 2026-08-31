'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSelect, FilterBar, PageHeader } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  status: string;
  entity?: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayInRange(day: Date, start?: string | null, end?: string | null) {
  if (!start) return false;
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const e = end ? new Date(end) : new Date(start);
  e.setHours(23, 59, 59, 999);
  const t = day.getTime();
  return t >= s.getTime() && t <= e.getTime();
}

/** Monday-first grid cells for the visible month. */
function monthCells(cursor: Date): Array<Date | null> {
  const first = startOfMonth(cursor);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < mondayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function EventsCalendarPage() {
  const { entity, user } = useUser();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    if (!user || !entity) return;
    setLoading(true);
    api<EventRow[]>(`/events?entity=${entity}&scope=all`)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, entity]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (!e.startsAt) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      return true;
    });
  }, [events, statusFilter]);

  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const dayEvents = useMemo(() => {
    const day = selectedDay;
    if (!day) return [];
    return filtered.filter((e) => dayInRange(day, e.startsAt, e.endsAt));
  }, [filtered, selectedDay]);

  const monthLabel = cursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <AppShell title="Calendario">
      <div className="stack page-workspace">
        <PageHeader
          title="Calendario de eventos"
          description={`${entity || '—'} · mes sobre fecha de show`}
        >
          <Link className="btn ghost btn-sm" href="/events">
            Ver pipeline
          </Link>
        </PageHeader>

        <FilterBar>
          <button className="btn ghost btn-sm" type="button" onClick={() => setCursor((c) => addMonths(c, -1))}>
            ← Mes
          </button>
          <button className="btn ghost btn-sm" type="button" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoy
          </button>
          <button className="btn ghost btn-sm" type="button" onClick={() => setCursor((c) => addMonths(c, 1))}>
            Mes →
          </button>
          <strong style={{ textTransform: 'capitalize', marginInline: '0.5rem' }}>{monthLabel}</strong>
          <FieldSelect
            label="Estado"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'DRAFT', label: 'Borrador' },
              { value: 'ACTIVE', label: 'Activo' },
              { value: 'CLOSED', label: 'Cerrado' },
              { value: 'CANCELLED', label: 'Cancelado' },
            ]}
          />
        </FilterBar>

        {loading ? (
          <LoadingBlock rows={6} label="Cargando calendario…" />
        ) : (
          <div className="cal-layout">
            <div className="cal-grid" role="grid" aria-label={`Calendario ${monthLabel}`}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="cal-grid__dow">
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                if (!day) {
                  return <div key={`e-${i}`} className="cal-grid__cell is-empty" />;
                }
                const hits = filtered.filter((e) => dayInRange(day, e.startsAt, e.endsAt));
                const isToday = sameDay(day, today);
                const isSelected = selectedDay ? sameDay(day, selectedDay) : false;
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`cal-grid__cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span className="cal-grid__daynum">{day.getDate()}</span>
                    <ul className="cal-grid__dots">
                      {hits.slice(0, 3).map((e) => (
                        <li key={e.id} title={e.name}>
                          {e.name}
                        </li>
                      ))}
                      {hits.length > 3 ? <li className="muted">+{hits.length - 3}</li> : null}
                    </ul>
                  </button>
                );
              })}
            </div>

            <aside className="cal-side panel">
              <div className="panel-head">
                <h2>
                  {selectedDay
                    ? selectedDay.toLocaleDateString('es-MX', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : 'Selecciona un día'}
                </h2>
              </div>
              <div className="panel-body stack">
                {!selectedDay ? (
                  <p className="muted">Haz clic en un día para ver shows.</p>
                ) : dayEvents.length === 0 ? (
                  <EmptyState title="Sin shows" description="No hay eventos con fecha en este día." />
                ) : (
                  dayEvents.map((e) => (
                    <Link key={e.id} href={`/events/${e.id}`} className="cal-event">
                      <div className="cal-event__head">
                        <strong>{e.name}</strong>
                        <StatusBadge value={e.status} kind="event" />
                      </div>
                      <span className="muted">
                        {[e.artist, e.venue].filter(Boolean).join(' · ') || 'Sin venue'}
                      </span>
                      <span className="muted">
                        {e.startsAt
                          ? new Date(e.startsAt).toLocaleString('es-MX', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                        {e.endsAt
                          ? ` → ${new Date(e.endsAt).toLocaleString('es-MX', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`
                          : ''}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
