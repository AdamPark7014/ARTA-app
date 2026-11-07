'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { ActionLink, FieldCheck, FilterBar, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

const MODULES: Array<{ key: string; label: string; href: string; keys: string }> = [
  { key: 'hospitality', label: 'Hospitality', href: '/hospitality', keys: 'HOSPEDAJE' },
  { key: 'transport', label: 'Transportación', href: '/transport', keys: 'TRANSPORTACION' },
  { key: 'catering', label: 'Catering', href: '/catering', keys: 'CATERING' },
  { key: 'press', label: 'Rueda de prensa', href: '/press', keys: 'RUEDA_PRENSA' },
  { key: 'arts', label: 'Artes', href: '/arts', keys: 'ARTES_SHOWS' },
  { key: 'pendones', label: 'Pendones', href: '/pendones', keys: 'PENDONES' },
];

type OpsKpis = {
  total: number;
  critical: number;
  incomplete: number;
  pendingAuth: number;
  avgProgress: number;
};

type ModuleRow = {
  key: string;
  label: string;
  href: string;
  kpis: OpsKpis | null;
  byRisk: { critical: number; watch: number; healthy: number } | null;
};

/** Qué módulos se enseñan: todos, o solo los que tienen críticos, incompletos o firmas pendientes. */
type View = 'all' | 'critical' | 'incomplete' | 'pendingAuth';

const VIEW_LABEL: Record<View, string> = {
  all: 'formatos',
  critical: 'críticos',
  incomplete: 'incompletos',
  pendingAuth: 'firmas pendientes',
};

function matchesView(r: ModuleRow, view: View) {
  if (view === 'all') return true;
  if (view === 'critical') return (r.kpis?.critical || 0) > 0;
  if (view === 'incomplete') return (r.kpis?.incomplete || 0) > 0;
  return (r.kpis?.pendingAuth || 0) > 0;
}

/**
 * «Abrir» lleva al módulo filtrado en lo mismo que se está mirando: críticos (`?riesgo=`), firmas
 * o incompletos (`?estado=`). Sin filtro la fila enseña totales, así que el módulo abre completo.
 */
function moduleHref(r: ModuleRow, view: View) {
  if (view === 'critical' && (r.kpis?.critical || 0) > 0) return `${r.href}?riesgo=critical`;
  if (view === 'pendingAuth' && (r.kpis?.pendingAuth || 0) > 0) return `${r.href}?estado=firma`;
  if (view === 'incomplete' && (r.kpis?.incomplete || 0) > 0) return `${r.href}?estado=incompletos`;
  return r.href;
}

