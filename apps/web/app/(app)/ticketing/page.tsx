'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { userHasPermission } from '@/lib/access-matrix';
import { canEditTicketing } from '@arta/rbac';
import { boleteraDateLabel } from '@/lib/boletera';
import { moneyKpi, shortDate } from '@/lib/format';
import {
  boleteraSheet,
  downloadBoleteraPdf,
  type BoleteraPdfEvent,
  type BoleteraPdfSetup,
} from '@/lib/boletera-pdf';
import { useUser } from '@/lib/user-context';

type EventRow = BoleteraPdfEvent & {
  id: string;
  entity?: string;
  city?: string | null;
  promoter?: string | null;
};

type SetupRow = BoleteraPdfSetup & {
  id: string;
  updatedAt?: string;
  event: EventRow;
};

type Row = { event: EventRow; setup: SetupRow | null; capacity: number | null };

/** Fila de `GET /analytics/ticketing`: avance de ventas de una boletera. */
type SellThroughRow = {
  id: string;
  boletera: string;
  holdUntil?: string | null;
  holdExpired?: boolean;
  holdDays?: number | null;
  capacity: number;
  sold: number;
  sellThroughPct: number;
  potentialRevenue: number;
  realizedRevenue: number;
  event: { id: string; name: string; artist?: string | null; status?: string; startsAt?: string | null };
};

type SellThrough = {
  kpis: {
    setups: number;
    capacityTotal: number;
    soldTotal: number;
    sellThroughPct: number;
    potentialRevenue: number;
    realizedRevenue: number;
    holdRisk: number;
  };
  rows: SellThroughRow[];
};

/** Lo que contesta `POST /ticketing/sync`. */
type SyncResult = { updated: number; failed: number; total: number };

