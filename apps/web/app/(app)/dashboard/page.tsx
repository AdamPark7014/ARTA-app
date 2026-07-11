'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { ROLE_SCOPE, canAccessEventOps, userHasPermission } from '@/lib/access-matrix';

type EventRow = {
  id: string;
  name: string;
  artist?: string | null;
  status: string;
  entity: string;
  startsAt?: string | null;
  _count?: { checklists: number; purchaseOrders: number; tasks?: number };
};

type MyTask = { id: string; status: string };

export default function DashboardPage() {
  const { entity, user } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [myOpenTasks, setMyOpenTasks] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canAccessEventOps(user?.roleKey || '', entity)) {
      setEvents([]);
      setError('');
      return;
    }
    api<EventRow[]>(`/events?entity=${entity}`)
      .then(setEvents)
      .catch((e) => setError(e.message));
    api<MyTask[]>('/tasks/mine')
      .then((t) => setMyOpenTasks(t.filter((x) => x.status !== 'DONE').length))
      .catch(() => undefined);
  }, [entity, user?.roleKey]);

  const eventOps = canAccessEventOps(user?.roleKey || '', entity);
  const active = events.filter((e) => e.status === 'ACTIVE').length;
  const closed = events.filter((e) => e.status === 'CLOSED').length;
  const canCreate =
    eventOps && user
      ? userHasPermission(user.roleKey, user.permissions, ['event.create', 'everything'])
      : false;

  return (
    <AppShell title="Dashboard">
      <div className="stack">
        <div className="panel">
          <div className="panel-body row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="muted" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Sesión · {user?.roleKey}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', marginTop: 4 }}>
                Hola, {user?.fullName?.split(' ')[0]}
              </div>
              <p className="muted" style={{ margin: '6px 0 0', maxWidth: 520, fontSize: 13 }}>
                {ROLE_SCOPE[user?.roleKey || ''] || ''}
              </p>
            </div>
            <div className="row">
              <Link className="btn ghost" href="/p/arta">
                Ver sitio Arta
              </Link>
              {!eventOps ? (
                <Link className="btn" href="/folders">
                  Carpetas generales
                </Link>
              ) : null}
              {canCreate ? (
                <Link className="btn" href="/events/new">
                  Nuevo evento
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {!eventOps ? (
          <div className="panel">
            <div className="panel-body">
              <p style={{ margin: 0 }}>
                En Arta tu acceso es a carpetas generales (sin operación de eventos). Cambia a Auditorio en el
                switch de entidad para conciertos, OC y checklists.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn" href="/folders">
                  Ir a carpetas
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid-cards">
              <div className="kpi">
                <div className="label">Eventos</div>
                <div className="value">{events.length}</div>
              </div>
              <div className="kpi">
                <div className="label">Activos</div>
                <div className="value">{active}</div>
              </div>
              <div className="kpi">
                <div className="label">Cerrados</div>
                <div className="value">{closed}</div>
              </div>
              <div className="kpi">
                <div className="label">Mis tareas abiertas</div>
                <div className="value">{myOpenTasks}</div>
                <Link href="/tasks" className="muted" style={{ fontSize: 12 }}>
                  Ver todas
                </Link>
              </div>
              <div className="kpi">
                <div className="label">Entidad</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>
                  {entity === 'ARTA' ? 'Arta' : 'Auditorio'}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Eventos recientes · {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'}</h2>
                {canCreate ? (
                  <Link className="btn" href="/events/new">
                    Crear evento
                  </Link>
                ) : null}
              </div>
              <div className="panel-body">
                {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
                {!events.length && !error ? (
                  <p className="muted">
                    Aún no hay eventos en esta entidad.{' '}
                    {canCreate ? 'Crea el primero con todos los formatos.' : ''}
                  </p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Evento</th>
                        <th>Artista</th>
                        <th>Status</th>
                        <th>Checklists</th>
                        <th>OC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.slice(0, 10).map((e) => (
                        <tr key={e.id}>
                          <td>
                            <Link href={`/events/${e.id}`}>{e.name}</Link>
                          </td>
                          <td>{e.artist || '—'}</td>
                          <td>
                            <span className={`badge ${e.status === 'ACTIVE' ? 'ok' : 'warn'}`}>
                              {e.status}
                            </span>
                          </td>
                          <td>{e._count?.checklists ?? 0}</td>
                          <td>{e._count?.purchaseOrders ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
