'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { canAccessEventOps, userHasPermission, visibleNavItems } from '@/lib/access-matrix';
import { canEditEventInfo, canSeeModule } from '@arta/rbac';
import { useUser } from '@/lib/user-context';
import { moneyKpi } from '@/lib/format';

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
  /** OC por estado preciso (`po-state.ts`); un API viejo no lo manda. */
  poStates?: Array<{ key: string; count: number; amount: number; over7: number; oldestDays: number }>;
};

/**
 * Filas de OC en «Esperan tu visto bueno», una por lo que falta (junta 23-10-2026:
 * «más específicas, como sin pagar, sin tal»). Cada una lleva a la torre ya
 * filtrada. `who`: quién puede moverla (autoriza o paga); `fill`: hay algo que
 * hacer hoy (fuera de día de cobro solo se informa).
 */
const PO_APPROVAL_ROWS: Array<{
  key: string;
  who: 'authorize' | 'pay';
  title: string;
  hint: string;
  status: string;
  tone: 'fill' | 'line';
}> = [
  { key: 'unauthorized', who: 'authorize', title: 'OC sin autorizar', hint: 'esperan tu visto bueno', status: 'Autorizar', tone: 'fill' },
  { key: 'no_proof', who: 'pay', title: 'OC autorizadas sin comprobante', hint: 'súbelo para poder pagar', status: 'Subir', tone: 'fill' },
  { key: 'unpaid', who: 'pay', title: 'OC autorizadas sin pagar', hint: 'listas para pagar hoy', status: 'Pagar', tone: 'fill' },
  { key: 'off_pay_day', who: 'pay', title: 'OC fuera de día de cobro', hint: 'listas; se pagan el próximo día de cobro', status: 'Esperar', tone: 'line' },
  { key: 'paid_no_proof', who: 'pay', title: 'OC pagadas sin comprobante', hint: 'falta subir el comprobante', status: 'Revisar', tone: 'line' },
];

