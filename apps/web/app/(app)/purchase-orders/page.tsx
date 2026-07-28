'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type PoLine = { concept: string; qty: number; unitPrice: number; total: number };

type PoAnalytics = {
  kpis: {
    total: number;
    pipeline: number;
    paid: number;
    authRate: number;
    avgAgingDays: number;
    agingOver7: number;
  };
  byStatus: Record<string, { count: number; amount: number }>;
  byRubro: Array<{ rubro: string; count: number; amount: number }>;
  agingBuckets: { d0_3: number; d4_7: number; d8_14: number; d15plus: number };
  agingQueue: Array<{
    id: string;
    eventId: string;
    eventName: string;
    rubro: string;
    vendorName?: string | null;
    status: string;
    amount: number;
    ageDays: number;
  }>;
  orders: Array<{
    id: string;
    eventId: string;
    eventName: string;
    rubro: string;
    vendorName?: string | null;
    status: string;
    amount: number;
    ageDays: number;
    createdBy?: string;
  }>;
};

export default function PurchaseOrdersPage() {
  const { entity } = useUser();
  const [data, setData] = useState<PoAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, PoLine[]>>({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    try {
      const analytics = await api<PoAnalytics>(`/analytics/purchase-orders?entity=${entity}`);
      setData(analytics);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [entity]);

  async function setStatus(id: string, status: string) {
    await api(`/purchase-orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function toggleExpand(id: string, eventId: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!lines[id]) {
      const pos = await api<Array<{ id: string; lines?: PoLine[] }>>(`/purchase-orders/event/${eventId}`);
      const found = pos.find((p) => p.id === id);
      setLines((prev) => ({ ...prev, [id]: found?.lines || [] }));
    }
  }

  const rows = useMemo(() => {
    let list = data?.orders || [];
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.eventName.toLowerCase().includes(n) ||
          r.rubro.toLowerCase().includes(n) ||
          (r.vendorName || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [data, statusFilter, q]);

  const k = data?.kpis;

  return (
    <AppShell title="Procurement · OC">
      <div className="stack page-workspace">
        <div className="page-intro">
          <div>
            <p className="muted">
              Control tower de compras: pipeline de cash, aging, tasa de autorización y cola
              prioritaria. Flujo: pendiente → autorizado → pagado.
            </p>
          </div>
        </div>

        {loading && !data ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={5} label="Cargando procurement…" />
          </>
        ) : null}

        {!loading && k ? (
          <div className="grid-cards kpi-grid-dense">
            <div className="kpi">
              <div className="label">OC totales</div>
              <div className="value">{k.total}</div>
            </div>
            <div className="kpi">
              <div className="label">Pipeline</div>
              <div className="value" style={{ fontSize: '1.25rem' }}>
                {money(k.pipeline)}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Pagado</div>
              <div className="value" style={{ fontSize: '1.25rem' }}>
                {money(k.paid)}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Auth rate</div>
              <div className="value">{k.authRate}%</div>
            </div>
            <div className="kpi">
              <div className="label">Aging medio</div>
              <div className="value">{k.avgAgingDays}d</div>
            </div>
            <div className={`kpi ${k.agingOver7 ? 'kpi--danger' : ''}`}>
              <div className="label">&gt;7 días abiertas</div>
              <div className="value">{k.agingOver7}</div>
            </div>
          </div>
        ) : null}

        {!loading && data ? (
          <div className="dash-split">
            <div className="panel">
              <div className="panel-head">
                <h2>Aging queue</h2>
              </div>
              <div className="panel-body">
                <DistBar
                  segments={[
                    { label: '0-3d', value: data.agingBuckets.d0_3, tone: 'ok' },
                    { label: '4-7d', value: data.agingBuckets.d4_7, tone: 'warn' },
                    { label: '8-14d', value: data.agingBuckets.d8_14, tone: 'danger' },
                    { label: '15d+', value: data.agingBuckets.d15plus, tone: 'danger' },
                  ]}
                />
                <ul className="compact-list" style={{ marginTop: 12 }}>
                  {data.agingQueue.slice(0, 6).map((o) => (
                    <li key={o.id}>
                      <span>
                        <strong>{o.eventName}</strong> · {o.rubro}
                      </span>
                      <span className="muted">
                        {o.ageDays}d · {money(o.amount)}
                      </span>
                    </li>
                  ))}
                  {!data.agingQueue.length ? <li className="muted">Cola limpia</li> : null}
                </ul>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h2>Por rubro</h2>
              </div>
              <div className="panel-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rubro</th>
                      <th>#</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRubro.slice(0, 8).map((r) => (
                      <tr key={r.rubro}>
                        <td>{r.rubro}</td>
                        <td>{r.count}</td>
                        <td>{money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && data ? (
          <>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="field"
            style={{ maxWidth: 280 }}
            placeholder="Buscar evento / vendor / rubro…"
            aria-label="Buscar evento, vendor o rubro"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="field"
            style={{ width: 'auto' }}
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING_AUTH">PENDING_AUTH</option>
            <option value="AUTHORIZED">AUTHORIZED</option>
            <option value="PAID">PAID</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>OC · {entity}</h2>
          </div>
          <div className="panel-body">
            {!rows.length ? (
              <EmptyState
                title={(data.orders?.length || 0) === 0 ? 'Sin órdenes de compra' : 'Sin OC en este filtro'}
                description={
                  (data.orders?.length || 0) === 0
                    ? 'Crea OC desde el detalle de un evento (pestaña OC).'
                    : 'Cambia status o limpia la búsqueda.'
                }
                actionHref="/events"
                actionLabel="Ir a eventos"
              />
            ) : (
            <div className="table-wrap">
              <table className="table table-sticky">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Rubro</th>
                    <th>Vendor</th>
                    <th className="num">Monto</th>
                    <th>Aging</th>
                    <th>Status</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((po) => (
                    <Fragment key={po.id}>
                      <tr>
                        <td>
                          <Link href={`/events/${po.eventId}?tab=ocs`}>{po.eventName}</Link>
                        </td>
                        <td>{po.rubro}</td>
                        <td>{po.vendorName || '—'}</td>
                        <td className="num">{money(po.amount)}</td>
                        <td>
                          <span className={`badge ${po.ageDays > 7 ? 'danger' : po.ageDays > 3 ? 'warn' : 'ok'}`}>
                            {po.ageDays}d
                          </span>
                        </td>
                        <td>
                          <span className="badge">{po.status}</span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn ghost" type="button" onClick={() => toggleExpand(po.id, po.eventId)}>
                              Partidas
                            </button>
                            {po.status === 'PENDING_AUTH' || po.status === 'DRAFT' ? (
                              <button className="btn ghost" type="button" onClick={() => setStatus(po.id, 'AUTHORIZED')}>
                                Autorizar
                              </button>
                            ) : null}
                            {po.status === 'AUTHORIZED' ? (
                              <button className="btn ghost" type="button" onClick={() => setStatus(po.id, 'PAID')}>
                                Pagado
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expanded === po.id ? (
                        <tr>
                          <td colSpan={7}>
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Concepto</th>
                                  <th>Qty</th>
                                  <th>P.unit</th>
                                  <th>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(lines[po.id] || []).map((l, i) => (
                                  <tr key={`${po.id}-${i}`}>
                                    <td>{l.concept}</td>
                                    <td>{l.qty}</td>
                                    <td>{money(Number(l.unitPrice))}</td>
                                    <td>{money(Number(l.total))}</td>
                                  </tr>
                                ))}
                                {!lines[po.id]?.length ? (
                                  <tr>
                                    <td colSpan={4} className="muted">
                                      Sin partidas
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
