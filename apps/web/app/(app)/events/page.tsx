'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, Seg } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { eventWhen } from '@/lib/format';
import { canAccessEventOps, userHasPermission } from '@/lib/access-matrix';
import { canEditEventInfo } from '@arta/rbac';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  schedule?: string | null;
  updatedAt: string;
  /** Formatos entregados que esperan autorización (un API viejo no lo manda: cuenta como 0). */
  pendingAuthorizedChecklists?: number;
};

type HealthItem = {
  id: string;
  avgProgress: number;
  risk: 'critical' | 'watch' | 'healthy';
  checklistCount?: number;
  todoChecklists?: number;
  reviewChecklists?: number;
  worstChecklist?: { title: string; pct: number } | null;
};

/** «Lo siguiente» de la tarjeta (maqueta aprobada 11-11-2026): lo más atrasado, no solo un porcentaje. */
function nextLine(h: HealthItem | undefined): string {
  if (!h || h.checklistCount == null) return '';
  if (!h.checklistCount) return 'Agregar los formatos del show';
  const todo = h.todoChecklists ?? 0;
  const review = h.reviewChecklists ?? 0;
  if (todo && h.worstChecklist) {
    const more = todo > 1 ? ` · faltan ${todo} formatos` : '';
    return `${h.worstChecklist.title} al ${h.worstChecklist.pct} %${more}`;
  }
  if (review) return `${review} ${review === 1 ? 'formato espera' : 'formatos esperan'} autorización`;
  return 'Formatos al día';
}

type Scope = 'active' | 'past' | 'all';

const SCOPE_TITLE: Record<Scope, string> = {
  active: 'Eventos actuales',
  past: 'Eventos pasados',
  all: 'Todos los eventos',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: 'draft' },
  CLOSED: { label: 'Cerrado', tone: 'review' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Junta 2026-08-28: el menú separa «Eventos actuales» de «Eventos Pasados».
 * Pasado = cerrado/cancelado, o con fecha de show anterior a hoy.
 */
function isPastEvent(e: EventRow, today: number) {
  if (e.status === 'CLOSED' || e.status === 'CANCELLED') return true;
  if (!e.startsAt) return false;
  return new Date(e.endsAt || e.startsAt).getTime() < today;
}

function whenLabel(e: EventRow) {
  return eventWhen(e.startsAt, e.endsAt);
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Eventos">
          <div className="stack page-workspace">
            <LoadingBlock rows={5} label="Cargando eventos…" />
          </div>
        </AppShell>
      }
    >
      <EventsPageInner />
    </Suspense>
  );
}

/**
 * Lista de eventos: una tarjeta por show con su fecha, lugar y avance.
 *
 * Antes la misma lista salía tres veces —tablero por estado, tarjetas y tabla—
 * con filtros encima; para encontrar un show bastaba con verlo una vez.
 */
