'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldCheck,
  FieldSearch,
  FilterBar,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type FinanceRow = {
  eventId: string;
  name: string;
  artist?: string | null;
  status: string;
  income: number;
  expense: number;
  net: number;
  marginPct: number | null;
  locked: boolean;
  title?: string | null;
};

type FinanceAnalytics = {
  totals: {
    income: number;
    expense: number;
    net: number;
    locked: number;
    open: number;
    lossMaking: number;
  };
  byStatus: Record<string, { income: number; expense: number; net: number; count: number }>;
  ranking: FinanceRow[];
  rows: FinanceRow[];
  alerts: Array<{ severity: string; message: string }>;
};

export default function FinancePage() {
  const { entity, user } = useUser();
  const [data, setData] = useState<FinanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyLoss, setOnlyLoss] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<FinanceAnalytics>(`/analytics/finance?entity=${entity}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity]);

  const canEdit =
    user &&
    (user.roleKey === 'dir_general' ||
      user.roleKey === 'gerente_arta' ||
      user.roleKey === 'super_admin' ||
      user.permissions.includes('finance.edit'));

  const rows = useMemo(() => {
    let list = data?.ranking || [];
    if (onlyLoss) list = list.filter((r) => r.net < 0);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(n) || (r.artist || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [data, q, onlyLoss]);

  const t = data?.totals;

  return (
    <AppShell title="Finanzas · Portfolio">
      <div className="stack page-workspace">
        <PageHeader
          description={`Vista de corridas del portfolio: margen, pérdidas y estado de cierre.${
            canEdit ? ' Tienes permiso de edición.' : ' Acceso de lectura / seguimiento.'
          }`}
          hint="Filtra neto negativo para priorizar shows en pérdida. Abrir lleva directo a la corrida del evento."
        >
          <ActionLink href="/events?scope=active" variant="ghost">
            Eventos activos
          </ActionLink>
        </PageHeader>

        {loading ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={5} label="Cargando corridas…" />
          </>
        ) : (
          <>
            {data?.alerts?.length ? (
              <div className="alert-stack">
                {data.alerts.map((a) => (
                  <div key={a.message} className={`ops-alert ops-alert--${a.severity}`}>
                    <span className="ops-alert__msg">{a.message}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {t ? (
              <div className="grid-cards kpi-grid-dense">
                <div className="kpi">
                  <div className="label">Ingresos</div>
                  <div className="value value--money">{money(t.income)}</div>
                  <div className="kpi-sub muted">Portfolio acumulado</div>
                </div>
                <div className="kpi">
                  <div className="label">Egresos</div>
                  <div className="value value--money">{money(t.expense)}</div>
                  <div className="kpi-sub muted">Gastos registrados</div>
                </div>
                <div className={`kpi ${t.net < 0 ? 'kpi--danger' : ''}`}>
                  <div className="label">Neto portfolio</div>
                  <div className="value value--money">{money(t.net)}</div>
                  <div className="kpi-sub muted">
                    {t.net >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="label">Corridas locked</div>
                  <div className="value">{t.locked}</div>
                  <div className="kpi-sub muted">Selladas / solo lectura</div>
                </div>
                <div className="kpi">
                  <div className="label">Abiertas c/movimiento</div>
                  <div className="value">{t.open}</div>
                  <div className="kpi-sub muted">Con ingresos o egresos</div>
                </div>
                <div className={`kpi ${t.lossMaking ? 'kpi--danger' : ''}`}>
                  <div className="label">Neto negativo</div>
                  <div className="value">{t.lossMaking}</div>
                  <div className="kpi-sub muted">Shows en pérdida</div>
                </div>
              </div>
            ) : null}

            {data ? (
              <div className="panel">
                <div className="panel-body">
                  <div className="muted kpi-sub">Neto por status de evento</div>
                  <DistBar
                    segments={Object.entries(data.byStatus).map(([status, v]) => ({
                      label: status,
                      value: Math.max(0, v.net) || v.count,
                      tone: status === 'ACTIVE' ? 'ok' : status === 'CLOSED' ? 'warn' : 'muted',
                    }))}
                  />
                </div>
              </div>
            ) : null}

            <FilterBar meta={`${rows.length} corridas`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento o artista…"
                label="Buscar corrida"
                maxWidth={320}
              />
              <FieldCheck checked={onlyLoss} onChange={setOnlyLoss} label="Solo pérdida" />
            </FilterBar>

            <div className="panel">
              <div className="panel-head">
                <h2>Corridas · {entity}</h2>
              </div>
              <div className="panel-body">
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Evento</th>
                        <th>Status</th>
                        <th className="num">Ingresos</th>
                        <th className="num">Egresos</th>
                        <th className="num">Neto</th>
                        <th className="num">Margen</th>
                        <th>Corrida</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.eventId}>
                          <td>
                            <strong>{e.name}</strong>
                            <div className="muted kpi-sub">{e.artist || '—'}</div>
                          </td>
                          <td>
                            <StatusBadge value={e.status} kind="event" />
                          </td>
                          <td className="num">{money(e.income)}</td>
                          <td className="num">{money(e.expense)}</td>
                          <td className="num">
                            <strong>{money(e.net)}</strong>
                            {e.net < 0 ? (
                              <div className="kpi-sub">
                                <StatusBadge value="critical" kind="risk" />
                              </div>
                            ) : null}
                          </td>
                          <td className="num muted">
                            {e.marginPct == null ? '—' : `${e.marginPct}%`}
                          </td>
                          <td>
                            {e.title || '—'} {e.locked ? <span className="badge">LOCKED</span> : null}
                          </td>
                          <td>
                            <Link
                              className="btn ghost btn-sm"
                              href={`/events/${e.eventId}?tab=finance`}
                            >
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {!rows.length ? (
                        <tr>
                          <td colSpan={8}>
                            <EmptyState
                              title="Sin corridas para este filtro"
                              description="Abre un evento activo y captura ingresos/egresos en la pestaña Finanzas."
                              actionHref="/events?scope=active"
                              actionLabel="Ir a eventos activos"
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
