'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { FlashMessage } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { canAccessEventOps, userHasPermission, visibleNavItems } from '@/lib/access-matrix';
import { mxn } from '@/lib/price-list';
import { useUser } from '@/lib/user-context';

/** Lo que el inicio usa de `/analytics/overview` (la API trae más; aquí no se inventa nada). */
type Overview = {
  kpis: {
    eventsActive: number;
    upcoming14d: number;
    avgOpsProgress: number;
    pendingAuthorized: number;
    openTasks: number;
    overdueTasks: number;
    poPipelineAmount: number;
    poAgingOver7: number;
  };
  atRisk: Array<{ id: string; name: string; avgProgress: number; risk: string; daysToShow: number | null }>;
  upcoming: Array<{ id: string; name: string; artist?: string | null; startsAt: string; avgProgress: number }>;
  /** Activos y borradores con su fecha: de aquí salen los shows de hoy que ya empezaron. */
  eventHealth?: Array<{
    id: string;
    name: string;
    artist?: string | null;
    startsAt: string | null;
    avgProgress: number;
  }>;
  alerts: Array<{ severity: string; code: string; message: string; href?: string }>;
};

type DayEvent = { id: string; name: string; artist?: string | null; startsAt: string; avgProgress: number };

/** Avisos que el inicio ya muestra como fila propia (OC, formatos, tareas, eventos en riesgo). */
const COVERED_ALERTS = new Set(['EVENT_RISK', 'PO_AGING', 'SIG_BACKLOG', 'TASK_OVERDUE']);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysUntil(iso: string, now: Date) {
  return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 86400000);
}

function daysLabel(days: number) {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days < 0) return 'Ya pasó';
  return `En ${days} días`;
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function longDate(now: Date) {
  const weekday = now.toLocaleDateString('es-MX', { weekday: 'long' });
  const month = now.toLocaleDateString('es-MX', { month: 'long' });
  return `${weekday} ${now.getDate()} de ${month}`;
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** Fila de «Esperan tu visto bueno»: monto (o «—») y estado lleno / borde. */
function ApprovalRow({
  title,
  sub,
  amount,
  status,
  tone,
  href,
}: {
  title: string;
  sub?: string;
  amount?: string;
  status: string;
  /** `fill` = requiere acción; `line` = informativo. */
  tone: 'fill' | 'line';
  href?: string;
}) {
  const body = (
    <>
      <span className="ap-row__main">
        <span className="ap-row__title">{title}</span>
        {sub ? <small className="ap-row__sub">{sub}</small> : null}
      </span>
      <span className="ap-row__amount t-num">{amount ?? ''}</span>
      <span className={`state state--${tone}`}>{status}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link className="ap-row" href={href}>
          {body}
        </Link>
      ) : (
        <div className="ap-row">{body}</div>
      )}
    </li>
  );
}

/**
 * Inicio (SISTEMA-VISUAL): saludo con la fecha, cuatro cifras, «Hoy» como línea
 * de tiempo y lo que espera tu visto bueno. Todo sale de `/analytics/overview`,
 * la misma llamada de siempre; si no hay dato, la pieza no se dibuja.
 */
