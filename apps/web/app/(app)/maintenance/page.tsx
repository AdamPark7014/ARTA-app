'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { ActionLink, FieldSearch, PageHeader, FilterBar } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  status: string;
  venue?: string | null;
  checklists: Array<{ id: string; title: string; progressPct: number; template?: { key: string } }>;
};

export default function MaintenancePage() {
  const { entity, setEntity } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (entity !== 'EXPLANADA') setEntity('EXPLANADA');
    setLoading(true);
    api<EventRow[]>('/events?entity=EXPLANADA')
      .then(async (list) => {
        const detailed = await Promise.all(
          list.slice(0, 20).map(async (ev) => api<EventRow>(`/events/${ev.id}`)),
        );
        setEvents(detailed);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity, setEntity]);

  const filtered = useMemo(() => {
    if (!q.trim()) return events;
    const n = q.toLowerCase();
    return events.filter(
      (ev) =>
        ev.name.toLowerCase().includes(n) ||
        (ev.venue || '').toLowerCase().includes(n) ||
        ev.status.toLowerCase().includes(n),
    );
  }, [events, q]);

  return (
    <AppShell title="Mantenimiento · Auditorio">
      <div className="stack page-workspace">
        <PageHeader
          description="Checklists de mantenimiento para eventos de renta en Explanada / Auditorio Arema."
          hint="Solo entidad Explanada. Abre el checklist desde la tarjeta o entra al evento para ver el detalle completo."
        >
          <ActionLink href="/events/new">Nuevo evento Explanada</ActionLink>
        </PageHeader>

        <FilterBar meta={`${filtered.length} de ${events.length} eventos · Explanada`}>
          <FieldSearch
            value={q}
            onChange={setQ}
            placeholder="Buscar evento o venue…"
            label="Buscar eventos"
          />
        </FilterBar>

        {loading ? (
          <LoadingBlock rows={4} label="Cargando eventos Explanada…" />
        ) : !events.length ? (
          <EmptyState
            title="No hay eventos Explanada aún"
            description="Crea un evento de renta para el auditorio; se asignarán checklists de mantenimiento automáticamente."
            actionHref="/events/new"
            actionLabel="Nuevo evento"
          />
        ) : !filtered.length ? (
          <EmptyState
            title="Sin coincidencias"
            description="Prueba otro término de búsqueda o limpia el filtro."
          >
            <button className="btn ghost" type="button" onClick={() => setQ('')}>
              Limpiar búsqueda
            </button>
          </EmptyState>
        ) : (
          <div className="grid-cards">
            {filtered.map((ev) => {
              const maint = (ev.checklists || []).filter(
                (c) => c.template?.key === 'MANTENIMIENTO' || /manten/i.test(c.title),
              );
              const list = maint.length ? maint : (ev.checklists || []).slice(0, 3);
              const primary = list[0];
              return (
                <div className="kpi stack" key={ev.id}>
                  <div className="label">
                    <StatusBadge value={ev.status} kind="event" />
                  </div>
                  <strong>{ev.name}</strong>
                  <div className="kpi-sub muted">{ev.venue || 'Auditorio Arema Explanada'}</div>
                  <div className="checklist-picker__list">
                    {list.map((c) => (
                      <Link
                        key={c.id}
                        className="format-card"
                        href={`/events/${ev.id}?tab=checklists&checklist=${c.id}`}
                      >
                        <div className="format-card__title">{c.title}</div>
                        <div className="format-card__progress">
                          <div className="progress">
                            <span style={{ width: `${c.progressPct}%` }} />
                          </div>
                          <span className="kpi-sub muted">{c.progressPct}%</span>
                        </div>
                      </Link>
                    ))}
                    {!list.length ? (
                      <p className="checklist-picker__empty muted">Sin checklists asignados</p>
                    ) : null}
                  </div>
                  <div className="row">
                    <ActionLink
                      href={
                        primary
                          ? `/events/${ev.id}?tab=checklists&checklist=${primary.id}`
                          : `/events/${ev.id}`
                      }
                      variant="ghost"
                    >
                      Abrir evento
                    </ActionLink>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
