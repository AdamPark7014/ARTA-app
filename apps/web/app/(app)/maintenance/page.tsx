'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
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

  useEffect(() => {
    if (entity !== 'EXPLANADA') setEntity('EXPLANADA');
    api<EventRow[]>('/events?entity=EXPLANADA')
      .then(async (list) => {
        const detailed = await Promise.all(
          list.slice(0, 20).map(async (ev) => api<EventRow>(`/events/${ev.id}`)),
        );
        setEvents(detailed);
      })
      .catch(console.error);
  }, [entity, setEntity]);

  return (
    <AppShell title="Mantenimiento · Auditorio">
      <div className="stack">
        <p className="muted">
          Solo Explanada / Auditorio Arema. Checklists de mantenimiento por evento de renta.
        </p>
        <div className="row">
          <Link className="btn" href="/events/new">
            Nuevo evento Explanada
          </Link>
        </div>
        <div className="grid-cards">
          {events.map((ev) => {
            const maint = (ev.checklists || []).filter(
              (c) => c.template?.key === 'MANTENIMIENTO' || /manten/i.test(c.title),
            );
            const list = maint.length ? maint : (ev.checklists || []).slice(0, 3);
            const primary = list[0];
            return (
              <div className="kpi" key={ev.id}>
                <div className="label">{ev.status}</div>
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
                <Link
                  className="btn ghost"
                  href={
                    primary
                      ? `/events/${ev.id}?tab=checklists&checklist=${primary.id}`
                      : `/events/${ev.id}`
                  }
                  style={{ marginTop: 12 }}
                >
                  Abrir
                </Link>
              </div>
            );
          })}
        </div>
        {!events.length ? <p className="muted">No hay eventos Explanada aún.</p> : null}
      </div>
    </AppShell>
  );
}
