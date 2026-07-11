'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  status: string;
  campaignType: string;
  updatedAt: string;
};

export default function EventsPage() {
  const { entity } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    api<EventRow[]>(`/events?entity=${entity}`).then(setEvents).catch(console.error);
  }, [entity]);

  return (
    <AppShell title="Eventos">
      <div className="panel">
        <div className="panel-head">
          <h2>
            Listado · {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema Explanada'}
          </h2>
          <Link className="btn" href="/events/new">
            Nuevo evento
          </Link>
        </div>
        <div className="panel-body">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Artista</th>
                <th>Venue</th>
                <th>Campaña</th>
                <th>Status</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/events/${e.id}`}>{e.name}</Link>
                  </td>
                  <td>{e.artist || '—'}</td>
                  <td>{e.venue || '—'}</td>
                  <td>{e.campaignType}</td>
                  <td>
                    <span className={`badge ${e.status === 'ACTIVE' ? 'ok' : 'warn'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="muted">{new Date(e.updatedAt).toLocaleString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
