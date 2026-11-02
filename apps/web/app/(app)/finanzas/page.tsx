'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, Seg, Tile } from '@/components/ui/Lite';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { userHasPermission } from '@/lib/access-matrix';
import { api } from '@/lib/api';
import { moneyKpi } from '@/lib/format';
import { mxn } from '@/lib/price-list';
import { useUser } from '@/lib/user-context';

type OrderRow = {
  id: string;
  rubro: string;
  vendorName?: string | null;
  amount: number;
  status: string;
  paymentMethod: string;
  paymentLabel: string;
  authorizedAt?: string | null;
  paidAt?: string | null;
  requestedBy?: string | null;
  event: { id: string; name: string; entity: string; startsAt?: string | null };
  proofs: Array<{ id: string; fileUrl: string; label?: string | null }>;
  needsProof: boolean;
  adendum?: { person?: string | null; account?: string | null; fileUrl?: string | null; fileName?: string | null } | null;
};

type AdvanceRow = {
  id: string;
  label: string;
  amount: number;
  status: 'APPROVED' | 'PAID';
  event?: { id: string; name?: string | null } | null;
  requestedBy?: string | null;
  paidAt?: string | null;
  proofUrl?: string | null;
};

type EventRow = { id: string; name: string; entity: string; toPay: number; paid: number; total?: number };

type Summary = {
  period: { from: string; to: string };
  kpis: {
    toPay: { amount: number; count: number };
    transfers: { count: number };
    paid: { amount: number; count: number };
    pendingAuth: { amount: number; count: number };
    advancesToPay: { amount: number; count: number };
    missingProof: { count: number };
  };
  toPay: OrderRow[];
  paid: OrderRow[];
  adendums: OrderRow[];
  advances: AdvanceRow[];
  byEvent: EventRow[];
};

type View = 'pay' | 'paid' | 'adendum' | 'advances' | 'events';

function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstOfMonth() {
  const now = new Date();
  return isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
}