function EventsPageInner() {
  const { entity, user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get('scope');
  const scope: Scope = scopeParam === 'past' || scopeParam === 'all' ? scopeParam : 'active';
  /** `?ver=revision` (la fila «Formatos entregados» del inicio): solo los eventos con formatos por autorizar. */
  const revision = searchParams.get('ver') === 'revision';
  const [events, setEvents] = useState<EventRow[]>([]);
  const [health, setHealth] = useState<Map<string, HealthItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const canCreate =
    !!user &&
    canAccessEventOps(user.roleKey, entity) &&
    canEditEventInfo(user, entity) &&
    userHasPermission(user.roleKey, user.permissions, ['event.create', 'everything']);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<EventRow[]>(`/events?entity=${entity}&scope=${scope}`),
      api<{ eventHealth: HealthItem[] }>(`/analytics/overview?entity=${entity}`).catch(() => null),
    ])
      .then(([ev, o]) => {
        setEvents(ev);
        setHealth(new Map((o?.eventHealth || []).map((h) => [h.id, h])));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity, scope]);

  const list = useMemo(() => {
    const today = startOfToday();
    const n = q.trim().toLowerCase();
    return events
      .filter((e) => scope === 'all' || isPastEvent(e, today) === (scope === 'past'))
      .filter((e) => !revision || (e.pendingAuthorizedChecklists ?? 0) > 0)
      .filter(
        (e) =>
          !n ||
          e.name.toLowerCase().includes(n) ||
          (e.artist || '').toLowerCase().includes(n) ||
          (e.venue || '').toLowerCase().includes(n),
      )
      .sort((a, b) => {
        const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
        return scope === 'past' ? tb - ta : ta - tb;
      });
  }, [events, scope, q, revision]);

  const pageTitle = revision ? 'Formatos por autorizar' : SCOPE_TITLE[scope];

  return (
    <AppShell title={pageTitle}>
      <div className="sx-stack page-workspace">
        <PageHeader
          eyebrow={revision ? SCOPE_TITLE[scope] : undefined}
          title={pageTitle}
          description={loading ? undefined : `${list.length} ${list.length === 1 ? 'evento' : 'eventos'} · ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}`}
          below={
            <Seg
              label="Qué eventos ver"
              value={scope}
              onChange={(next) => {
                // Cambiar de alcance conserva la revisión de formatos si se venía en ella.
                const params = new URLSearchParams();
                if (next !== 'active') params.set('scope', next);
                if (revision) params.set('ver', 'revision');
                const qs = params.toString();
                router.push(qs ? `/events?${qs}` : '/events');
              }}
              options={[
                { key: 'active', label: 'Actuales' },
                { key: 'past', label: 'Pasados' },
                { key: 'all', label: 'Todos' },
              ]}
            />
          }
        >
          <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento o venue…" label="Buscar evento" maxWidth={240} />
          {canCreate ? (
            <Link className="btn btn-sm" href="/events/new">
              + Crear evento
            </Link>
          ) : null}
        </PageHeader>

        {loading ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
        ) : !list.length && revision && !q ? (
          <div className="surface">
            <EmptyLite icon="✓" title="Nada espera autorización" text="Los formatos entregados ya están autorizados.">
              <Link className="btn ghost btn-sm" href="/events?scope=active">
                Ver eventos actuales
              </Link>
            </EmptyLite>
          </div>
        ) : !list.length ? (
          <div className="surface">
            <EmptyLite
              icon="◷"
              title={q ? 'Nada con esa búsqueda' : scope === 'past' ? 'Sin eventos pasados' : 'Sin eventos por ahora'}
            >
              {canCreate && scope !== 'past' && !q ? (
                <Link className="btn btn-sm" href="/events/new">
                  Crear evento
                </Link>
              ) : null}
            </EmptyLite>
          </div>
        ) : (
          <div className="ev-grid">
            {list.map((e) => {
              const h = health.get(e.id);
              const d = e.startsAt ? new Date(e.startsAt) : null;
              const status = STATUS[e.status];
              const place = [e.venue, e.city].filter(Boolean).join(', ');
              const pendingAuth = e.pendingAuthorizedChecklists ?? 0;
              // En revisión la tarjeta entera abre los formatos por autorizar de ese evento: la tarjeta ya
              // es una liga y no cabe otra adentro, así que el chip es la seña y la tarjeta el destino.
              const href = revision ? `/events/${e.id}?tab=checklists&ver=revision` : `/events/${e.id}`;
              return (
                <Link key={e.id} className="ev-card" href={href}>
                  <span className="date-chip" aria-hidden>
                    {d ? (
                      <>
                        <span className="date-chip__day">{d.getDate()}</span>
                        <span className="date-chip__month">
                          {d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}
                        </span>
                      </>
                    ) : (
                      <span className="date-chip__month">—</span>
                    )}
                  </span>
                  <span className="ev-card__body">
                    <span className="ev-card__name">{e.name}</span>
                    <span className="ev-card__meta">{[whenLabel(e), place].filter(Boolean).join(' · ') || 'Sin fecha'}</span>
                    {scope !== 'past' && nextLine(h) ? (
                      <span className="ev-card__next">
                        <span className="ev-card__next-label">Lo siguiente:</span> {nextLine(h)}
                      </span>
                    ) : null}
                    {/* Avance y estado en el mismo renglón: el nombre ya no compite con la píldora. */}
                    <span className="ev-card__foot">
                      {h && scope !== 'past' ? (
                        <span className="ev-card__progress">
                          <span className="meter">
                            <span style={{ width: `${h.avgProgress}%` }} />
                          </span>
                          <span className="t-small t-muted t-num">{h.avgProgress}%</span>
                        </span>
                      ) : null}
                      <span className="ev-card__flag">
                        {revision && pendingAuth > 0 ? (
                          <Pill tone="review">{pendingAuth} por autorizar</Pill>
                        ) : status ? (
                          <Pill tone={status.tone}>{status.label}</Pill>
                        ) : h?.risk === 'critical' ? (
                          <Pill tone="danger">Urgente</Pill>
                        ) : h?.risk === 'watch' ? (
                          <Pill tone="review">Atrasado</Pill>
                        ) : h?.checklistCount && scope !== 'past' ? (
                          <Pill tone="ok">A tiempo</Pill>
                        ) : null}
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