const ordenes = (n: number) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`;

type DayEvent = { id: string; name: string; artist?: string | null; startsAt: string; avgProgress: number };

/** Avisos que el inicio ya muestra como fila propia (OC, formatos, tareas, eventos en riesgo). */
const COVERED_ALERTS = new Set(['EVENT_RISK', 'PO_AGING', 'SIG_BACKLOG', 'TASK_OVERDUE']);

/** Quién ve «Todas las tareas» (mismo conjunto que `tasks/page.tsx`): sus ligas abren la vista del equipo. */
const TEAM_ROLES = new Set(['super_admin', 'dir_general', 'dir_adjunta', 'gerente_arta', 'dir_auditorio', 'convenios']);

/** `2026-11-07` en la zona de la empresa, para abrir el calendario en el día de hoy. */
function todayInMexico(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(now);
}

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

/** Mosaico de tinta: el saludo, el show que sigue, cómo va y un toque para entrar. */
function HeroTile({
  show,
  now,
  hello,
  date,
  children,
}: {
  show: DayEvent | null;
  now: Date;
  hello: string;
  date: string;
  children?: ReactNode;
}) {
  const days = show ? daysUntil(show.startsAt, now) : 0;
  const progress = show ? Math.max(0, Math.min(100, Math.round(show.avgProgress))) : 0;
  const evening = show ? new Date(show.startsAt).getHours() >= 19 : false;
  const when = !show
    ? ''
    : days <= 0
      ? `${evening ? 'Esta noche' : 'Hoy'}, ${hhmm(show.startsAt)}`
      : days === 1
        ? `Mañana, ${hhmm(show.startsAt)}`
        : `En ${days} días · ${shortDate(show.startsAt)}, ${hhmm(show.startsAt)}`;
  return (
    <section className="mz-tile mz-hero" aria-labelledby="home-hello">
      <span className="mz-hero__ring mz-hero__ring--a" aria-hidden />
      <span className="mz-hero__ring mz-hero__ring--b" aria-hidden />
      <div className="mz-hero__top">
        <p className="mz-hero__eyebrow">
          <span className="mz-hero__date">{date}</span>
          <span aria-hidden> · </span>
          <span id="home-hello" role="heading" aria-level={2}>
            {hello}
          </span>
        </p>
        {children ? <div className="mz-hero__actions">{children}</div> : null}
      </div>
      {show ? (
        <>
          <p className="mz-hero__headline">
            <span className="mz-hero__when">{when}</span>
            <span className="mz-hero__name" title={show.name}>
              {show.name}
            </span>
          </p>
          <div className="mz-hero__foot">
            <div className="mz-hero__progress">
              <div className="mz-hero__progress-head">
                <span>Formatos listos</span>
                <span className="t-num">{progress} %</span>
              </div>
              <span className="mz-hero__bar" aria-hidden>
                <i style={{ width: `${progress}%` }} />
              </span>
              {show.artist && !show.name.toLowerCase().includes(show.artist.toLowerCase()) ? (
                <p className="mz-hero__note" title={show.artist}>
                  {show.artist}
                </p>
              ) : null}
            </div>
            <Link className="mz-hero__go" href={`/events/${show.id}`}>
              Abrir evento
            </Link>
          </div>
        </>
      ) : (
        <p className="mz-hero__headline">
          <span className="mz-hero__when">Sin shows cerca</span>
          <span className="mz-hero__name">No hay shows en los próximos 14 días.</span>
        </p>
      )}
    </section>
  );
}

/** Fila de «Te toca a ti»: cuántas, qué son y el botón que las resuelve. La primera va en tinta. */
function TurnRow({
  title,
  count,
  sub,
  amount,
  status,
  href,
  lead,
}: {
  title: string;
  count?: number;
  sub?: string;
  amount?: string;
  status: string;
  href?: string;
  lead: boolean;
}) {
  const detail = [amount, sub].filter(Boolean).join(' · ');
  const body = (
    <>
      {count != null ? <span className="mz-turn__n t-num">{count}</span> : null}
      <span className="mz-turn__main">
        <span className="mz-turn__title">{title}</span>
        {detail ? <small className="mz-turn__sub">{detail}</small> : null}
      </span>
      <span className="mz-turn__act">{status}</span>
    </>
  );
  const cls = `mz-turn ${lead ? 'is-lead' : ''}`;
  return (
    <li>
      {href ? (
        <Link className={cls} href={href}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

const DAY_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function isoDay(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Los próximos 14 días en una tira: un punto por show y un toque para abrir el día. */
function FortnightStrip({ events, now }: { events: DayEvent[]; now: Date }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = startOfDay(now);
    d.setDate(d.getDate() + i);
    return { d, i, shows: events.filter((e) => daysUntil(e.startsAt, now) === i) };
  });
  const total = days.reduce((n, x) => n + x.shows.length, 0);
  return (
    <section className="mz-tile mz-days" aria-labelledby="home-days">
      <div className="mz-tile__head">
        <h3 id="home-days">Próximos 14 días</h3>
        <span className="mz-tile__meta">
          {total === 0 ? 'Sin shows' : total === 1 ? '1 show' : `${total} shows`} · toca un día para abrirlo
        </span>
      </div>
      <ol className="mz-days__row">
        {days.map(({ d, i, shows }) => {
          const label = `${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}${
            shows.length ? `, ${shows.length === 1 ? shows[0].name : `${shows.length} shows`}` : ', sin shows'
          }`;
          const href = shows.length === 1 ? `/events/${shows[0].id}` : `/calendar?date=${isoDay(d)}`;
          return (
            <li key={i}>
              <Link
                className={`mz-day ${i === 0 ? 'is-today' : ''} ${shows.length ? 'has-shows' : ''}`}
                href={href}
                aria-label={label}
                title={shows.map((e) => e.name).join(' · ') || undefined}
              >
                <span className="mz-day__w" aria-hidden>
                  {DAY_LETTER[d.getDay()]}
                </span>
                <span className="mz-day__n t-num" aria-hidden>
                  {d.getDate()}
                </span>
                <span className="mz-day__dots" aria-hidden>
                  {shows.slice(0, 3).map((e) => (
                    <i key={e.id} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
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
  count?: number;
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
  const canCreate =
    eventOps && !!user && canEditEventInfo(user, entity) && userHasPermission(role, perms, ['event.create', 'everything']);
  const canSeePo = !!user && canSeeModule(user, entity, 'po');
  const canAuthorizePo = userHasPermission(role, perms, ['po.authorize', 'everything']);
  const canPayPo = userHasPermission(role, perms, ['po.mark_paid', 'everything']);
  const canSeeTasks = useMemo(
    () => (user ? visibleNavItems(user, entity).some((item) => item.href === '/tasks') : false),
    [user, entity],
  );
  // Las ligas a Tareas abren la vista que esa persona puede ver: el equipo o solo las suyas.
  const tasksVista = TEAM_ROLES.has(role) ? 'equipo' : 'mias';

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
  // Con estados precisos, una fila por lo que falta y solo lo que esta persona puede mover.
  const poRows = data?.poStates
    ? PO_APPROVAL_ROWS.flatMap((row) => {
        const st = data.poStates?.find((x) => x.key === row.key);
        if (!st || st.count === 0) return [];
        if (row.who === 'authorize' ? !canAuthorizePo : !canPayPo) return [];
        return [
          {
            key: `po-${row.key}`,
            title: row.title,
            count: st.count,
            sub: `${st.over7 ? `${st.over7} con más de 7 días` : row.hint}`,
            amount: moneyKpi(st.amount),
            status: row.status,
            tone: row.tone,
            href: `/purchase-orders?estado=${row.key}`,
          },
        ];
      })
    : null;
  const approvals = k
    ? [
        ...(poRows ?? []),
        !poRows && canSeePo && k.poPipelineAmount > 0
          ? {
              key: 'po',
              title: 'Órdenes de compra',
              count: undefined as number | undefined,
              sub: k.poAgingOver7 ? `${k.poAgingOver7} con más de 7 días` : 'Por autorizar o pagar',
              amount: moneyKpi(k.poPipelineAmount),
              status: 'Revisar',
              tone: 'fill' as const,
              // Con órdenes viejas se ve todo; si no, lo que falta autorizar.
              href: k.poAgingOver7 ? '/purchase-orders?seccion=all' : '/purchase-orders?seccion=auth',
            }
          : null,
        k.pendingAuthorized > 0
          ? {
              key: 'formats',
              title: 'Formatos entregados',
              count: k.pendingAuthorized as number | undefined,
              sub: 'Esperan tu autorización',
              status: 'Autorizar',
              tone: 'fill' as const,
              href: '/events?scope=active&ver=revision',
            }
          : null,
        canSeeTasks && k.overdueTasks > 0
          ? {
              key: 'tasks',
              title: 'Tareas vencidas',
              count: k.overdueTasks as number | undefined,
              sub: `de ${k.openTasks} abiertas`,
              status: 'Atender',
              tone: 'fill' as const,
              href: `/tasks?filtro=vencidas&vista=${tasksVista}`,
            }
          : null,
      ].filter(<T,>(x: T | null): x is T => x !== null)
    : [];
  const hasRisks = !!data && (data.atRisk.length > 0 || otherAlerts.length > 0);
  const singleToday = agenda.today.length === 1 ? agenda.today[0] : null;
  // El que sigue: hoy el que aún no empieza; si ya pasaron todos, el próximo.
  const nextShow =
    agenda.today.find((e) => new Date(e.startsAt).getTime() > now.getTime()) ?? agenda.next[0] ?? agenda.today[0] ?? null;

  // La frase del encabezado: cuánto espera a esta persona y qué show sigue hoy.
  const waiting =
    (data?.poStates
      ? PO_APPROVAL_ROWS.reduce((n, row) => {
          if (row.who === 'authorize' ? !canAuthorizePo : !canPayPo) return n;
          return n + (data.poStates?.find((x) => x.key === row.key)?.count ?? 0);
        }, 0)
      : 0) +
    (k && k.pendingAuthorized > 0 ? k.pendingAuthorized : 0) +
    (k && canSeeTasks ? k.overdueTasks : 0);
  // Qué hay detrás del monto por pagar: una barra por lo que le falta a cada grupo de órdenes.
  const PO_BAR_LABEL: Record<string, string> = {
    unauthorized: 'Sin autorizar',
    no_proof: 'Sin comprobante',
    unpaid: 'Sin pagar',
    off_pay_day: 'Fuera de día de cobro',
  };
  const poBars = (data?.poStates ?? [])
    .filter((x) => PO_BAR_LABEL[x.key] && x.amount > 0)
    .map((x) => ({ key: x.key, label: PO_BAR_LABEL[x.key], amount: x.amount, count: x.count }));
  const poBarMax = Math.max(1, ...poBars.map((b) => b.amount));
  const onTime = k ? Math.max(0, k.openTasks - k.overdueTasks) : 0;
  const stripEvents = [...agenda.today, ...(data?.upcoming ?? []).filter((e) => daysUntil(e.startsAt, now) > 0)];
  const mosaic = !!data && !!k && eventOps && role !== 'practicante' && !loading && !error;
  const actions = (
    <>
      {canSeeTasks ? (
        <Link className="btn ghost" href="/tasks?nueva=1">
          Nueva tarea
        </Link>
      ) : null}
      {canCreate ? (
        <Link className="btn" href="/events/new">
          {entity === 'EXPLANADA' ? 'Nuevo show' : 'Nuevo evento'}
        </Link>
      ) : null}
    </>
  );

  return (
    <AppShell title="Inicio">
      <div className="page-workspace home">
        {mosaic ? null : (
          <PageHeader
            eyebrow={longDate(now)}
            title={
              <>
                {greeting(now)}, <b>{firstName}</b>
              </>
            }
          >
            {actions}
          </PageHeader>
        )}

        {role === 'practicante' ? (
          // Junta 23-10-2026: el practicante entra al sitio (Studio) y al calendario, nada más.
          <section className="surface">
            <EmptyLite
              icon="✎"
              title="El sitio de Arta"
              text="Prepara noticias, eventos destacados y slides en Studio. Quedan como borrador: cuando estén listos, mándalos a revisión y dirección los publica."
            >
              <Link className="btn btn-sm" href="/studio">
                Abrir Studio
              </Link>
              <Link className="btn ghost btn-sm" href="/calendar">
                Ver calendario
              </Link>
            </EmptyLite>
          </section>
        ) : !eventOps ? (
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
            <div className="mz mz--top">
              <HeroTile show={nextShow} now={now} hello={`${greeting(now)}, ${firstName}`} date={longDate(now)}>
                {actions}
              </HeroTile>

              <section className="mz-tile mz-turns" aria-labelledby="home-approvals">
                <div className="mz-tile__head">
                  <h3 id="home-approvals">Te toca a ti</h3>
                  <span className="mz-tile__meta">
                    {waiting ? `${waiting} ${waiting === 1 ? 'pendiente' : 'pendientes'}` : 'Al día'}
                  </span>
                </div>
                {approvals.length ? (
                  <ul className="mz-turns__list">
                    {approvals.map(({ key, tone: _tone, ...row }, i) => (
                      <TurnRow key={key} {...row} lead={i === 0} />
                    ))}
                  </ul>
                ) : (
                  <p className="home-calm">
                    <span>Nada espera tu visto bueno.</span>
                    <small>Las órdenes, formatos y tareas por revisar aparecen aquí.</small>
                  </p>
                )}
              </section>
            </div>

            <div className="mz mz--figs">
              {canSeePo ? (
                <section className="mz-tile mz-fig" aria-labelledby="home-fig-po">
                  <Link className="mz-fig__head" href="/purchase-orders?seccion=pay">
                    <span className="mz-fig__label" id="home-fig-po">
                      Por pagar
                    </span>
                    <span className="mz-fig__value t-num">{moneyKpi(k.poPipelineAmount)}</span>
                  </Link>
                  {poBars.length ? (
                    <ul className="mz-bars">
                      {poBars.map((b) => (
                        <li key={b.key}>
                          <Link className="mz-bars__row" href={`/purchase-orders?estado=${b.key}`}>
                            <span className="mz-bars__top">
                              <span>
                                {b.label} <small>{ordenes(b.count)}</small>
                              </span>
                              <span className="t-num">{moneyKpi(b.amount)}</span>
                            </span>
                            <span className="mz-bars__bar" aria-hidden>
                              <i style={{ width: `${Math.max(4, Math.round((b.amount / poBarMax) * 100))}%` }} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mz-fig__sub">
                      {k.poAgingOver7 ? `${k.poAgingOver7} con más de 7 días` : 'Órdenes de compra por autorizar o pagar'}
                    </p>
                  )}
                </section>
              ) : null}

              {canSeeTasks ? (
                <Link className="mz-tile mz-fig" href={`/tasks?filtro=abiertas&vista=${tasksVista}`}>
                  <span className="mz-fig__label">Tareas abiertas</span>
                  <span className="mz-fig__line">
                    <span className="mz-fig__value t-num">{k.openTasks}</span>
                    {k.overdueTasks ? (
                      <span className="mz-fig__flag">
                        {k.overdueTasks} {k.overdueTasks === 1 ? 'vencida' : 'vencidas'}
                      </span>
                    ) : (
                      <span className="mz-fig__calm">Al día</span>
                    )}
                  </span>
                  <span className="mz-seg" aria-hidden>
                    {k.overdueTasks ? <i className="is-late" style={{ flexGrow: k.overdueTasks }} /> : null}
                    {onTime || !k.overdueTasks ? <i style={{ flexGrow: onTime || 1 }} /> : null}
                  </span>
                  <span className="mz-legend">
                    <span>
                      <i className="is-late" aria-hidden />
                      Vencidas {k.overdueTasks}
                    </span>
                    <span>
                      <i aria-hidden />
                      En tiempo {onTime}
                    </span>
                  </span>
                </Link>
              ) : null}

              <Link
                className="mz-tile mz-fig"
                href={k.pendingAuthorized > 0 ? '/events?scope=active&ver=revision' : '/events?scope=active'}
              >
                <span className="mz-fig__label">Formatos al día</span>
                <span className="mz-ringrow">
                  <span
                    className="mz-ring"
                    style={{ ['--pct' as string]: Math.max(0, Math.min(100, k.avgOpsProgress)) }}
                    aria-hidden
                  >
                    <span className="mz-ring__in t-num">{k.avgOpsProgress} %</span>
                  </span>
                  <span className="mz-ringrow__list">
                    <strong>
                      {k.pendingAuthorized ? `${k.pendingAuthorized} por autorizar` : 'Nada por autorizar'}
                    </strong>
                    <span>
                      {data.atRisk.length === 1 ? '1 evento en riesgo' : `${data.atRisk.length} eventos en riesgo`}
                    </span>
                    <span>{k.eventsActive === 1 ? '1 evento activo' : `${k.eventsActive} eventos activos`}</span>
                  </span>
                </span>
                <span className="sr-only">{k.avgOpsProgress} % de formatos al día</span>
              </Link>
            </div>

            <FortnightStrip events={stripEvents} now={now} />

            <div className="home-panels">
              {hasRisks ? (
                <section className="home-panel" aria-labelledby="home-risks">
                  <div className="home-panel__head">
                    <h3 id="home-risks">Requiere atención</h3>
                    <Link className="home-panel__link" href="/events?scope=active">
                      Ver eventos
                    </Link>
                  </div>
                  <ul className="ap-list">
                    {data.atRisk.slice(0, 4).map((e) => (
                      <ApprovalRow
                        key={e.id}
                        title={e.name}
                        sub={`${e.avgProgress}% de formatos${
                          e.daysToShow != null && e.daysToShow >= 0 ? ` · ${daysLabel(e.daysToShow).toLowerCase()}` : ''
                        }`}
                        status={e.risk === 'critical' ? 'Urgente' : 'Revisar'}
                        tone={e.risk === 'critical' ? 'fill' : 'line'}
                        href={`/events/${e.id}?tab=checklists&ver=pendientes`}
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
                </section>
              ) : null}
              <section className="home-panel" aria-labelledby="home-today">
                <div className="home-panel__head">
                  <h3 id="home-today">{singleToday ? `Hoy · ${singleToday.name}` : 'Hoy'}</h3>
                  <Link className="home-panel__link" href={`/calendar?date=${todayInMexico(now)}`}>
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
                      El próximo es <Link href={`/events/${agenda.next[0].id}`}>{agenda.next[0].name}</Link>,{' '}
                      {daysLabel(daysUntil(agenda.next[0].startsAt, now)).toLowerCase()}.
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
                              <small>{daysLabel(daysUntil(e.startsAt, now))}</small>
                            </span>
                            <span className="tl__meter" aria-label={`${e.avgProgress} % de formatos`}>
                              <span className="tl__bar" aria-hidden>
                                <i style={{ width: `${Math.max(0, Math.min(100, e.avgProgress))}%` }} />
                              </span>
                              <span className="t-num">{Math.round(e.avgProgress)} %</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
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