function dayLabel(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Finanzas: lo contable de los dos negocios. Lo lleva Paula y se lo rinde a Chacho y Arturo, así que
 * abre en lo que falta pagar y cada renglón lleva a su orden. La corrida no entra aquí.
 */
export default function FinanzasPage() {
  const { entity, user } = useUser();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [view, setView] = useState<View>('pay');
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  const allowed = userHasPermission(user?.roleKey || '', user?.permissions || [], ['finanzas.view', 'everything']);
  const query = `entity=${entity}&from=${from}&to=${to}`;

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api<Summary>(`/finanzas/resumen?${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar Finanzas');
    }
  }, [query]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const k = data?.kpis;

  return (
    <AppShell title="Finanzas">
      <div className="stack page-workspace">
        <PageHeader
          title="Finanzas"
          description="Pagos, transferencias, comprobantes y adendums de cada evento."
        >
          <div className="fx fin-range">
            <label className="fx-field">
              <span>Desde</span>
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label className="fx-field">
              <span>Hasta</span>
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
            <a className="btn ghost btn-sm" href={`/api/finanzas/pagos.csv?${query}`} download={`pagos-${from}-a-${to}.csv`}>
              Exportar pagos
            </a>
          </div>
        </PageHeader>

        {!allowed ? (
          <div className="surface">
            <EmptyLite icon="$" title="Finanzas no está a tu alcance" text="La ven Paula, Chacho y Arturo." />
          </div>
        ) : null}

        {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

        {allowed && !data && !error ? (
          <>
            <LoadingKpis />
            <LoadingBlock rows={5} label="Cargando Finanzas…" />
          </>
        ) : null}

        {allowed && data && k ? (
          <>
            <div className="tiles">
              <Tile
                label="Por pagar"
                value={moneyKpi(k.toPay.amount)}
                tone={k.toPay.count ? 'warn' : undefined}
                sub={k.toPay.count ? `${plural(k.toPay.count, 'orden', 'órdenes')} · ${k.transfers.count} piden comprobante` : 'Nada pendiente'}
                onClick={() => setView('pay')}
              />
              <Tile
                label="Pagado en el periodo"
                value={moneyKpi(k.paid.amount)}
                sub={plural(k.paid.count, 'orden', 'órdenes')}
                onClick={() => setView('paid')}
              />
              <Tile
                label="Esperando autorización"
                value={moneyKpi(k.pendingAuth.amount)}
                sub={plural(k.pendingAuth.count, 'orden', 'órdenes')}
              />
              <Tile
                label="Anticipos por pagar"
                value={moneyKpi(k.advancesToPay.amount)}
                sub={plural(k.advancesToPay.count, 'anticipo', 'anticipos')}
                onClick={() => setView('advances')}
              />
              <Tile
                label="Pagadas sin comprobante"
                value={k.missingProof.count}
                tone={k.missingProof.count ? 'warn' : undefined}
                sub={k.missingProof.count ? 'Falta subirlo' : 'Todo en orden'}
                onClick={k.missingProof.count ? () => setView('paid') : undefined}
              />
            </div>

            <Seg
              label="Vista de Finanzas"
              value={view}
              onChange={setView}
              options={[
                { key: 'pay', label: 'Por pagar', count: data.toPay.length },
                { key: 'paid', label: 'Pagado', count: data.paid.length },
                { key: 'adendum', label: 'Adendums', count: data.adendums.length },
                { key: 'advances', label: 'Anticipos', count: data.advances.length },
                { key: 'events', label: 'Por evento', count: data.byEvent.length },
              ]}
            />

            {view === 'pay' ? (
              <OrdersTable rows={data.toPay} empty="Nada por pagar." dateOf={(o) => o.authorizedAt} dateLabel="Autorizada" />
            ) : null}
            {view === 'paid' ? (
              <OrdersTable rows={data.paid} empty="Sin pagos en este periodo." dateOf={(o) => o.paidAt} dateLabel="Pagada" />
            ) : null}
            {view === 'adendum' ? <AdendumTable rows={data.adendums} /> : null}
            {view === 'advances' ? <AdvancesTable rows={data.advances} /> : null}
            {view === 'events' ? <EventsTable rows={data.byEvent} /> : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function OrdersTable({
  rows,
  empty,
  dateOf,
  dateLabel,
}: {
  rows: OrderRow[];
  empty: string;
  dateOf: (o: OrderRow) => string | null | undefined;
  dateLabel: string;
}) {
  if (!rows.length) {
    return (
      <div className="surface">
        <EmptyLite icon="$" title={empty} />
      </div>
    );
  }
  return (
    <div className="surface">
      <div className="dtable-wrap">
        <table className="dtable dtable--cards">
          <thead>
            <tr>
              <th>Orden</th>
              <th>Evento</th>
              <th>Forma de pago</th>
              <th>{dateLabel}</th>
              <th className="num">Monto</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="card-full">
                  <Link href={`/purchase-orders?po=${o.id}`}>
                    <strong>{o.vendorName || o.rubro}</strong>
                  </Link>
                  {o.requestedBy ? <span className="t-small muted"> · {o.requestedBy}</span> : null}
                </td>
                <td className="card-full" data-label="Evento">
                  <Link href={`/events/${o.event.id}`}>{o.event.name}</Link>
                </td>
                <td data-label="Forma de pago">{o.paymentLabel}</td>
                <td data-label={dateLabel}>{dayLabel(dateOf(o))}</td>
                <td data-label="Monto" className="num">
                  {mxn(o.amount)}
                </td>
                <td data-label="Comprobante">
                  {o.proofs.length ? (
                    <a className="btn-quiet" href={o.proofs[0].fileUrl} target="_blank" rel="noreferrer">
                      {o.proofs.length > 1 ? `Ver (${o.proofs.length})` : 'Ver'}
                    </a>
                  ) : o.needsProof ? (
                    <Pill tone="warn">Falta</Pill>
                  ) : (
                    <span className="t-small muted">No aplica</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdendumTable({ rows }: { rows: OrderRow[] }) {
  if (!rows.length) {
    return (
      <div className="surface">
        <EmptyLite icon="$" title="Sin adendums" />
      </div>
    );
  }
  return (
    <div className="surface">
      <div className="dtable-wrap">
        <table className="dtable dtable--cards">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Cuenta</th>
              <th>Evento</th>
              <th className="num">Monto</th>
              <th>Archivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="card-full">
                  <Link href={`/purchase-orders?po=${o.id}`}>
                    <strong>{o.adendum?.person || o.vendorName || '—'}</strong>
                  </Link>
                </td>
                <td data-label="Cuenta">{o.adendum?.account || '—'}</td>
                <td className="card-full" data-label="Evento">
                  <Link href={`/events/${o.event.id}`}>{o.event.name}</Link>
                </td>
                <td data-label="Monto" className="num">
                  {mxn(o.amount)}
                </td>
                <td data-label="Archivo">
                  {o.adendum?.fileUrl ? (
                    <a className="btn-quiet" href={o.adendum.fileUrl} target="_blank" rel="noreferrer">
                      {o.adendum.fileName || 'Ver archivo'}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdvancesTable({ rows }: { rows: AdvanceRow[] }) {
  if (!rows.length) {
    return (
      <div className="surface">
        <EmptyLite icon="$" title="Sin anticipos por pagar ni pagados en el periodo" />
      </div>
    );
  }
  return (
    <div className="surface">
      <div className="dtable-wrap">
        <table className="dtable dtable--cards">
          <thead>
            <tr>
              <th>Anticipo</th>
              <th>Evento</th>
              <th>Estado</th>
              <th className="num">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="card-full">
                  <Link href={`/advances?advance=${a.id}`}>
                    <strong>{a.label}</strong>
                  </Link>
                  {a.requestedBy ? <span className="t-small muted"> · {a.requestedBy}</span> : null}
                </td>
                <td className="card-full" data-label="Evento">{a.event?.name || '—'}</td>
                <td data-label="Estado">
                  <Pill tone={a.status === 'PAID' ? 'ok' : 'warn'}>
                    {a.status === 'PAID' ? `Pagado ${dayLabel(a.paidAt)}` : 'Por pagar'}
                  </Pill>
                </td>
                <td data-label="Monto" className="num">
                  {mxn(a.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsTable({ rows }: { rows: EventRow[] }) {
  if (!rows.length) {
    return (
      <div className="surface">
        <EmptyLite icon="$" title="Sin movimientos" />
      </div>
    );
  }
  return (
    <div className="surface">
      <div className="dtable-wrap">
        <table className="dtable dtable--cards">
          <thead>
            <tr>
              <th>Evento</th>
              <th className="num">Por pagar</th>
              <th className="num">Pagado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="card-full" data-label="Evento">
                  <Link href={`/events/${e.id}?tab=ocs`}>
                    <strong>{e.name}</strong>
                  </Link>
                </td>
                <td data-label="Por pagar" className="num">
                  {mxn(e.toPay)}
                </td>
                <td data-label="Pagado" className="num">
                  {mxn(e.paid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
