'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, SparkBars, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { ROLE_SCOPE, canAccessEventOps, userHasPermission } from '@/lib/access-matrix';

type Overview = {
  generatedAt: string;
  kpis: {
    eventsTotal: number;
    eventsActive: number;
    eventsDraft: number;
    eventsClosed: number;
    eventsAtRisk: number;
    upcoming14d: number;
    avgOpsProgress: number;
    pendingDelivered: number;
    pendingAuthorized: number;
    openTasks: number;
    blockedTasks: number;
    overdueTasks: number;
    poPipelineAmount: number;
    poPaidAmount: number;
    poAgingOver7: number;
    portfolioIncome: number;
    portfolioExpense: number;
    portfolioNet: number;
    advanceTotal: number;
    activity90d: number;
  };
  eventsByStatus: Record<string, number>;
  createdTrend: Array<{ month: string; count: number }>;
  atRisk: Array<{
    id: string;
    name: string;
    artist?: string | null;
    avgProgress: number;
    risk: string;
    daysToShow: number | null;
  }>;
  upcoming: Array<{
    id: string;
    name: string;
    artist?: string | null;
    startsAt: string;
    avgProgress: number;
  }>;
  topMargin: Array<{ eventId: string; name: string; net: number; income: number; expense: number }>;
  bottomMargin: Array<{ eventId: string; name: string; net: number }>;
  checklistByTemplate: Record<string, { count: number; avgProgress: number; pendingAuth: number }>;
  alerts: Array<{ severity: string; code: string; message: string; href?: string }>;
  recentActivity: Array<{ id: string; action: string; resource: string; at: string; user: string }>;
};

