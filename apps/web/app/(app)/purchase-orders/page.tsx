'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventRow = { id: string; name: string; entity: string };
type PoLine = { concept: string; qty: number; unitPrice: number; total: number };
type Po = {
  id: string;
  rubro: string;
  vendorName?: string | null;
  amount: string | number;
  status: string;
  eventId: string;
  lines?: PoLine[];
};

export default function PurchaseOrdersPage() {
  const { entity } = useUser();
  const [rows, setRows] = useState<Array<Po & { eventName: string }>>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const events = await api<EventRow[]>(`/events?entity=${entity}`);
    const all: Array<Po & { eventName: string }> = [];
    for (const ev of events.slice(0, 30)) {
      const pos = await api<Po[]>(`/purchase-orders/event/${ev.id}`);
      for (const p of pos) all.push({ ...p, eventName: ev.name, eventId: ev.id });
    }
    setRows(all);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [entity]);

  async function setStatus(id: string, status: string) {
    await api(`/purchase-orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <AppShell title="Órdenes de compra">
      <div className="stack">
        <p className="muted">
          Flujo: pendiente → autorizo (Melissa Arta / Rodrigo Auditorio) → pagado. Partidas en el detalle.
        </p>
        <div className="panel">
          <div className="panel-head">
            <h2>OC · {entity}</h2>
          </div>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Rubro</th>
                  <th>Vendor</th>
                  <th>Partidas</th>
                  <th>Monto</th>
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
                      <td>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                        >
                          {po.lines?.length || 0}
                        </button>
                      </td>
                      <td>${Number(po.amount).toLocaleString('es-MX')}</td>
                      <td>
                        <span className={`badge ${po.status === 'PAID' ? 'ok' : 'warn'}`}>{po.status}</span>
                      </td>
                      <td className="row">
                        {po.status === 'PENDING_AUTH' ? (
                          <button className="btn ghost" type="button" onClick={() => setStatus(po.id, 'AUTHORIZED')}>
                            Autorizar
                          </button>
                        ) : null}
                        {po.status === 'AUTHORIZED' ? (
                          <button className="btn ghost" type="button" onClick={() => setStatus(po.id, 'PAID')}>
                            Pagado
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === po.id && po.lines?.length ? (
                      <tr>
                        <td colSpan={7}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Concepto</th>
                                <th>Cant.</th>
                                <th>P. unit.</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.lines.map((l, i) => (
                                <tr key={i}>
                                  <td>{l.concept}</td>
                                  <td>{Number(l.qty)}</td>
                                  <td>${Number(l.unitPrice).toLocaleString('es-MX')}</td>
                                  <td>${Number(l.total).toLocaleString('es-MX')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sin órdenes aún. Créalas desde el evento.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
