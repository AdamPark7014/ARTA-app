'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar, money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldSearch,
  FieldSelect,
  FilterBar,
  PageHeader,
} from '@/components/ui/PageChrome';
import { PoWindowBanner } from '@/components/purchase-orders/PoWindowBanner';
import { PoProofsBlock } from '@/components/purchase-orders/PoProofsBlock';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

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

function poStatusKind(status: string): 'po' | 'raw' {
  return status === 'AUTHORIZED' || status === 'PAID' || status === 'REJECTED' ? 'po' : 'raw';
}

export default function PurchaseOrdersPage() {
  const { entity, user } = useUser();
  const canAuthorize = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'po.authorize',
    'everything',
  ]);
  const canMarkPaid = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'po.mark_paid',
    'everything',
  ]);
  const [data, setData] = useState<PoAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, PoLine[]>>({});
  const [proofs, setProofs] = useState<
    Record<string, Array<{ id: string; fileUrl: string; label?: string | null; amount?: number }>>
  >({});
  const [poDetails, setPoDetails] = useState<Record<string, { amount: number; status: string }>>({});
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
    if (!lines[id] || !proofs[id]) {
      const pos = await api<
        Array<{
          id: string;
          amount: number;
          status: string;
          lines?: PoLine[];
          proofs?: Array<{ id: string; fileUrl: string; label?: string | null; amount?: number }>;
        }>
      >(`/purchase-orders/event/${eventId}`);
      const found = pos.find((p) => p.id === id);
      setLines((prev) => ({ ...prev, [id]: found?.lines || [] }));
      setProofs((prev) => ({ ...prev, [id]: found?.proofs || [] }));
      if (found) {
        setPoDetails((prev) => ({ ...prev, [id]: { amount: Number(found.amount), status: found.status } }));
      }
    }
  }

  async function reloadPoDetails(poId: string, eventId: string) {
    const pos = await api<
      Array<{
        id: string;
        amount: number;
        status: string;
        proofs?: Array<{ id: string; fileUrl: string; label?: string | null; amount?: number }>;
      }>
    >(`/purchase-orders/event/${eventId}`);
    const found = pos.find((p) => p.id === poId);
    if (found) {
      setProofs((prev) => ({ ...prev, [poId]: found.proofs || [] }));
      setPoDetails((prev) => ({ ...prev, [poId]: { amount: Number(found.amount), status: found.status } }));
    }
    await load();
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
    <AppShell title="Órdenes de compra">
      <div className="stack page-workspace">
        <PageHeader
          description="Control tower de compras: pipeline de cash, aging, tasa de autorización y cola prioritaria."
          hint="Flujo recomendado: borrador → pendiente de autorización → autorizada → pagada. Prioriza OC con más de 7 días abiertas."
        >
          <ActionLink href="/events" variant="ghost">
            Ir a eventos
          </ActionLink>
          <ActionLink href="/settings" variant="ghost">
            Configurar ventana
          </ActionLink>
        </PageHeader>

        <PoWindowBanner />

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
              <div className="kpi-sub muted">En la entidad activa</div>
            </div>
            <div className="kpi">
              <div className="label">Pipeline</div>
              <div className="value value--money">{money(k.pipeline)}</div>
              <div className="kpi-sub muted">Pendiente de pago</div>
            </div>
            <div className="kpi">
              <div className="label">Pagado</div>
              <div className="value value--money">{money(k.paid)}</div>
              <div className="kpi-sub muted">Cash ejecutado</div>
            </div>
            <div className="kpi">
              <div className="label">Auth rate</div>
              <div className="value">{k.authRate}%</div>
              <div className="kpi-sub muted">Tasa de autorización</div>
            </div>
            <div className="kpi">
              <div className="label">Aging medio</div>
              <div className="value">{k.avgAgingDays}d</div>
              <div className="kpi-sub muted">Días abiertas en promedio</div>
            </div>
            <div className={`kpi ${k.agingOver7 ? 'kpi--danger' : ''}`}>
              <div className="label">&gt;7 días abiertas</div>
              <div className="value">{k.agingOver7}</div>
              <div className="kpi-sub muted">Requieren seguimiento</div>
            </div>
          </div>
        ) : null}

        {!loading && data ? (
          <div className="dash-split">
            <div className="panel">
              <div className="panel-head">
                <h2>Cola de aging</h2>
              </div>
              <div className="panel-body stack">
                <DistBar
                  segments={[
                    { label: '0-3d', value: data.agingBuckets.d0_3, tone: 'ok' },
                    { label: '4-7d', value: data.agingBuckets.d4_7, tone: 'warn' },
                    { label: '8-14d', value: data.agingBuckets.d8_14, tone: 'danger' },
                    { label: '15d+', value: data.agingBuckets.d15plus, tone: 'danger' },
                  ]}
                />
                <ul className="compact-list">
                  {data.agingQueue.slice(0, 6).map((o) => (
                    <li key={o.id}>
                      <span>
                        <strong>{o.eventName}</strong> · {o.rubro}
                      </span>
                      <span className="muted kpi-sub">
                        {o.ageDays}d · {money(o.amount)}
                      </span>
                    </li>
                  ))}
                  {!data.agingQueue.length ? (
                    <li className="muted kpi-sub">Cola limpia — sin OC estancadas</li>
                  ) : null}
                </ul>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h2>Por rubro</h2>
              </div>
              <div className="panel-body">
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Rubro</th>
                        <th>#</th>
                        <th className="num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byRubro.slice(0, 8).map((r) => (
                        <tr key={r.rubro}>
                          <td>{r.rubro}</td>
                          <td>{r.count}</td>
                          <td className="num">{money(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && data ? (
          <>
            <FilterBar meta={`${rows.length} órdenes`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento, vendor, rubro…"
                label="Buscar OC"
                maxWidth={280}
              />
              <FieldSelect
                value={statusFilter}
                onChange={setStatusFilter}
                label="Filtrar por estado"
                options={[
                  { value: 'all', label: 'Todos los estados' },
                  { value: 'DRAFT', label: 'Borrador' },
                  { value: 'PENDING_AUTH', label: 'Pend. autorización' },
                  { value: 'AUTHORIZED', label: 'Autorizada' },
                  { value: 'PAID', label: 'Pagada' },
                  { value: 'REJECTED', label: 'Rechazada' },
                ]}
              />
            </FilterBar>

            <div className="panel">
              <div className="panel-head">
                <h2>OC · {entity}</h2>
              </div>
              <div className="panel-body">
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
                              <Link href={`/events/${po.eventId}?tab=ocs`}>
                                <strong>{po.eventName}</strong>
                              </Link>
                            </td>
                            <td>{po.rubro}</td>
                            <td>{po.vendorName || '—'}</td>
                            <td className="num">{money(po.amount)}</td>
                            <td>
                              <span
                                className={`badge ${
                                  po.ageDays > 7 ? 'danger' : po.ageDays > 3 ? 'warn' : 'ok'
                                }`}
                              >
                                {po.ageDays}d
                              </span>
                            </td>
                            <td>
                              <StatusBadge value={po.status} kind={poStatusKind(po.status)} />
                            </td>
                            <td>
                              <div className="row row--tight">
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  onClick={() => toggleExpand(po.id, po.eventId)}
                                >
                                  Partidas
                                </button>
                                {canAuthorize &&
                                (po.status === 'PENDING_AUTH' || po.status === 'DRAFT') ? (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => setStatus(po.id, 'AUTHORIZED')}
                                  >
                                    Autorizar
                                  </button>
                                ) : null}
                                {canMarkPaid && po.status === 'AUTHORIZED' ? (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => setStatus(po.id, 'PAID')}
                                  >
                                    Pagado
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {expanded === po.id ? (
                            <tr>
                              <td colSpan={7}>
                                <div className="table-wrap">
                                  <table className="table">
                                    <thead>
                                      <tr>
                                        <th>Concepto</th>
                                        <th>Qty</th>
                                        <th className="num">P.unit</th>
                                        <th className="num">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(lines[po.id] || []).map((l, i) => (
                                        <tr key={`${po.id}-${i}`}>
                                          <td>{l.concept}</td>
                                          <td>{l.qty}</td>
                                          <td className="num">{money(Number(l.unitPrice))}</td>
                                          <td className="num">{money(Number(l.total))}</td>
                                        </tr>
                                      ))}
                                      {!lines[po.id]?.length ? (
                                        <tr>
                                          <td colSpan={4} className="muted kpi-sub">
                                            Sin partidas cargadas
                                          </td>
                                        </tr>
                                      ) : null}
                                    </tbody>
                                  </table>
                                </div>
                                {(po.status === 'AUTHORIZED' ||
                                  po.status === 'PAID' ||
                                  (proofs[po.id]?.length ?? 0) > 0) ? (
                                  <PoProofsBlock
                                    poId={po.id}
                                    eventId={po.eventId}
                                    poAmount={poDetails[po.id]?.amount ?? po.amount}
                                    proofs={proofs[po.id]}
                                    canUpload={po.status === 'AUTHORIZED'}
                                    onChange={() => reloadPoDetails(po.id, po.eventId)}
                                  />
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                      {!rows.length ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              title={
                                (data.orders?.length || 0) === 0
                                  ? 'Sin órdenes de compra'
                                  : 'Sin OC en este filtro'
                              }
                              description={
                                (data.orders?.length || 0) === 0
                                  ? 'Crea OC desde el detalle de un evento (pestaña OC).'
                                  : 'Cambia el estado o limpia la búsqueda para ver más resultados.'
                              }
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
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
