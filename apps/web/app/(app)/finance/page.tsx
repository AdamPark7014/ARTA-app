'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
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
  const [q, setQ] = useState('');
  const [onlyLoss, setOnlyLoss] = useState(false);

  useEffect(() => {
    api<FinanceAnalytics>(`/analytics/finance?entity=${entity}`)
      .then(setData)
      .catch(console.error);
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
        <div className="page-intro">
          <div>
            <p className="muted">
              Control tower de corridas: margen portfolio, pérdidas y estado de cierre.
              {canEdit ? ' Tienes permiso de edición.' : ' Acceso de lectura / seguimiento.'}
            </p>
          </div>
          <Link className="btn ghost" href="/dashboard">
            Centro de comando
          </Link>
        </div>

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
              <div className="value" style={{ fontSize: '1.35rem' }}>
                {money(t.income)}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Egresos</div>
              <div className="value" style={{ fontSize: '1.35rem' }}>
                {money(t.expense)}
              </div>
            </div>
            <div className={`kpi ${t.net < 0 ? 'kpi--danger' : ''}`}>
              <div className="label">Neto portfolio</div>
              <div
                className="value"
                style={{ fontSize: '1.35rem', color: t.net >= 0 ? 'var(--ok)' : 'var(--danger)' }}
              >
                {money(t.net)}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Corridas locked</div>
              <div className="value">{t.locked}</div>
            </div>
            <div className="kpi">
              <div className="label">Abiertas c/movimiento</div>
              <div className="value">{t.open}</div>
            </div>
            <div className={`kpi ${t.lossMaking ? 'kpi--danger' : ''}`}>
              <div className="label">Neto negativo</div>
              <div className="value">{t.lossMaking}</div>
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="panel">
            <div className="panel-body">
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Neto por status de evento
              </div>
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

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="field"
            style={{ maxWidth: 320 }}
            placeholder="Buscar evento…"
            aria-label="Buscar evento"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={onlyLoss} onChange={(e) => setOnlyLoss(e.target.checked)} />
            Solo pérdida
          </label>
        </div>

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
                        <div className="muted" style={{ fontSize: 12 }}>
                          {e.artist || '—'}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${e.status === 'ACTIVE' ? 'ok' : 'warn'}`}>{e.status}</span>
                      </td>
                      <td className="num">{money(e.income)}</td>
                      <td className="num">{money(e.expense)}</td>
                      <td className="num" style={{ color: e.net >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                        {money(e.net)}
                      </td>
                      <td className="num muted">
                        {e.marginPct == null ? '—' : `${e.marginPct}%`}
                      </td>
                      <td>
                        {e.title || '—'} {e.locked ? <span className="badge">LOCKED</span> : null}
                      </td>
                      <td>
                        <Link className="btn ghost" href={`/events/${e.eventId}?tab=finance`}>
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
                          description="Abre un evento y captura ingresos/egresos en la pestaña Finanzas."
                          actionHref="/events"
                          actionLabel="Ir a eventos"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
