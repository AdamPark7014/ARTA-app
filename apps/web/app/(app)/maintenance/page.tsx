'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
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
        <PageHeader description="Solo Explanada / Auditorio Arema. Checklists de mantenimiento por evento de renta.">
          <ActionLink href="/events/new">Nuevo evento Explanada</ActionLink>
        </PageHeader>

        <FilterBar meta={`${filtered.length} de ${events.length} eventos`}>
          <FieldSearch
            value={q}
            onChange={setQ}
            placeholder="Buscar evento o venue…"
            label="Buscar eventos"
          />
        </FilterBar>

        {loading ? (
          <p className="muted">Cargando eventos Explanada…</p>
        ) : !events.length ? (
          <EmptyState
            title="No hay eventos Explanada aún"
            description="Crea un evento de renta para el auditorio y asigna checklists de mantenimiento."
            actionHref="/events/new"
            actionLabel="Nuevo evento"
          />
        ) : !filtered.length ? (
          <EmptyState title="Sin coincidencias" description="Prueba otro término de búsqueda." />
        ) : (
          <div className="grid-cards">
            {filtered.map((ev) => {
              const maint = (ev.checklists || []).filter(
                (c) => c.template?.key === 'MANTENIMIENTO' || /manten/i.test(c.title),
              );
              const list = maint.length ? maint : (ev.checklists || []).slice(0, 3);
              const primary = list[0];
              return (
                <div className="kpi" key={ev.id}>
                  <div className="label">
                    <StatusBadge value={ev.status} kind="event" />
                  </div>
                  <div style={{ fontWeight: 600, margin: '0.35rem 0' }}>{ev.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {ev.venue || 'Auditorio Arema Explanada'}
                  </div>
                  <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                    {list.map((c) => (
                      <Link
                        key={c.id}
                        href={`/events/${ev.id}?tab=checklists&checklist=${c.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ fontSize: 13 }}>{c.title}</div>
                        <div className="progress">
                          <span style={{ width: `${c.progressPct}%` }} />
                        </div>
                      </Link>
                    ))}
                    {!list.length ? <div className="muted">Sin checklists</div> : null}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ActionLink
                      href={
                        primary
                          ? `/events/${ev.id}?tab=checklists&checklist=${primary.id}`
                          : `/events/${ev.id}`
                      }
                      variant="ghost"
                    >
                      Abrir
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