export default function DashboardPage() {
  const { entity, user } = useUser();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const role = user?.roleKey || '';
  const perms = user?.permissions || [];
  const eventOps = canAccessEventOps(role, entity);
  const canCreate = eventOps && userHasPermission(role, perms, ['event.create', 'everything']);
  const canSeePo = userHasPermission(role, perms, ['po.authorize', 'po.mark_paid', 'everything']);
  const canSeeTasks = useMemo(
    () => (user ? visibleNavItems(user, entity).some((item) => item.href === '/tasks') : false),
    [user, entity],
  );

  useEffect(() => {
    if (!eventOps) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Overview>(`/analytics/overview?entity=${entity}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el inicio'))
      .finally(() => setLoading(false));
  }, [entity, eventOps]);

  const now = useMemo(() => new Date(), []);
  const firstName = user?.fullName?.split(' ')[0] || 'equipo';

  const agenda = useMemo(() => {
    if (!data) return { today: [] as DayEvent[], next: [] as DayEvent[] };
    const seen = new Set<string>();
    const all: DayEvent[] = [];
    for (const e of [...data.upcoming, ...(data.eventHealth ?? [])]) {
      if (!e.startsAt || seen.has(e.id)) continue;
      seen.add(e.id);
      all.push({ id: e.id, name: e.name, artist: e.artist, startsAt: e.startsAt, avgProgress: e.avgProgress });
    }
    const byTime = (a: DayEvent, b: DayEvent) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    const today = all.filter((e) => daysUntil(e.startsAt, now) === 0).sort(byTime);
    const todayIds = new Set(today.map((e) => e.id));
    // «Próximos» respeta la ventana de 14 días que ya calcula la API.
    const next = data.upcoming
      .filter((e) => !todayIds.has(e.id) && daysUntil(e.startsAt, now) > 0)
      .map((e) => ({ id: e.id, name: e.name, artist: e.artist, startsAt: e.startsAt, avgProgress: e.avgProgress }))
      .sort(byTime)
      .slice(0, 5);
    return { today, next };
  }, [data, now]);

  const k = data?.kpis;
  const riskIds = new Set((data?.atRisk ?? []).map((e) => `/events/${e.id}`));
  const otherAlerts = (data?.alerts ?? []).filter(
    (a) => !COVERED_ALERTS.has(a.code) && !(a.href && riskIds.has(a.href)),
  );
  const approvals = k
    ? [
        canSeePo && k.poPipelineAmount > 0
          ? {
              key: 'po',
              title: 'Órdenes de compra',
              sub: k.poAgingOver7 ? `${k.poAgingOver7} con más de 7 días` : 'Por autorizar o pagar',
              amount: mxn(k.poPipelineAmount),
              status: 'Revisar',
              tone: 'fill' as const,
              href: '/purchase-orders',
            }
          : null,
        k.pendingAuthorized > 0
          ? {
              key: 'formats',
              title: 'Formatos entregados',
              sub: `${k.pendingAuthorized} por autorizar`,
              status: 'Autorizar',
              tone: 'fill' as const,
              href: '/events?scope=active',
            }
          : null,
        canSeeTasks && k.overdueTasks > 0
          ? {
              key: 'tasks',
              title: 'Tareas vencidas',
              sub: `de ${k.openTasks} abiertas`,
              status: 'Atender',
              tone: 'fill' as const,
              href: '/tasks',
            }
          : null,
      ].filter(<T,>(x: T | null): x is T => x !== null)
    : [];
  const hasRisks = !!data && (data.atRisk.length > 0 || otherAlerts.length > 0);
  const singleToday = agenda.today.length === 1 ? agenda.today[0] : null;

  return (
    <AppShell title="Inicio">
      <div className="page-workspace home">
        <header className="home-hero">
          <div className="home-hero__copy">
            <p className="cap home-hero__date">{longDate(now)}</p>
            <h2 className="home-hero__hello">
              {greeting(now)}, <b>{firstName}</b>
            </h2>
          </div>
          {canSeeTasks || canCreate ? (
            <div className="home-hero__actions">
              {canSeeTasks ? (
                <Link className="btn ghost" href="/tasks">
                  Nueva tarea
                </Link>
              ) : null}
              {canCreate ? (
                <Link className="btn" href="/events/new">
                  {entity === 'EXPLANADA' ? 'Nuevo show' : 'Nuevo evento'}
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>

        {!eventOps ? (
          <section className="surface">
            <EmptyLite
              icon="▤"
              title="Tus carpetas"
              text={
                role === 'solo_carpetas'
                  ? 'Tu acceso es a las carpetas generales de Arta y del Auditorio.'
                  : 'En esta entidad tu acceso es a las carpetas generales.'
              }
            >
              <Link className="btn btn-sm" href="/folders">
                Abrir carpetas
              </Link>
            </EmptyLite>
          </section>
        ) : loading ? (
          <div className="home-skeleton" aria-busy="true" aria-label="Cargando el inicio">
            <div className="kpi-row">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="kpi-card">
                  <div className="skeleton skeleton--label" />
                  <div className="skeleton skeleton--value" style={{ height: 30 }} />
                  <div className="skeleton skeleton--row" style={{ width: '60%', height: 10 }} />
                </div>
              ))}
            </div>
            <div className="home-panels">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="home-panel">
                  <div className="skeleton skeleton--label" style={{ width: '40%' }} />
                  <div className="skeleton-stack">
                    <div className="skeleton skeleton--row" style={{ width: '86%' }} />
                    <div className="skeleton skeleton--row" style={{ width: '72%' }} />
                    <div className="skeleton skeleton--row" style={{ width: '64%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <FlashMessage variant="error">{error}</FlashMessage>
        ) : data && k ? (
          <>
            <div className="kpi-row">
              <Link className="kpi-card" href="/events">
                <span className="cap">Eventos activos</span>
                <span className="kpi-card__value t-num">{k.eventsActive}</span>
                <span className="kpi-card__detail">
                  {k.upcoming14d === 1 ? '1 en los próximos 14 días' : `${k.upcoming14d} en los próximos 14 días`}
                </span>
              </Link>
              {canSeePo ? (
                <Link className="kpi-card" href="/purchase-orders">
                  <span className="cap">Por pagar</span>
                  <span className="kpi-card__value t-num">{mxn(k.poPipelineAmount)}</span>
                  <span className="kpi-card__detail">
                    {k.poAgingOver7 ? `${k.poAgingOver7} con más de 7 días` : 'Órdenes de compra'}
                  </span>
                </Link>
              ) : null}
              {canSeeTasks ? (
                <Link className="kpi-card" href="/tasks">
                  <span className="cap">Tareas abiertas</span>
                  <span className="kpi-card__value t-num">{k.openTasks}</span>
                  <span className="kpi-card__detail">
                    {k.overdueTasks ? `${k.overdueTasks} vencidas` : 'Al día'}
                  </span>
                </Link>
              ) : (
                <div className="kpi-card">
                  <span className="cap">Tareas abiertas</span>
                  <span className="kpi-card__value t-num">{k.openTasks}</span>
                  <span className="kpi-card__detail">
                    {k.overdueTasks ? `${k.overdueTasks} vencidas` : 'Al día'}
                  </span>
                </div>
              )}
              <div className="kpi-card">
                <span className="cap">Formatos al día</span>
                <span className="kpi-card__value t-num">{k.avgOpsProgress}%</span>
                <span
                  className="kpi-card__bar"
                  role="progressbar"
                  aria-label="Avance general de formatos"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={k.avgOpsProgress}
                >
                  <i style={{ width: `${Math.max(0, Math.min(100, k.avgOpsProgress))}%` }} />
                </span>
                <span className="kpi-card__detail">
                  {k.pendingAuthorized ? `${k.pendingAuthorized} por autorizar` : 'Avance general'}
                </span>
              </div>
            </div>

            <div className="home-panels">
              <section className="home-panel" aria-labelledby="home-today">
                <div className="home-panel__head">
                  <h3 id="home-today">{singleToday ? `Hoy · ${singleToday.name}` : 'Hoy'}</h3>
                  <Link className="home-panel__link" href="/events">
                    Ver eventos
                  </Link>
                </div>

                {agenda.today.length ? (
                  <ol className="tl">
                    {agenda.today.map((e) => {
                      const started = new Date(e.startsAt).getTime() <= now.getTime();
                      return (
                        <li key={e.id}>
                          <Link className="tl__row" href={`/events/${e.id}`}>
                            <span className="tl__time t-num">{hhmm(e.startsAt)}</span>
                            <span className={`tl__dot ${started ? 'is-on' : ''}`} aria-hidden />
                            <span className="tl__body">
                              <span className="tl__title">{singleToday ? 'Show' : e.name}</span>
                              <small>
                                {e.artist ? `${e.artist} · ` : ''}
                                {e.avgProgress}% de formatos
                              </small>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : agenda.next[0] ? (
                  <p className="home-calm">
                    <span>Sin shows hoy.</span>
                    <small>
                      El próximo es {agenda.next[0].name}, {daysLabel(daysUntil(agenda.next[0].startsAt, now)).toLowerCase()}.
                    </small>
                  </p>
                ) : (
                  <EmptyLite icon="◷" title="Sin shows hoy" text="Tampoco hay shows en los próximos 14 días.">
                    {canCreate ? (
                      <Link className="btn btn-sm" href="/events/new">
                        Crear evento
                      </Link>
                    ) : null}
                  </EmptyLite>
                )}

                {agenda.next.length ? (
                  <>
                    <p className="cap home-panel__sub">Próximos 14 días</p>
                    <ol className="tl">
                      {agenda.next.map((e) => (
                        <li key={e.id}>
                          <Link className="tl__row" href={`/events/${e.id}`}>
                            <span className="tl__time t-num">{shortDate(e.startsAt)}</span>
                            <span className="tl__dot" aria-hidden />
                            <span className="tl__body">
                              <span className="tl__title">{e.name}</span>
                              <small>
                                {daysLabel(daysUntil(e.startsAt, now))} · {e.avgProgress}% de formatos
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </section>

              <section className="home-panel" aria-labelledby="home-approvals">
                <div className="home-panel__head">
                  <h3 id="home-approvals">Esperan tu visto bueno</h3>
                  {canSeePo ? (
                    <Link className="home-panel__link" href="/purchase-orders">
                      Ver todo
                    </Link>
                  ) : canSeeTasks ? (
                    <Link className="home-panel__link" href="/tasks">
                      Ver todo
                    </Link>
                  ) : null}
                </div>

                {approvals.length ? (
                  <ul className="ap-list">
                    {approvals.map(({ key, ...row }) => (
                      <ApprovalRow key={key} {...row} />
                    ))}
                  </ul>
                ) : (
                  <p className="home-calm">
                    <span>Nada espera tu visto bueno.</span>
                    <small>Las órdenes, formatos y tareas por revisar aparecen aquí.</small>
                  </p>
                )}

                {hasRisks ? (
                  <>
                    <p className="cap home-panel__sub">Requiere atención</p>
                    <ul className="ap-list">
                      {data.atRisk.slice(0, 4).map((e) => (
                        <ApprovalRow
                          key={e.id}
                          title={e.name}
                          sub={`${e.avgProgress}% de formatos${
                            e.daysToShow != null && e.daysToShow >= 0
                              ? ` · ${daysLabel(e.daysToShow).toLowerCase()}`
                              : ''
                          }`}
                          status={e.risk === 'critical' ? 'Urgente' : 'Revisar'}
                          tone={e.risk === 'critical' ? 'fill' : 'line'}
                          href={`/events/${e.id}`}
                        />
                      ))}
                      {otherAlerts.slice(0, 3).map((a) => (
                        <ApprovalRow
                          key={`${a.code}-${a.message}`}
                          title={a.message}
                          status={a.severity === 'critical' ? 'Urgente' : 'Aviso'}
                          tone={a.severity === 'critical' ? 'fill' : 'line'}
                          href={a.href}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
