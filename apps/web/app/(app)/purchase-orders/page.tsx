'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { EmptyLite, Pill, SectionHead, Seg, Tile } from '@/components/ui/Lite';
import { PayDaysNote } from '@/components/purchase-orders/PoWindowBanner';
import { PoDetail } from '@/components/events/EventPurchaseOrdersPanel';
import type { Po } from '@/components/events/event-detail.types';
import { api } from '@/lib/api';
import { mxn } from '@/lib/price-list';
import { payBlockedLabel, payDaysLabel, usePoWindow } from '@/lib/po-window';
import {
  poInSection,
  poIsPending,
  poNeedsProof,
  poSectionOptions,
  poSectionStats,
  poStatusPill,
  type PoSection,
} from '@/lib/po-payment';
import { poRubroLabel } from '@/lib/po-rubro';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

/** Fila de `GET /analytics/purchase-orders` → `orders[]`. */
type PoRow = {
  id: string;
  eventId: string;
  eventName: string;
  eventStatus?: string;
  rubro: string;
  vendorName?: string | null;
  paymentMethod?: string | null;
  payeeType?: string | null;
  withIva?: boolean | null;
  proofCount?: number;
  status: string;
  amount: number;
  ageDays: number;
  createdAt?: string;
  createdBy?: string | null;
};

type PoAnalytics = { orders?: PoRow[] };

const CLOSED_EVENT = new Set(['CLOSED', 'CANCELLED']);
/** Más de una semana esperando se marca, sin alarmar. */
const LATE_DAYS = 7;

const EMPTY_SECTION: Record<PoSection, string> = {
  auth: 'Nada por autorizar.',
  pay: 'Nada por pagar.',
  paid: 'Aún no hay órdenes pagadas.',
  all: 'Sin órdenes.',
};