function startTime(e: { startsAt?: string | null }): number {
  const t = e.startsAt ? new Date(e.startsAt).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

const n = (v: number) => Math.round(v).toLocaleString('es-MX');

/** Píldora del apartado de la boletera: vencido, por vencer o la fecha. */
function HoldPill({ row }: { row: SellThroughRow }) {
  if (!row.holdUntil) return null;
  if (row.holdExpired) return <Pill tone="danger">Apartado vencido</Pill>;
  if (row.holdDays != null && row.holdDays <= 3) {
    return <Pill tone="review">{row.holdDays <= 0 ? 'Apartado vence hoy' : `Apartado vence en ${row.holdDays} ${row.holdDays === 1 ? 'día' : 'días'}`}</Pill>;
  }
  return <Pill tone="quiet">Apartado hasta {shortDate(row.holdUntil)}</Pill>;
}

export default function TicketingPage() {
  const { entity, user } = useUser();
  const canEdit = !!user && canEditTicketing(user, entity);
  // Sincronizar jala los vendidos de toda la organización: mismo permiso que el API (`ticketing.edit`).
  const canSync = !!user && userHasPermission(user.roleKey, user.permissions, ['ticketing.edit']);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [setups, setSetups] = useState<SetupRow[]>([]);
  const [sales, setSales] = useState<SellThrough | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; variant: 'success' | 'warn' | 'error' } | null>(null);
  const [q, setQ] = useState('');
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<EventRow[]>(`/events?entity=${entity}&scope=active`),
      api<SetupRow[]>('/ticketing'),
      // El avance de ventas es un extra: si falla, la lista sale igual.
      api<SellThrough>(`/analytics/ticketing?entity=${entity}`).catch(() => null),
    ])
      .then(([ev, st, an]) => {
        if (!alive) return;
        setEvents(ev);
        setSetups(st);
        setSales(an && Array.isArray(an.rows) ? an : null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar la boletera');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [entity]);

  /** Pide a las boleteras los vendidos de hoy y refresca la lista y el avance. */
  async function syncSold() {
    setSyncing(true);
    setNotice(null);
    try {
      const r = await api<SyncResult>('/ticketing/sync', { method: 'POST' });
      const text = !r.total
        ? 'No hay boleteras que sincronizar.'
        : `Vendidos al día · ${r.updated} ${r.updated === 1 ? 'boletera actualizada' : 'boleteras actualizadas'} de ${r.total}${r.failed > 0 ? ` · ${r.failed} sin respuesta` : ''}`;
      setNotice({ text, variant: r.failed ? 'warn' : 'success' });
      const [st, an] = await Promise.all([
        api<SetupRow[]>('/ticketing').catch(() => null),
        api<SellThrough>(`/analytics/ticketing?entity=${entity}`).catch(() => null),
      ]);
      if (st) setSetups(st);
      if (an && Array.isArray(an.rows)) setSales(an);
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'No se pudieron sincronizar los vendidos', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  // El avance de ventas sigue el orden de la lista: el show más próximo primero.
  const salesRows = useMemo(
    () =>
      sales
        ? [...sales.rows].sort((a, b) => {
            const ta = startTime(a.event);
            const tb = startTime(b.event);
            return ta === tb ? a.event.name.localeCompare(b.event.name) : ta < tb ? -1 : 1;
          })
        : [],
    [sales],
  );

  const rows = useMemo<Row[]>(() => {
    const latest = new Map<string, SetupRow>();
    for (const s of setups) {
      const prev = latest.get(s.event.id);
      if (!prev || (s.updatedAt || '') > (prev.updatedAt || '')) latest.set(s.event.id, s);
    }
    return [...events]
      .sort((a, b) => {
        const ta = startTime(a);
        const tb = startTime(b);
        return ta === tb ? a.name.localeCompare(b.name) : ta < tb ? -1 : 1;
      })
      .map((event) => {
        const setup = latest.get(event.id) ?? null;
        return { event, setup, capacity: setup ? boleteraSheet(setup, event).capacity : null };
      });
  }, [events, setups]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(
      (r) =>
        r.event.name.toLowerCase().includes(n) ||
        (r.event.venue || '').toLowerCase().includes(n) ||
        (r.setup?.boletera || '').toLowerCase().includes(n),
    );
  }, [rows, q]);

  async function pdf(setup: SetupRow, event: EventRow) {
    setPdfId(setup.id);
    try {
      await downloadBoleteraPdf({ setup, event });
    } catch {
      setError('No se pudo generar el PDF');
    } finally {
      setPdfId(null);
    }
  }

  return (
    <AppShell title="Boletera">
      <div className="sx-stack page-workspace bol">
        <PageHeader title="Creación de boletera" description="Eventos actuales y su documento para la boletera.">
          {rows.length > 6 ? (
            <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento…" label="Buscar evento" />
          ) : null}
          {canSync ? (
            <button className="btn ghost btn-sm" type="button" disabled={syncing || loading} onClick={() => void syncSold()}>
              {syncing ? 'Sincronizando…' : 'Sincronizar vendidos'}
            </button>
          ) : null}
        </PageHeader>

        {error ? (
          <p className="inline-note bol-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <FlashMessage variant={notice.variant} onDismiss={() => setNotice(null)}>
            {notice.text}
          </FlashMessage>
        ) : null}

        {sales && salesRows.length ? (
          <section className="surface bol-sales" aria-label="Avance de ventas">
            <div className="surface__head">
              <h3 className="surface__title">Avance de ventas</h3>
              <span className="t-muted t-small">
                {n(sales.kpis.soldTotal)} de {n(sales.kpis.capacityTotal)} boletos · {sales.kpis.sellThroughPct} % ·{' '}
                {moneyKpi(sales.kpis.realizedRevenue)} de {moneyKpi(sales.kpis.potentialRevenue)}
              </span>
            </div>
            <div className="dtable-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th className="num">Vendidos</th>
                    <th>Avance</th>
                    <th className="num">Ingreso</th>
                    <th>Apartado</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((r) => {
                    const pct = Math.max(0, Math.min(100, r.sellThroughPct || 0));
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link className="bol-list__event" href={`/events/${r.event.id}?tab=ticketing`}>
                            {r.event.name}
                          </Link>
                          <div className="t-muted t-small">{[r.boletera, r.event.artist].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="num">
                          {n(r.sold)} <span className="t-muted">/ {n(r.capacity)}</span>
                        </td>
                        <td>
                          <span className="bol-sales__row">
                            <span
                              className="meter bol-sales__meter"
                              role="progressbar"
                              aria-label={`${r.event.name}: ${r.sellThroughPct} % vendido`}
                              aria-valuenow={pct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <span style={{ width: `${pct}%` }} />
                            </span>
                            <span className="t-small">{r.sellThroughPct} %</span>
                          </span>
                        </td>
                        <td className="num">
                          {moneyKpi(r.realizedRevenue)}
                          <div className="t-muted t-small">de {moneyKpi(r.potentialRevenue)}</div>
                        </td>
                        <td>{r.holdUntil ? <HoldPill row={r} /> : <span className="t-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {loading ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
        ) : !rows.length ? (
          <div className="surface">
            <EmptyLite title="Sin eventos actuales" text="Cuando haya un show próximo aparece aquí.">
              <Link className="btn ghost btn-sm" href="/events">
                Ir a eventos
              </Link>
            </EmptyLite>
          </div>
        ) : !filtered.length ? (
          <div className="surface">
            <EmptyLite title="Sin coincidencias" />
          </div>
        ) : (
          <div className="dtable-wrap">
            <table className="dtable bol-list">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Boletera</th>
                  <th className="num">Capacidad</th>
                  <th className="col-act" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ event, setup, capacity }) => {
                  const href = `/events/${event.id}?tab=ticketing`;
                  const meta = [boleteraDateLabel(event.startsAt, event.endsAt), event.venue]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link className="bol-list__event" href={href}>
                          {event.name}
                        </Link>
                        {meta ? <div className="t-muted t-small">{meta}</div> : null}
                      </td>
                      <td>{setup ? setup.boletera : <span className="t-muted">Sin crear</span>}</td>
                      <td className="num">
                        {capacity !== null ? capacity.toLocaleString('es-MX') : <span className="t-muted">—</span>}
                      </td>
                      <td className="col-act">
                        <div className="bol-list__actions">
                          {setup ? (
                            <>
                              <button
                                className="btn-quiet"
                                type="button"
                                disabled={pdfId === setup.id}
                                onClick={() => void pdf(setup, event)}
                              >
                                {pdfId === setup.id ? 'Generando…' : 'PDF'}
                              </button>
                              <Link className="btn ghost btn-sm" href={href}>
                                Abrir
                              </Link>
                            </>
                          ) : canEdit ? (
                            <Link className="btn ghost btn-sm" href={href}>
                              Crear
                            </Link>
                          ) : (
                            <Link className="btn ghost btn-sm" href={href}>
                              Abrir
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
