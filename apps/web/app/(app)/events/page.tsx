'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

type EventRow = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  status: string;
  campaignType: string;
  startsAt?: string | null;
  updatedAt: string;
  _count?: { checklists: number; purchaseOrders: number; tasks?: number };
};

type HealthItem = {
  id: string;
  name: string;
  artist?: string | null;
  status: string;
  startsAt?: string | null;
  avgProgress: number;
  risk: 'critical' | 'watch' | 'healthy';
  daysToShow: number | null;
};

type Overview = {
  eventHealth: HealthItem[];
  kpis: { eventsAtRisk: number; avgOpsProgress: number };
};

function riskBadge(risk: string) {
  return `badge badge--risk-${risk}`;
}

export default function EventsPage() {
  const { entity, user } = useUser();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [riskOnly, setRiskOnly] = useState(false);

  const canCreate = user
    ? userHasPermission(user.roleKey, user.permissions, ['event.create', 'everything'])
    : false;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<EventRow[]>(`/events?entity=${entity}`),
      api<Overview>(`/analytics/overview?entity=${entity}`).catch(() => null),
    ])
      .then(([ev, o]) => {
        setEvents(ev);
        setHealth(o?.eventHealth || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity]);

  const healthMap = useMemo(() => new Map(health.map((h) => [h.id, h])), [health]);

  const filtered = useMemo(() => {
    let list = events;
    if (status !== 'all') list = list.filter((e) => e.status === status);
    if (riskOnly) {
      list = list.filter((e) => {
        const h = healthMap.get(e.id);
        return h && h.risk !== 'healthy';
      });
    }
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(n) ||
          (e.artist || '').toLowerCase().includes(n) ||
          (e.venue || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [events, status, riskOnly, q, healthMap]);

  const pipeline = useMemo(() => {
    const groups: Record<string, EventRow[]> = {
      DRAFT: [],
      ACTIVE: [],
      CLOSED: [],
      CANCELLED: [],
    };
    for (const e of events) {
      if (groups[e.status]) groups[e.status].push(e);
    }
    return groups;
  }, [events]);

  const atRiskCount = health.filter((h) => h.risk !== 'healthy').length;

  return (
    <AppShell title="Pipeline de eventos">
      <div className="stack page-workspace">
        <div className="page-intro">
          <div>
            <p className="muted">
              Portfolio operativo: pipeline, salud de checklists y hub del show. {atRiskCount} en
              riesgo.
            </p>
          </div>
          {canCreate ? (
            <Link className="btn" href="/events/new">
              Nuevo evento
            </Link>
          ) : null}
        </div>

        {loading ? (
          <LoadingBlock rows={5} label="Cargando pipeline…" />
        ) : (
          <>
            <div className="events-pipeline">
              {(['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const).map((st) => (
                <div key={st} className="events-pipeline__col">
                  <h3>
                    {st} · {pipeline[st].length}
                  </h3>
                  {pipeline[st].slice(0, 4).map((e) => {
                    const h = healthMap.get(e.id);
                    return (
                      <Link key={e.id} className="events-pipeline__item" href={`/events/${e.id}`}>
                        <strong>{e.name}</strong>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {e.artist || '—'}
                          {h ? ` · ${h.avgProgress}%` : ''}
                        </div>
                        {h && h.risk !== 'healthy' ? (
                          <span className={riskBadge(h.risk)}>{h.risk}</span>
                        ) : null}
                      </Link>
                    );
                  })}
                  {!pipeline[st].length ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Vacío
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                className="field"
                style={{ maxWidth: 300 }}
                placeholder="Buscar nombre, artista, venue…"
                aria-label="Buscar nombre, artista o venue"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className="field"
                style={{ width: 'auto' }}
                aria-label="Filtrar por estado"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="CLOSED">CLOSED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <label className="row" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} />
                Solo en riesgo
              </label>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>
                  Listado · {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema Explanada'} ·{' '}
                  {filtered.length}
                </h2>
              </div>
              <div className="panel-body">
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Artista</th>
                        <th>Venue</th>
                        <th>Show</th>
                        <th>Salud ops</th>
                        <th>Riesgo</th>
                        <th>Status</th>
                        <th>Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => {
                        const h = healthMap.get(e.id);
                        return (
                          <tr key={e.id}>
                            <td>
                              <Link href={`/events/${e.id}`}>
                                <strong>{e.name}</strong>
                              </Link>
                            </td>
                            <td>{e.artist || '—'}</td>
                            <td>{e.venue || '—'}</td>
                            <td className="muted">
                              {e.startsAt ? new Date(e.startsAt).toLocaleDateString('es-MX') : '—'}
                              {h?.daysToShow != null
                                ? ` · ${h.daysToShow < 0 ? 'pasado' : `${h.daysToShow}d`}`
                                : ''}
                            </td>
                            <td>
                              {h ? (
                                <>
                                  <div className="progress" style={{ minWidth: 72 }}>
                                    <span style={{ width: `${h.avgProgress}%` }} />
                                  </div>
                                  <span className="muted" style={{ fontSize: 11 }}>
                                    {h.avgProgress}%
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{h ? <span className={riskBadge(h.risk)}>{h.risk}</span> : '—'}</td>
                            <td>
                              <span className={`badge ${e.status === 'ACTIVE' ? 'ok' : 'warn'}`}>
                                {e.status}
                              </span>
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {e._count
                                ? `${e._count.checklists} chk · ${e._count.purchaseOrders} OC${
                                    e._count.tasks != null ? ` · ${e._count.tasks} tasks` : ''
                                  }`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {!filtered.length ? (
                        <tr>
                          <td colSpan={8}>
                            <EmptyState
                              title="Sin eventos para este filtro"
                              description="Ajusta búsqueda o crea un show nuevo."
                              actionHref={canCreate ? '/events/new' : undefined}
                              actionLabel={canCreate ? 'Nuevo evento' : undefined}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