export default function DashboardPage() {
  const { entity, user } = useUser();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const eventOps = canAccessEventOps(user?.roleKey || '', entity);
  const canCreate =
    eventOps && user
      ? userHasPermission(user.roleKey, user.permissions, ['event.create', 'everything'])
      : false;

  useEffect(() => {
    if (!eventOps) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Overview>(`/analytics/overview?entity=${entity}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entity, eventOps]);

  const templateRank = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.checklistByTemplate)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.avgProgress - b.avgProgress)
      .slice(0, 8);
  }, [data]);

  return (
    <AppShell title="Centro de comando">
      <div className="stack page-workspace">
        <div className="panel">
          <div className="panel-body row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Ops intelligence · {user?.roleKey}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', marginTop: 4 }}>
                Hola, {user?.fullName?.split(' ')[0]}
              </div>
              <p className="muted" style={{ margin: '6px 0 0', maxWidth: 560, fontSize: 13 }}>
                {ROLE_SCOPE[user?.roleKey || ''] ||
                  'Prioriza shows en riesgo, cash de OC y firmas pendientes.'}
              </p>
            </div>
            <div className="row">
              <Link className="btn ghost" href="/p/arta">
                Sitio Arta
              </Link>
              {!eventOps ? (
                <Link className="btn" href="/folders">
                  Carpetas
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
                En Arta tu acceso es a carpetas generales. Cambia a Auditorio para conciertos, OC y
                checklists.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn" href="/folders">
                  Ir a carpetas
                </Link>
              </div>
            </div>
          </div>
        ) : loading ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={4} label="Calculando inteligencia operativa…" />
          </>
        ) : error ? (
          <p style={{ color: 'var(--danger)' }}>{error}</p>
        ) : data ? (
          <>
            {data.alerts.length ? (
              <div className="alert-stack">
                {data.alerts.slice(0, 6).map((a) => (
                  <div key={`${a.code}-${a.message}`} className={`ops-alert ops-alert--${a.severity}`}>
                    <span className="ops-alert__code">{a.code}</span>
                    <span className="ops-alert__msg">{a.message}</span>
                    {a.href ? (
                      <Link className="btn ghost" href={a.href} style={{ marginLeft: 'auto' }}>
                        Ver
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Shows activos</div>
                <div className="value">{data.kpis.eventsActive}</div>
                <div className="kpi-sub muted">
                  {data.kpis.eventsTotal} total · {data.kpis.upcoming14d} en 14d
                </div>
              </div>
              <div className={`kpi ${data.kpis.eventsAtRisk ? 'kpi--danger' : ''}`}>
                <div className="label">En riesgo</div>
                <div className="value">{data.kpis.eventsAtRisk}</div>
                <div className="kpi-sub muted">Avance bajo o show cercano</div>
              </div>
              <div className="kpi">
                <div className="label">Avance ops</div>
                <div className="value">{data.kpis.avgOpsProgress}%</div>
                <div className="progress" style={{ marginTop: 8 }}>
                  <span style={{ width: `${data.kpis.avgOpsProgress}%` }} />
                </div>
              </div>
              <div className="kpi">
                <div className="label">Portfolio neto</div>
                <div
                  className="value"
                  style={{
                    fontSize: '1.35rem',
                    color: data.kpis.portfolioNet >= 0 ? 'var(--ok)' : 'var(--danger)',
                  }}
                >
                  {money(data.kpis.portfolioNet)}
                </div>
                <div className="kpi-sub muted">
                  {money(data.kpis.portfolioIncome)} in · {money(data.kpis.portfolioExpense)} out
                </div>
              </div>
              <div className="kpi">
                <div className="label">Cash OC pipeline</div>
                <div className="value" style={{ fontSize: '1.35rem' }}>
                  {money(data.kpis.poPipelineAmount)}
                </div>
                <div className="kpi-sub muted">
                  Pagado {money(data.kpis.poPaidAmount)}
                  {data.kpis.poAgingOver7 ? ` · ${data.kpis.poAgingOver7} aging` : ''}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Firmas / tareas</div>
                <div className="value" style={{ fontSize: '1.2rem' }}>
                  {data.kpis.pendingAuthorized}
                  <span className="muted" style={{ fontSize: 14 }}>
                    {' '}
                    auth
                  </span>
                </div>
                <div className="kpi-sub muted">
                  {data.kpis.openTasks} tareas abiertas
                  {data.kpis.overdueTasks ? ` · ${data.kpis.overdueTasks} vencidas` : ''}
                </div>
              </div>
            </div>

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Pipeline de riesgo</h2>
                  <Link className="btn ghost" href="/events">
                    Todos
                  </Link>
                </div>
                <div className="panel-body">
                  {!data.atRisk.length ? (
                    <EmptyState
                      title="Portfolio saludable"
                      description="Ningún show en riesgo crítico/watch."
                      actionHref="/events"
                      actionLabel="Ver eventos"
                    />
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Evento</th>
                          <th>Riesgo</th>
                          <th>Avance</th>
                          <th>Show</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.atRisk.map((e) => (
                          <tr key={e.id}>
                            <td>
                              <Link href={`/events/${e.id}`}>
                                <strong>{e.name}</strong>
                              </Link>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {e.artist || '—'}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${e.risk === 'critical' ? 'danger' : 'warn'}`}>
                                {e.risk}
                              </span>
                            </td>
                            <td>
                              <div className="progress" style={{ minWidth: 72 }}>
                                <span style={{ width: `${e.avgProgress}%` }} />
                              </div>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {e.avgProgress}%
                              </span>
                            </td>
                            <td className="muted">
                              {e.daysToShow == null ? '—' : e.daysToShow < 0 ? 'pasado' : `${e.daysToShow}d`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="stack">
                <div className="panel">
                  <div className="panel-head">
                    <h2>Alta de eventos (6 meses)</h2>
                  </div>
                  <div className="panel-body">
                    <SparkBars
                      values={data.createdTrend.map((x) => x.count)}
                      labels={data.createdTrend.map((x) => x.month.slice(5))}
                      height={96}
                    />
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      Status mix
                    </div>
                    <DistBar
                      segments={[
                        { label: 'ACTIVE', value: data.eventsByStatus.ACTIVE || 0, tone: 'ok' },
                        { label: 'DRAFT', value: data.eventsByStatus.DRAFT || 0, tone: 'muted' },
                        { label: 'CLOSED', value: data.eventsByStatus.CLOSED || 0, tone: 'warn' },
                        { label: 'CANCELLED', value: data.eventsByStatus.CANCELLED || 0, tone: 'danger' },
                      ]}
                    />
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h2>Próximos 14 días</h2>
                  </div>
                  <div className="panel-body">
                    {!data.upcoming.length ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Sin shows en la ventana.
                      </p>
                    ) : (
                      <ul className="compact-list">
                        {data.upcoming.map((e) => (
                          <li key={e.id}>
                            <Link href={`/events/${e.id}`}>
                              <strong>{e.name}</strong>
                            </Link>
                            <span className="muted">
                              {new Date(e.startsAt).toLocaleDateString('es-MX')} · {e.avgProgress}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Margen por evento</h2>
                  <Link className="btn ghost" href="/finance">
                    Finanzas
                  </Link>
                </div>
                <div className="panel-body">
                  <div className="mini-rank">
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Top neto
                      </div>
                      {data.topMargin.slice(0, 4).map((r) => (
                        <div key={r.eventId} className="mini-rank__row">
                          <Link href={`/events/${r.eventId}?tab=finance`}>{r.name}</Link>
                          <strong style={{ color: 'var(--ok)' }}>{money(r.net)}</strong>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Peor neto
                      </div>
                      {data.bottomMargin.slice(0, 4).map((r) => (
                        <div key={r.eventId} className="mini-rank__row">
                          <Link href={`/events/${r.eventId}?tab=finance`}>{r.name}</Link>
                          <strong style={{ color: r.net < 0 ? 'var(--danger)' : undefined }}>
                            {money(r.net)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Disciplinas (cuellos de botella)</h2>
                </div>
                <div className="panel-body">
                  {!templateRank.length ? (
                    <p className="muted">Sin checklists aún.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Plantilla</th>
                          <th>Avg</th>
                          <th>Pend. auth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {templateRank.map((t) => (
                          <tr key={t.key}>
                            <td>
                              <code style={{ fontSize: 12 }}>{t.key}</code>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {t.count} instancias
                              </div>
                            </td>
                            <td>
                              <div className="progress" style={{ minWidth: 64 }}>
                                <span style={{ width: `${t.avgProgress}%` }} />
                              </div>
                              {t.avgProgress}%
                            </td>
                            <td>{t.pendingAuth}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Actividad reciente</h2>
                <Link className="btn ghost" href="/audit">
                  Audit
                </Link>
              </div>
              <div className="panel-body">
                {!data.recentActivity.length ? (
                  <p className="muted">Sin movimientos en 30 días.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Quién</th>
                        <th>Acción</th>
                        <th>Recurso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentActivity.map((a) => (
                        <tr key={a.id}>
                          <td className="muted">{new Date(a.at).toLocaleString('es-MX')}</td>
                          <td>{a.user}</td>
                          <td>
                            <code>{a.action}</code>
                          </td>
                          <td>{a.resource}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
