'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, SparkBars, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { ActionLink, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { ROLE_SCOPE, canAccessEventOps } from '@/lib/access-matrix';

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

  const scopeHint =
    ROLE_SCOPE[user?.roleKey || ''] ||
    'Prioriza shows en riesgo, cash de OC y firmas pendientes.';

  return (
    <AppShell title="Centro de comando">
      <div className="stack page-workspace">
        <PageHeader
          title={`Hola, ${user?.fullName?.split(' ')[0] || 'equipo'}`}
          description={`${entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'} · ${user?.roleKey || '—'}. ${scopeHint}`}
          hint="Revisa alertas críticas, pipeline de riesgo y actividad reciente antes de cerrar el día."
        >
          <ActionLink href="/p/arta" variant="ghost">
            Sitio Arta
          </ActionLink>
          {!eventOps ? <ActionLink href="/folders">Carpetas</ActionLink> : null}
        </PageHeader>

        {!eventOps ? (
          <div className="module-banner">
            <p className="kpi-sub muted">
              En Arta tu acceso es a carpetas generales. Cambia a Auditorio para conciertos, OC y
              checklists.
            </p>
            <div className="row row--tight">
              <Link className="btn btn-sm" href="/folders">
                Ir a carpetas
              </Link>
            </div>
          </div>
        ) : loading ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={4} label="Calculando inteligencia operativa…" />
          </>
        ) : error ? (
          <FlashMessage variant="error">{error}</FlashMessage>
        ) : data ? (
          <>
            {data.alerts.length ? (
              <div className="alert-stack">
                {data.alerts.slice(0, 6).map((a) => (
                  <div key={`${a.code}-${a.message}`} className={`ops-alert ops-alert--${a.severity}`}>
                    <span className="ops-alert__code">{a.code}</span>
                    <span className="ops-alert__msg">{a.message}</span>
                    {a.href ? (
                      <Link className="btn ghost btn-sm" href={a.href}>
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
                <div className="progress-cell">
                  <div className="progress">
                    <span style={{ width: `${data.kpis.avgOpsProgress}%` }} />
                  </div>
                </div>
              </div>
              <div className={`kpi ${data.kpis.portfolioNet < 0 ? 'kpi--danger' : ''}`}>
                <div className="label">Portfolio neto</div>
                <div className="value value--money">{money(data.kpis.portfolioNet)}</div>
                <div className="kpi-sub muted">
                  {money(data.kpis.portfolioIncome)} in · {money(data.kpis.portfolioExpense)} out
                </div>
              </div>
              <div className="kpi">
                <div className="label">Cash OC pipeline</div>
                <div className="value value--money">{money(data.kpis.poPipelineAmount)}</div>
                <div className="kpi-sub muted">
                  Pagado {money(data.kpis.poPaidAmount)}
                  {data.kpis.poAgingOver7 ? ` · ${data.kpis.poAgingOver7} aging` : ''}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Firmas / tareas</div>
                <div className="value">{data.kpis.pendingAuthorized}</div>
                <div className="kpi-sub muted">
                  {data.kpis.pendingAuthorized} pend. autorización · {data.kpis.openTasks} tareas
                  abiertas
                  {data.kpis.overdueTasks ? ` · ${data.kpis.overdueTasks} vencidas` : ''}
                </div>
              </div>
            </div>

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Pipeline de riesgo</h2>
                  <Link className="btn ghost btn-sm" href="/events">
                    Todos
                  </Link>
                </div>
                <div className="panel-body">
                  {!data.atRisk.length ? (
                    <EmptyState
                      title="Portfolio saludable"
                      description="Ningún show en riesgo crítico o en observación."
                      actionHref="/events"
                      actionLabel="Ver eventos"
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-sticky">
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
                                <div className="muted kpi-sub">{e.artist || '—'}</div>
                              </td>
                              <td>
                                <StatusBadge value={e.risk} kind="risk" />
                              </td>
                              <td>
                                <div className="progress-cell">
                                  <div className="progress">
                                    <span style={{ width: `${e.avgProgress}%` }} />
                                  </div>
                                  <span className="muted kpi-sub">{e.avgProgress}%</span>
                                </div>
                              </td>
                              <td className="muted">
                                {e.daysToShow == null
                                  ? '—'
                                  : e.daysToShow < 0
                                    ? 'pasado'
                                    : `${e.daysToShow}d`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                    <div className="muted kpi-sub">Mix por status</div>
                    <DistBar
                      segments={[
                        { label: 'ACTIVE', value: data.eventsByStatus.ACTIVE || 0, tone: 'ok' },
                        { label: 'DRAFT', value: data.eventsByStatus.DRAFT || 0, tone: 'muted' },
                        { label: 'CLOSED', value: data.eventsByStatus.CLOSED || 0, tone: 'warn' },
                        {
                          label: 'CANCELLED',
                          value: data.eventsByStatus.CANCELLED || 0,
                          tone: 'danger',
                        },
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
                      <EmptyState
                        title="Sin shows próximos"
                        description="No hay eventos en la ventana de 14 días."
                        actionHref="/events"
                        actionLabel="Ver calendario"
                      />
                    ) : (
                      <ul className="compact-list">
                        {data.upcoming.map((e) => (
                          <li key={e.id}>
                            <Link href={`/events/${e.id}`}>
                              <strong>{e.name}</strong>
                            </Link>
                            <span className="muted kpi-sub">
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
                  <Link className="btn ghost btn-sm" href="/finance">
                    Finanzas
                  </Link>
                </div>
                <div className="panel-body">
                  <div className="mini-rank">
                    <div>
                      <div className="muted kpi-sub">Top neto</div>
                      {data.topMargin.slice(0, 4).map((r) => (
                        <div key={r.eventId} className="mini-rank__row">
                          <Link href={`/events/${r.eventId}?tab=finance`}>{r.name}</Link>
                          <strong>{money(r.net)}</strong>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="muted kpi-sub">Peor neto</div>
                      {data.bottomMargin.slice(0, 4).map((r) => (
                        <div key={r.eventId} className="mini-rank__row">
                          <Link href={`/events/${r.eventId}?tab=finance`}>{r.name}</Link>
                          <strong>{money(r.net)}</strong>
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
                    <EmptyState
                      title="Sin checklists aún"
                      description="Cuando haya instancias por plantilla verás avance y pendientes de autorización."
                      actionHref="/checklists"
                      actionLabel="Ver plantillas"
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="table table-sticky">
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
                                <code>{t.key}</code>
                                <div className="muted kpi-sub">{t.count} instancias</div>
                              </td>
                              <td>
                                <div className="progress-cell">
                                  <div className="progress">
                                    <span style={{ width: `${t.avgProgress}%` }} />
                                  </div>
                                  <span className="kpi-sub">{t.avgProgress}%</span>
                                </div>
                              </td>
                              <td>{t.pendingAuth}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Actividad reciente</h2>
                <Link className="btn ghost btn-sm" href="/audit">
                  Auditoría
                </Link>
              </div>
              <div className="panel-body">
                {!data.recentActivity.length ? (
                  <EmptyState
                    title="Sin movimientos recientes"
                    description="No hubo actividad registrada en los últimos 30 días."
                    actionHref="/audit"
                    actionLabel="Ver auditoría"
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
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
                            <td className="kpi-sub">{a.resource}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
