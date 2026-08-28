'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import {
  FieldCheck,
  FieldSearch,
  FieldSelect,
  FilterBar,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge, pipelineStatusLabel } from '@/components/ui/StatusBadge';
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

type Scope = 'active' | 'past' | 'all';

const SCOPE_TITLE: Record<Scope, string> = {
  active: 'Eventos actuales',
  past: 'Eventos pasados',
  all: 'Pipeline de eventos',
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Junta 2026-08-28: el menú separa «Eventos actuales» de «Eventos Pasados».
 * Pasado = cerrado/cancelado, o con fecha de show anterior a hoy.
 */
function isPastEvent(e: EventRow, today: number) {
  if (e.status === 'CLOSED' || e.status === 'CANCELLED') return true;
  if (!e.startsAt) return false;
  return new Date(e.startsAt).getTime() < today;
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Eventos">
          <div className="stack page-workspace">
            <LoadingBlock rows={5} label="Cargando pipeline…" />
          </div>
        </AppShell>
      }
    >
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const { entity, user } = useUser();
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get('scope');
  const scope: Scope =
    scopeParam === 'past' || scopeParam === 'all' || scopeParam === 'active'
      ? scopeParam
      : 'active';
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

  /** Universo de la vista: actuales, pasados o todo. */
  const scoped = useMemo(() => {
    if (scope === 'all') return events;
    const today = startOfToday();
    return events.filter((e) => isPastEvent(e, today) === (scope === 'past'));
  }, [events, scope]);

  const filtered = useMemo(() => {
    let list = scoped;
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
  }, [scoped, status, riskOnly, q, healthMap]);

  const pipeline = useMemo(() => {
    const groups: Record<string, EventRow[]> = {
      DRAFT: [],
      ACTIVE: [],
      CLOSED: [],
      CANCELLED: [],
    };
    for (const e of scoped) {
      if (groups[e.status]) groups[e.status].push(e);
    }
    return groups;
  }, [scoped]);

  const scopedIds = useMemo(() => new Set(scoped.map((e) => e.id)), [scoped]);
  const atRiskCount = health.filter((h) => h.risk !== 'healthy' && scopedIds.has(h.id)).length;

  const description =
    scope === 'past'
      ? `Histórico: shows cerrados, cancelados o con fecha ya pasada. ${scoped.length} en el archivo.`
      : scope === 'all'
        ? `Portafolio completo: pipeline, salud de checklists y hub del show. ${atRiskCount} en riesgo.`
        : `Shows en curso y por venir. Pipeline, salud de checklists y hub del show. ${atRiskCount} en riesgo.`;

  return (
    <AppShell title={SCOPE_TITLE[scope]}>
      <div className="stack page-workspace">
        <PageHeader description={description}>
          <div className="row row--tight">
            {(['active', 'past', 'all'] as const).map((s) => (
              <Link
                key={s}
                href={s === 'active' ? '/events' : `/events?scope=${s}`}
                className={`btn btn-sm ${scope === s ? '' : 'ghost'}`}
              >
                {s === 'active' ? 'Actuales' : s === 'past' ? 'Pasados' : 'Todos'}
              </Link>
            ))}
          </div>
        </PageHeader>

        {loading ? (
          <LoadingBlock rows={5} label="Cargando pipeline…" />
        ) : (
          <>
            <div className="events-pipeline">
              {(['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const).map((st) => (
                <div key={st} className="events-pipeline__col">
                  <h3>
                    {pipelineStatusLabel(st)} · {pipeline[st].length}
                  </h3>
                  {pipeline[st].slice(0, 4).map((e) => {
                    const h = healthMap.get(e.id);
                    return (
                      <Link key={e.id} className="events-pipeline__item" href={`/events/${e.id}`}>
                        <strong>{e.name}</strong>
                        <div className="muted kpi-sub">
                          {e.artist || '—'}
                          {h ? ` · ${h.avgProgress}%` : ''}
                        </div>
                        {h && h.risk !== 'healthy' ? (
                          <StatusBadge value={h.risk} kind="risk" />
                        ) : null}
                      </Link>
                    );
                  })}
                  {!pipeline[st].length ? (
                    <p className="pipeline-empty muted">Sin eventos</p>
                  ) : null}
                  {pipeline[st].length > 4 ? (
                    <button
                      type="button"
                      className="btn ghost btn-sm pipeline-more"
                      onClick={() => setStatus(st)}
                    >
                      Ver todos ({pipeline[st].length})
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <FilterBar>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar nombre, artista, venue…"
                label="Buscar nombre, artista o venue"
                maxWidth={300}
              />
              <FieldSelect
                value={status}
                onChange={setStatus}
                label="Filtrar por estado"
                options={[
                  { value: 'all', label: 'Todos los estados' },
                  { value: 'DRAFT', label: 'Borrador' },
                  { value: 'ACTIVE', label: 'Activo' },
                  { value: 'CLOSED', label: 'Cerrado' },
                  { value: 'CANCELLED', label: 'Cancelado' },
                ]}
              />
              <FieldCheck checked={riskOnly} onChange={setRiskOnly} label="Solo en riesgo" />
            </FilterBar>

            <div className="panel">
              <div className="panel-head">
                <h2>
                  Listado · {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema Explanada'} ·{' '}
                  {filtered.length}
                </h2>
              </div>
              <div className="panel-body">
                <div className="events-card-list">
                  {filtered.map((e) => {
                    const h = healthMap.get(e.id);
                    return (
                      <Link key={e.id} className="events-card" href={`/events/${e.id}`}>
                        <div className="events-card__head">
                          <strong>{e.name}</strong>
                          <StatusBadge value={e.status} kind="event" />
                        </div>
                        <p className="muted kpi-sub">
                          {e.artist || '—'}
                          {e.venue ? ` · ${e.venue}` : ''}
                        </p>
                        <div className="events-card__meta">
                          <span>
                            {e.startsAt
                              ? new Date(e.startsAt).toLocaleDateString('es-MX')
                              : 'Sin fecha'}
                          </span>
                          {h ? (
                            <>
                              <span>{h.avgProgress}% ops</span>
                              <StatusBadge value={h.risk} kind="risk" />
                            </>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                  {!filtered.length ? (
                    <EmptyState
                      title="Sin eventos para este filtro"
                      description="Ajusta búsqueda o crea un show nuevo."
                      actionHref={canCreate ? '/events/new' : undefined}
                      actionLabel={canCreate ? 'Nuevo evento' : undefined}
                    />
                  ) : null}
                </div>
                <div className="table-wrap events-table-desktop">
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
                                <div className="progress-cell">
                                  <div className="progress">
                                    <span style={{ width: `${h.avgProgress}%` }} />
                                  </div>
                                  <span className="muted kpi-sub">{h.avgProgress}%</span>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{h ? <StatusBadge value={h.risk} kind="risk" /> : '—'}</td>
                            <td>
                              <StatusBadge value={e.status} kind="event" />
                            </td>
                            <td className="muted kpi-sub">
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
