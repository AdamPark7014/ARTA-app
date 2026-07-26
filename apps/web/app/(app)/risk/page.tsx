'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
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

export default function RiskWorkspacePage() {
  const { entity } = useUser();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

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

  const ranked = [...rows].sort((a, b) => (b.kpis?.critical || 0) - (a.kpis?.critical || 0));

  return (
    <AppShell title="Risk workspace · Ops">
      <div className="stack page-workspace">
        <div className="page-intro">
          <p className="muted">
            Vista cruzada de riesgo operativo por disciplina (checklists). Drill-down a cada índice ·{' '}
            {entity}.
          </p>
          <Link className="btn ghost" href="/events">
            Pipeline eventos
          </Link>
        </div>
        {msg ? <div className="muted">{msg}</div> : null}

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Calculando riesgo por módulo…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className={`kpi ${totals.critical ? 'kpi--danger' : ''}`}>
                <div className="label">Críticos</div>
                <div className="value">{totals.critical}</div>
              </div>
              <div className="kpi">
                <div className="label">Incompletos</div>
                <div className="value">{totals.incomplete}</div>
              </div>
              <div className="kpi">
                <div className="label">Firmas pendientes</div>
                <div className="value">{totals.pendingAuth}</div>
              </div>
              <div className="kpi">
                <div className="label">Checklists</div>
                <div className="value">{totals.total}</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Por módulo · priorizado</h2>
              </div>
              <div className="panel-body">
                {!ranked.length || !totals.total ? (
                  <EmptyState
                    title="Sin checklists en esta entidad"
                    description="Cuando haya shows con plantillas, el riesgo aparecerá aquí."
                    actionHref="/events"
                    actionLabel="Ir a eventos"
                  />
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
                        {ranked.map((r) => (
                          <tr key={r.key}>
                            <td>
                              <strong>{r.label}</strong>
                              {r.kpis?.critical ? (
                                <div>
                                  <span className="badge badge--risk-critical">critical</span>
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
                              <Link className="btn ghost" href={r.href}>
                                Abrir
                              </Link>
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
