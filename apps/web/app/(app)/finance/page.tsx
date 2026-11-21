'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { money } from '@/components/charts/SparkBars';
import { FigureStrip } from '@/components/ui/FigureStrip';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { ActionLink, FieldCheck, FieldSearch, FilterBar, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { shortDate } from '@/lib/format';

type FinanceRow = {
  eventId: string;
  name: string;
  artist?: string | null;
  status: string;
  startsAt?: string | null;
  income: number;
  expense: number;
  net: number;
  marginPct: number | null;
  locked: boolean;
  title?: string | null;
  /** Pagado en órdenes de compra de este evento (un API viejo no lo manda). */
  poPaid?: number;
  poPaidCount?: number;
};

type FinanceAnalytics = {
  totals: {
    income: number;
    expense: number;
    net: number;
    locked: number;
    open: number;
    lossMaking: number;
    poPaid?: number;
    poWithoutExpense?: number;
  };
  byStatus: Record<string, { income: number; expense: number; net: number; count: number }>;
  ranking: FinanceRow[];
  rows: FinanceRow[];
  alerts: Array<{ severity: string; message: string }>;
};

/** El aviso «N eventos con neto negativo» del API (`analytics.service.ts`): es el mismo filtro «Solo pérdida». */
const LOSS_ALERT = /neto negativo/i;
/** El aviso de eventos que pagaron órdenes de compra sin egresos en su corrida: filtra justo esos. */
const PO_GAP_ALERT = /pag(ó|aron) órdenes de compra/i;

/** La pérdida se escribe «−$34,000», con el signo antes del peso. */
const signed = (v: number) => (v < 0 ? `−${money(Math.abs(v))}` : money(v));

const isPoGap = (r: FinanceRow) => (r.poPaid ?? 0) > 0 && r.expense === 0;

export default function FinancePage() {
  const { entity, user } = useUser();
  const [data, setData] = useState<FinanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyLoss, setOnlyLoss] = useState(false);
  const [onlyPoGap, setOnlyPoGap] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<FinanceAnalytics>(`/analytics/finance?entity=${entity}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity]);

  const canEdit = !!user && userHasPermission(user.roleKey, user.permissions, ['corrida.edit', 'everything']);

  const rows = useMemo(() => {
    let list = data?.ranking || [];
    if (onlyLoss) list = list.filter((r) => r.net < 0);
    if (onlyPoGap) list = list.filter(isPoGap);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(n) || (r.artist || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [data, q, onlyLoss, onlyPoGap]);

  const t = data?.totals;
  const filterActive = onlyLoss || onlyPoGap || !!q.trim();

  function clearFilters() {
    setOnlyLoss(false);
    setOnlyPoGap(false);
    setQ('');
  }

  /** La frase del encabezado: cómo va el dinero antes de leer la tabla. */
  const all = data?.ranking || [];
  const withData = all.filter((r) => r.income > 0 || r.expense > 0);
  const winning = withData.filter((r) => r.net >= 0).length;
  const losing = withData.filter((r) => r.net < 0).length;
  const gaps = all.filter(isPoGap).length;
  const lead = !data ? null : !withData.length ? (
    <>
      <strong>Todavía no hay corridas con datos.</strong> Se capturan en cada evento, en Dinero › Corrida.
    </>
  ) : (
    <>
      <strong>
        {winning} de {withData.length} {withData.length === 1 ? 'evento va' : 'eventos van'} con utilidad.
      </strong>
      {losing ? ` ${losing} ${losing === 1 ? 'va' : 'van'} en pérdida.` : ''}
      {gaps ? ` ${gaps} ${gaps === 1 ? 'pagó' : 'pagaron'} órdenes sin capturar egresos.` : ''}
      {canEdit ? '' : ' Solo lectura.'}
    </>
  );
  /** Las dos barras de cada renglón se miden contra la cifra más grande de la lista. */
  const barMax = Math.max(1, ...rows.map((r) => Math.max(r.income, r.expense)));
  const marginTotal = t && t.income > 0 ? Math.round((t.net / t.income) * 100) : null;
  const sum = rows.reduce(
    (acc, r) => ({ income: acc.income + r.income, expense: acc.expense + r.expense, net: acc.net + r.net }),
    { income: 0, expense: 0, net: 0 },
  );

  return (
    <AppShell title="Finanzas">
      <div className="stack page-workspace fin-page">
        <PageHeader title="Finanzas" lead={lead}>
          <ActionLink href="/events?scope=active" variant="ghost">
            Eventos activos
          </ActionLink>
        </PageHeader>

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Cargando corridas…" />
          </>
        ) : (
          <>
            {t ? (
              <FigureStrip
                label="Cifras de finanzas"
                items={[
                  {
                    label: 'Utilidad',
                    value: signed(t.net),
                    tone: t.net < 0 ? 'danger' : undefined,
                    sub: marginTotal == null ? 'Sin ingresos capturados' : `Margen de ${marginTotal} %`,
                  },
                  {
                    label: 'Ingresos',
                    value: money(t.income),
                    sub: `${t.open + t.locked} ${t.open + t.locked === 1 ? 'corrida' : 'corridas'} · ${t.locked} ${t.locked === 1 ? 'cerrada' : 'cerradas'}`,
                  },
                  {
                    label: 'Egresos',
                    value: money(t.expense),
                    sub: (
                      <Link href="/purchase-orders?seccion=paid">
                        {t.poPaid ? `Aparte, ${money(t.poPaid)} pagados en órdenes de compra` : 'Las órdenes de compra van aparte'}
                      </Link>
                    ),
                  },
                  {
                    label: 'En pérdida',
                    value: t.lossMaking,
                    tone: t.lossMaking ? 'danger' : undefined,
                    sub: onlyLoss ? 'Mostrando solo estos' : t.lossMaking ? 'Ver solo estos' : 'Ningún evento',
                    onClick: () => setOnlyLoss(!onlyLoss),
                    pressed: onlyLoss,
                  },
                ]}
              />
            ) : null}

            {data?.alerts?.length ? (
              <div className="alert-stack">
                {data.alerts.map((a) =>
                  LOSS_ALERT.test(a.message) ? null : PO_GAP_ALERT.test(a.message) ? (
                    <button
                      key={a.message}
                      type="button"
                      className={`ops-alert ops-alert--${a.severity} ops-alert--btn`}
                      aria-pressed={onlyPoGap}
                      onClick={() => setOnlyPoGap(!onlyPoGap)}
                    >
                      <span className="ops-alert__msg">{a.message}</span>
                      <span className="t-small muted">{onlyPoGap ? 'Quitar filtro' : 'Ver cuáles'}</span>
                    </button>
                  ) : (
                    <div key={a.message} className={`ops-alert ops-alert--${a.severity}`}>
                      <span className="ops-alert__msg">{a.message}</span>
                    </div>
                  ),
                )}
              </div>
            ) : null}

            {!all.length ? (
              <div className="surface">
                <EmptyState
                  title="Sin corridas"
                  description="Abre un evento y captura sus ingresos y egresos en Dinero › Corrida."
                  actionHref="/events?scope=active"
                  actionLabel="Ir a eventos activos"
                />
              </div>
            ) : (
              <>
            <FilterBar
              meta={
                <span className="fin-legend">
                  <span className="fin-legend__k is-in" aria-hidden /> Ingresos
                  <span className="fin-legend__k is-out" aria-hidden /> Egresos
                  <span className="fin-legend__n">{rows.length} {rows.length === 1 ? 'corrida' : 'corridas'}</span>
                </span>
              }
            >
              <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento o artista…" label="Buscar corrida" maxWidth={320} />
              <FieldCheck checked={onlyLoss} onChange={setOnlyLoss} label="Solo pérdida" />
            </FilterBar>

            <div className="dtable-wrap">
              <table className="dtable fin-table dtable--cards">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th className="num">Ingresos</th>
                    <th className="num">Egresos</th>
                    <th className="fin-hide-sm">Comparación</th>
                    <th className="num">Utilidad</th>
                    <th className="num fin-hide-sm">Margen</th>
                    <th className="col-act">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const has = e.income > 0 || e.expense > 0;
                    const loss = e.net < 0;
                    return (
                      <tr key={e.eventId}>
                        <td className="card-full">
                          <Link className="fin-table__name" href={`/events/${e.eventId}?tab=finance`}>
                            {e.name}
                          </Link>
                          <div className="t-muted t-small">
                            {[shortDate(e.startsAt), e.artist, e.locked ? 'Corrida cerrada' : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                          {isPoGap(e) ? (
                            <div className="fin-table__gap">
                              Pagó {money(e.poPaid ?? 0)} en órdenes de compra · Sin egresos en la corrida
                            </div>
                          ) : e.poPaid ? (
                            <div className="t-muted t-small">Órdenes pagadas: {money(e.poPaid)}</div>
                          ) : null}
                        </td>
                        <td className="num" data-label="Ingresos">{has ? money(e.income) : <span className="t-muted">—</span>}</td>
                        <td className="num" data-label="Egresos">{has ? money(e.expense) : <span className="t-muted">—</span>}</td>
                        <td className="fin-hide-sm">
                          {has ? (
                            <span
                              className="fin-bars"
                              role="img"
                              aria-label={`Ingresos ${money(e.income)}, egresos ${money(e.expense)}`}
                            >
                              <span className="fin-bars__in" style={{ width: `${Math.max(2, (e.income / barMax) * 100)}%` }} />
                              <span className="fin-bars__out" style={{ width: `${Math.max(2, (e.expense / barMax) * 100)}%` }} />
                            </span>
                          ) : (
                            <span className="t-muted t-small">Sin corrida capturada</span>
                          )}
                        </td>
                        <td className={`num fin-table__net ${loss ? 'is-loss' : ''}`} data-label="Utilidad">
                          {has ? signed(e.net) : <span className="t-muted">—</span>}
                        </td>
                        <td className={`num fin-hide-sm ${loss ? 'fin-table__loss' : 't-muted'}`}>
                          {e.marginPct == null ? '—' : `${String(e.marginPct).replace('-', '−')} %`}
                        </td>
                        <td className="col-act">
                          <Link className="btn ghost btn-sm" href={`/events/${e.eventId}?tab=finance`}>
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length > 1 ? (
                    <tr className="fin-table__total">
                      <td className="card-full">Total</td>
                      <td className="num" data-label="Ingresos">{money(sum.income)}</td>
                      <td className="num" data-label="Egresos">{money(sum.expense)}</td>
                      <td className="fin-hide-sm" />
                      <td className={`num ${sum.net < 0 ? 'is-loss' : ''}`} data-label="Utilidad">{signed(sum.net)}</td>
                      <td className="num fin-hide-sm">
                        {sum.income > 0 ? `${Math.round((sum.net / sum.income) * 100)} %` : '—'}
                      </td>
                      <td className="col-act card-empty" />
                    </tr>
                  ) : null}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7}>
                        {filterActive ? (
                          <EmptyState
                            title="Sin corridas para este filtro"
                            description="Ningún evento coincide con el filtro o la búsqueda."
                          >
                            <button type="button" className="btn ghost btn-sm" onClick={clearFilters}>
                              Quitar filtro
                            </button>
                          </EmptyState>
                        ) : (
                          <EmptyState
                            title="Sin corridas"
                            description="Abre un evento y captura sus ingresos y egresos en Dinero › Corrida."
                            actionHref="/events?scope=active"
                            actionLabel="Ir a eventos activos"
                          />
                        )}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