const plural = (n: number) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`;

/**
 * Todas las órdenes de la entidad: qué falta autorizar, qué falta pagar y qué
 * ya salió. Revisión 11-09-2026 — sin gráficas ni seis KPIs: tres cifras, las
 * secciones y la tabla.
 */
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
  const win = usePoWindow();
  const blocked = payBlockedLabel(win);

  const [rows, setRows] = useState<PoRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [section, setSection] = useState<PoSection | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Po>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  async function load() {
    try {
      const data = await api<PoAnalytics>(`/analytics/purchase-orders?entity=${entity}`);
      setRows(data?.orders ?? []);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar las órdenes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setRows(null);
    setSection(null);
    setOpenId(null);
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const stats = useMemo(() => poSectionStats(rows ?? []), [rows]);
  const current: PoSection = section ?? (stats.auth.count > 0 ? 'auth' : 'all');

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => poInSection(r.status, current))
      .filter(
        (r) =>
          !n ||
          r.eventName.toLowerCase().includes(n) ||
          (r.vendorName || '').toLowerCase().includes(n) ||
          poRubroLabel(r.rubro).toLowerCase().includes(n),
      );
  }, [rows, current, q]);

  /** Trae las órdenes del evento (con partidas y comprobantes) y las guarda por id. */
  async function fetchEventOrders(eventId: string) {
    const list = await api<Po[]>(`/purchase-orders/event/${eventId}`);
    setDetails((prev) => {
      const next = { ...prev };
      for (const po of list) next[po.id] = po;
      return next;
    });
  }

  async function openDetail(row: PoRow) {
    setOpenId(row.id);
    if (details[row.id]) return;
    setLoadingDetail(row.id);
    try {
      await fetchEventOrders(row.eventId);
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'No se pudo abrir el detalle', tone: 'error' });
    } finally {
      setLoadingDetail(null);
    }
  }

  function toggle(row: PoRow) {
    if (openId === row.id) setOpenId(null);
    else openDetail(row).catch(console.error);
  }

  async function setStatus(row: PoRow, status: 'AUTHORIZED' | 'PAID') {
    setBusy(row.id);
    setNotice(null);
    try {
      await api(`/purchase-orders/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice({ text: status === 'PAID' ? 'Orden pagada' : 'Orden autorizada', tone: 'ok' });
      await Promise.all([
        load(),
        details[row.id] ? fetchEventOrders(row.eventId).catch(() => undefined) : Promise.resolve(),
      ]);
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'No se pudo actualizar la orden', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function refreshRow(row: PoRow) {
    await Promise.all([fetchEventOrders(row.eventId).catch(() => undefined), load()]);
  }

  async function downloadPdf(po: Po, row: PoRow) {
    setBusy(`pdf-${row.id}`);
    try {
      const { downloadPurchaseOrderPdf } = await import('@/lib/po-pdf');
      await downloadPurchaseOrderPdf({ po, event: { name: row.eventName }, payDaysLabel: payDaysLabel(win) });
    } catch (e) {
      console.error(e);
      setNotice({ text: 'No se pudo generar el PDF', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function action(row: PoRow) {
    if (row.eventStatus && CLOSED_EVENT.has(row.eventStatus)) return null;
    const rowBusy = busy === row.id;
    if (poIsPending(row.status) && canAuthorize) {
      return (
        <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => setStatus(row, 'AUTHORIZED')}>
          Autorizar
        </button>
      );
    }
    if (row.status === 'AUTHORIZED' && canMarkPaid) {
      const d = details[row.id];
      const method = d?.paymentMethod || row.paymentMethod || 'TRANSFERENCIA';
      const proofs = d?.proofs?.length ?? row.proofCount ?? 0;
      if (poNeedsProof(method) && proofs === 0) {
        return (
          <button type="button" className="btn btn-sm" onClick={() => openDetail(row)}>
            Comprobante
          </button>
        );
      }
      if (blocked) {
        return (
          <span className="oc-wait" title="Los pagos se registran solo en días de cobro">
            {blocked}
          </span>
        );
      }
      return (
        <button type="button" className="btn btn-sm" disabled={rowBusy} onClick={() => setStatus(row, 'PAID')}>
          Marcar pagada
        </button>
      );
    }
    return null;
  }

  return (
    <AppShell title="Órdenes de compra">
      <div className="sx-stack page-workspace oc-page">
        <SectionHead
          title="Pagos y autorizaciones"
          sub={win?.config.enabled ? <PayDaysNote state={win} /> : undefined}
        >
          {win?.canEdit ? (
            <Link className="btn-quiet" href="/settings">
              Configurar días
            </Link>
          ) : null}
        </SectionHead>

        {loading && !rows ? <LoadingBlock rows={5} label="Cargando órdenes…" /> : null}

        {loadError ? (
          <p className="oc-flash is-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {rows && !rows.length ? (
          <EmptyLite icon="$" title="Sin órdenes de compra" text="Se crean desde la pestaña OC de cada evento.">
            <Link className="btn ghost btn-sm" href="/events">
              Ir a eventos
            </Link>
          </EmptyLite>
        ) : null}

        {rows && rows.length ? (
          <>
            <div className="tiles">
              <Tile
                label="Por autorizar"
                value={stats.auth.count}
                sub={stats.auth.amount > 0 ? mxn(stats.auth.amount) : 'Nada pendiente'}
                onClick={() => setSection('auth')}
              />
              <Tile
                label="Por pagar"
                value={mxn(stats.pay.amount)}
                sub={plural(stats.pay.count)}
                tone="accent"
                onClick={() => setSection('pay')}
              />
              <Tile
                label="Pagadas"
                value={mxn(stats.paid.amount)}
                sub={plural(stats.paid.count)}
                onClick={() => setSection('paid')}
              />
            </div>

            <div className="oc-toolbar">
              <Seg
                label="Secciones de órdenes de compra"
                value={current}
                options={poSectionOptions(stats)}
                onChange={(k) => {
                  setSection(k);
                  setOpenId(null);
                }}
              />
              <input
                type="search"
                className="oc-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar evento, proveedor o rubro"
                aria-label="Buscar órdenes"
              />
            </div>

            {notice ? (
              <p className={`oc-flash ${notice.tone === 'error' ? 'is-error' : 'is-ok'}`} role="status">
                {notice.text}
              </p>
            ) : null}

            <div className="dtable-wrap">
              <table className="dtable oc-table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Proveedor</th>
                    <th className="num">Total</th>
                    <th className="num oc-hide-sm">Espera</th>
                    <th>Estado</th>
                    <th className="col-act">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const open = openId === row.id;
                    const pill = poStatusPill(row.status);
                    const waiting = poIsPending(row.status) || row.status === 'AUTHORIZED';
                    const detail = details[row.id];
                    const closedEvent = !!row.eventStatus && CLOSED_EVENT.has(row.eventStatus);
                    return (
                      <Fragment key={row.id}>
                        <tr className={`oc-row ${open ? 'is-open' : ''}`} onClick={() => toggle(row)}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <Link className="oc-event" href={`/events/${row.eventId}?tab=ocs`}>
                              {row.eventName}
                            </Link>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="oc-vendor"
                              aria-expanded={open}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(row);
                              }}
                            >
                              <span className="oc-vendor__name">{row.vendorName || 'Sin proveedor'}</span>
                              <span className="oc-vendor__sub">{poRubroLabel(row.rubro)}</span>
                            </button>
                          </td>
                          <td className="num t-money oc-amount">{mxn(row.amount)}</td>
                          <td className="num oc-hide-sm">
                            {waiting ? (
                              <span className={`oc-age ${row.ageDays > LATE_DAYS ? 'is-late' : ''}`}>
                                {row.ageDays} d
                              </span>
                            ) : (
                              <span className="t-muted">—</span>
                            )}
                          </td>
                          <td>
                            <Pill tone={pill.tone}>{pill.label}</Pill>
                          </td>
                          <td className="col-act" onClick={(e) => e.stopPropagation()}>
                            <div className="oc-actions">{action(row)}</div>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="oc-detail-row">
                            <td className="dtable__detail" colSpan={6}>
                              {detail ? (
                                <PoDetail
                                  po={detail}
                                  eventId={row.eventId}
                                  closed={closedEvent}
                                  onProofsChange={() => refreshRow(row)}
                                >
                                  <button
                                    type="button"
                                    className="btn-quiet"
                                    disabled={busy === `pdf-${row.id}`}
                                    onClick={() => downloadPdf(detail, row)}
                                  >
                                    PDF
                                  </button>
                                  <Link className="btn-quiet" href={`/events/${row.eventId}?tab=ocs`}>
                                    Abrir evento
                                  </Link>
                                </PoDetail>
                              ) : (
                                <p className="t-muted t-small oc-loading">
                                  {loadingDetail === row.id ? 'Cargando…' : 'No se pudo cargar el detalle.'}
                                </p>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!visible.length ? (
                    <tr>
                      <td colSpan={6} className="oc-empty-row">
                        {q.trim() ? 'Nada coincide con la búsqueda.' : EMPTY_SECTION[current]}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
