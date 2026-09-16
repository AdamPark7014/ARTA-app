'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, SectionHead, Seg } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { canAccessEventOps, userHasPermission } from '@/lib/access-matrix';
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
};

type HealthItem = { id: string; avgProgress: number; risk: 'critical' | 'watch' | 'healthy' };

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
  if (!e.startsAt) return '';
  const start = new Date(e.startsAt);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - startOfToday()) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days > 1 && days <= 60) return `En ${days} días`;
  return start.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' });
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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [health, setHealth] = useState<Map<string, HealthItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const canCreate =
    !!user &&
    canAccessEventOps(user.roleKey, entity) &&
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
  }, [events, scope, q]);

  return (
    <AppShell title={SCOPE_TITLE[scope]}>
      <div className="sx-stack page-workspace">
        <SectionHead
          title={SCOPE_TITLE[scope]}
          sub={loading ? undefined : `${list.length} ${list.length === 1 ? 'evento' : 'eventos'} · ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}`}
        >
          <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento o venue…" label="Buscar evento" maxWidth={240} />
          {canCreate ? (
            <Link className="btn btn-sm" href="/events/new">
              + Crear evento
            </Link>
          ) : null}
        </SectionHead>

        <Seg
          label="Qué eventos ver"
          value={scope}
          onChange={(next) => router.push(next === 'active' ? '/events' : `/events?scope=${next}`)}
          options={[
            { key: 'active', label: 'Actuales' },
            { key: 'past', label: 'Pasados' },
            { key: 'all', label: 'Todos' },
          ]}
        />

        {loading ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
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
              return (
                <Link key={e.id} className="ev-card" href={`/events/${e.id}`}>
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
                    {h && scope !== 'past' ? (
                      <span className="ev-card__progress">
                        <span className="meter">
                          <span style={{ width: `${h.avgProgress}%` }} />
                        </span>
                        <span className="t-small t-muted">{h.avgProgress}%</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="ev-card__flag">
                    {status ? (
                      <Pill tone={status.tone}>{status.label}</Pill>
                    ) : h?.risk === 'critical' ? (
                      <Pill tone="danger">Urgente</Pill>
                    ) : h?.risk === 'watch' ? (
                      <Pill tone="review">Revisar</Pill>
                    ) : null}
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