export default function RiskWorkspacePage() {
  const { entity } = useUser();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('all');

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          MODULES.map(async (m) => {
            const data = await api<{
              kpis: OpsKpis;
              byRisk: { critical: number; watch: number; healthy: number };
            }>(`/analytics/ops?entity=${entity}&keys=${m.keys}`).catch(() => null);
            return {
              key: m.key,
              label: m.label,
              href: m.href,
              kpis: data?.kpis || null,
              byRisk: data?.byRisk || null,
            };
          }),
        );
        setRows(results);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [entity]);

  const totals = rows.reduce(
    (acc, r) => {
      if (!r.kpis) return acc;
      return {
        critical: acc.critical + r.kpis.critical,
        incomplete: acc.incomplete + r.kpis.incomplete,
        pendingAuth: acc.pendingAuth + r.kpis.pendingAuth,
        total: acc.total + r.kpis.total,
      };
    },
    { critical: 0, incomplete: 0, pendingAuth: 0, total: 0 },
  );

  const ranked = useMemo(
    () => [...rows].sort((a, b) => (b.kpis?.critical || 0) - (a.kpis?.critical || 0)),
    [rows],
  );

  const visible = useMemo(() => ranked.filter((r) => matchesView(r, view)), [ranked, view]);

  /** Un KPI se toca para filtrar y otra vez para quitar el filtro. */
  const toggleView = (next: View) => setView((cur) => (cur === next ? 'all' : next));

  return (
    <AppShell title="Riesgo">
      <div className="stack page-workspace">
        <PageHeader
          title="Riesgo"
          description="Riesgo operativo por área, a partir del avance de los formatos de cada evento."
        >
          <ActionLink href="/events" variant="ghost">Ver eventos</ActionLink>
        </PageHeader>
        {msg ? (
          <FlashMessage variant="error" onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Calculando riesgo por módulo…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <button
                type="button"
                className={`kpi kpi--action ${totals.critical ? 'kpi--danger' : ''} ${view === 'critical' ? 'kpi--on' : ''}`}
                aria-pressed={view === 'critical'}
                onClick={() => toggleView('critical')}
              >
                <div className="label">Críticos</div>
                <div className="value">{totals.critical}</div>
                <div className="kpi-sub muted">Módulos con críticos</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${view === 'incomplete' ? 'kpi--on' : ''}`}
                aria-pressed={view === 'incomplete'}
                onClick={() => toggleView('incomplete')}
              >
                <div className="label">Incompletos</div>
                <div className="value">{totals.incomplete}</div>
                <div className="kpi-sub muted">Módulos bajo 100%</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${view === 'pendingAuth' ? 'kpi--on' : ''}`}
                aria-pressed={view === 'pendingAuth'}
                onClick={() => toggleView('pendingAuth')}
              >
                <div className="label">Firmas pendientes</div>
                <div className="value">{totals.pendingAuth}</div>
                <div className="kpi-sub muted">Módulos con firmas por dar</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${view === 'all' ? 'kpi--on' : ''}`}
                aria-pressed={view === 'all'}
                onClick={() => setView('all')}
              >
                <div className="label">Formatos</div>
                <div className="value">{totals.total}</div>
                <div className="kpi-sub muted">Ver todos los módulos</div>
              </button>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Por módulo · priorizado</h2>
              </div>
              <div className="panel-body">
                <FilterBar meta={`${visible.length} de ${ranked.length} módulos`}>
                  <FieldCheck
                    checked={view === 'critical'}
                    onChange={(v) => setView(v ? 'critical' : 'all')}
                    label="Solo con críticos"
                  />
                </FilterBar>
                {!ranked.length || !totals.total ? (
                  <EmptyState
                    title="Sin formatos en esta entidad"
                    description="Cuando haya shows con plantillas, el riesgo aparecerá aquí."
                    actionHref="/events"
                    actionLabel="Ir a eventos"
                  />
                ) : !visible.length ? (
                  <EmptyState
                    title={`Sin módulos con ${VIEW_LABEL[view]}`}
                    description="Ningún módulo tiene formatos en ese estado ahora."
                  >
                    {view !== 'all' ? (
                      <button className="btn ghost" type="button" onClick={() => setView('all')}>
                        Quitar filtro
                      </button>
                    ) : null}
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Módulo</th>
                          <th className="num">Total</th>
                          <th className="num">Críticos</th>
                          <th className="num">Avg %</th>
                          <th>Distribución</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((r) => (
                          <tr key={r.key}>
                            <td>
                              <strong>{r.label}</strong>
                              {r.kpis?.critical ? (
                                <div>
                                  <StatusBadge value="critical" kind="risk" />
                                </div>
                              ) : null}
                            </td>
                            <td className="num">{r.kpis?.total ?? '—'}</td>
                            <td className="num">{r.kpis?.critical ?? '—'}</td>
                            <td className="num">{r.kpis?.avgProgress ?? '—'}%</td>
                            <td style={{ minWidth: 140 }}>
                              {r.byRisk ? (
                                <DistBar
                                  segments={[
                                    { label: 'c', value: r.byRisk.critical, tone: 'danger' },
                                    { label: 'w', value: r.byRisk.watch, tone: 'warn' },
                                    { label: 'h', value: r.byRisk.healthy, tone: 'ok' },
                                  ]}
                                />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <ActionLink href={moduleHref(r, view)} variant="ghost">Abrir</ActionLink>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
