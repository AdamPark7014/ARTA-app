'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, Tile } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { canAccessEventOps, userHasPermission } from '@/lib/access-matrix';
import { mxn } from '@/lib/price-list';
import { useUser } from '@/lib/user-context';

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
  upcoming: Array<{ id: string; name: string; startsAt: string; avgProgress: number }>;
  alerts: Array<{ severity: string; code: string; message: string; href?: string }>;
};

function daysUntil(iso: string) {
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / 86400000);
}

function daysLabel(days: number) {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days < 0) return 'Ya pasó';
  return `En ${days} días`;
}

/**
 * Inicio: lo que hay que atender hoy y lo que viene. Nada más.
 *
 * Antes eran seis cifras técnicas, gráficas de altas, márgenes, cuellos de
 * botella por plantilla y la bitácora de auditoría — todo junto y en la
 * primera pantalla. Eso sigue en sus módulos.
 */
export default function DashboardPage() {
  const { entity, user } = useUser();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const role = user?.roleKey || '';
  const perms = user?.permissions || [];
  const eventOps = canAccessEventOps(role, entity);
  const canCreate = eventOps && userHasPermission(role, perms, ['event.create', 'everything']);
  const canSeePo = userHasPermission(role, perms, ['po.authorize', 'po.mark_paid', 'everything']);

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

  const firstName = user?.fullName?.split(' ')[0] || 'equipo';
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <AppShell title="Inicio">
      <div className="sx-stack page-workspace home">
        <header className="home__hero">
          <p className="home__date">{today}</p>
          <h2 className="home__hello">Hola, {firstName}</h2>
        </header>

        {!eventOps ? (
          <div className="surface">
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
          </div>
        ) : loading ? (
          <LoadingBlock rows={4} label="Cargando…" />
        ) : error ? (
          <FlashMessage variant="error">{error}</FlashMessage>
        ) : data ? (
          <>
            <div className="tiles">
              <Tile
                label="Próximos 14 días"
                value={data.kpis.upcoming14d}
                sub={`${data.kpis.eventsActive} eventos activos`}
                onClick={() => router.push('/events')}
              />
              {canSeePo ? (
                <Tile
                  label="Por pagar"
                  value={mxn(data.kpis.poPipelineAmount)}
                  tone={data.kpis.poAgingOver7 ? 'warn' : undefined}
                  sub={data.kpis.poAgingOver7 ? `${data.kpis.poAgingOver7} llevan más de 7 días` : 'órdenes de compra'}
                  onClick={() => router.push('/purchase-orders')}
                />
              ) : null}
              <Tile
                label="Tareas abiertas"
                value={data.kpis.openTasks}
                tone={data.kpis.overdueTasks ? 'warn' : undefined}
                sub={data.kpis.overdueTasks ? `${data.kpis.overdueTasks} vencidas` : 'al día'}
                onClick={() => router.push('/tasks')}
              />
              <Tile
                label="Formatos por autorizar"
                value={data.kpis.pendingAuthorized}
                sub={`${data.kpis.avgOpsProgress}% de avance general`}
              />
            </div>

            <div className="split-2">
              <section className="surface">
                <div className="surface__head">
                  <h3 className="surface__title">Próximos shows</h3>
                  <Link className="btn-quiet" href="/events">
                    Ver eventos
                  </Link>
                </div>
                {data.upcoming.length ? (
                  <ul className="show-list">
                    {data.upcoming.map((e) => {
                      const d = new Date(e.startsAt);
                      const days = daysUntil(e.startsAt);
                      return (
                        <li key={e.id}>
                          <Link className="show-row" href={`/events/${e.id}`}>
                            <span className="date-chip" aria-hidden>
                              <span className="date-chip__day">{d.getDate()}</span>
                              <span className="date-chip__month">
                                {d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}
                              </span>
                            </span>
                            <span className="show-row__body">
                              <span className="show-row__name">{e.name}</span>
                              <span className="show-row__meta">{daysLabel(days)}</span>
                            </span>
                            <span className="show-row__progress" title={`${e.avgProgress}% de formatos`}>
                              <span className="meter">
                                <span style={{ width: `${e.avgProgress}%` }} />
                              </span>
                              <span className="t-small t-muted">{e.avgProgress}%</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyLite icon="◷" title="Sin shows en los próximos 14 días">
                    {canCreate ? (
                      <Link className="btn btn-sm" href="/events/new">
                        Crear evento
                      </Link>
                    ) : null}
                  </EmptyLite>
                )}
              </section>

              <section className="surface">
                <div className="surface__head">
                  <h3 className="surface__title">Requiere atención</h3>
                </div>
                {data.alerts.length || data.atRisk.length ? (
                  <ul className="attention-list">
                    {data.alerts.slice(0, 4).map((a) => (
                      <li key={`${a.code}-${a.message}`} className={`attention attention--${a.severity}`}>
                        <span className="attention__dot" aria-hidden />
                        <span className="attention__text">{a.message}</span>
                        {a.href ? (
                          <Link className="btn-quiet" href={a.href}>
                            Ver
                          </Link>
                        ) : null}
                      </li>
                    ))}
                    {data.atRisk.slice(0, 5).map((e) => (
                      <li key={e.id} className="attention">
                        <Link className="attention__link" href={`/events/${e.id}`}>
                          <span className="attention__text">
                            <strong>{e.name}</strong>
                            <span className="t-muted t-small">
                              {' '}
                              · {e.avgProgress}% de formatos
                              {e.daysToShow != null && e.daysToShow >= 0 ? ` · ${daysLabel(e.daysToShow).toLowerCase()}` : ''}
                            </span>
                          </span>
                          <Pill tone={e.risk === 'critical' ? 'danger' : 'review'}>
                            {e.risk === 'critical' ? 'Urgente' : 'Revisar'}
                          </Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyLite icon="✓" title="Todo en orden" />
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
