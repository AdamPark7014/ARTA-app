'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, Tile } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { canSeeTeamLocation } from '@arta/rbac';
import type { MapMarker } from '@/components/ubicacion/TeamMap';

const TeamMap = dynamic(() => import('@/components/ubicacion/TeamMap').then((m) => m.TeamMap), {
  ssr: false,
  loading: () => <div className="geo-map" aria-hidden />,
});

type Status = 'al_dia' | 'atrasada' | 'sin_permiso' | 'apagada' | 'sin_aceptar' | 'sin_datos' | 'fuera_de_horario';

type Person = {
  id: string;
  fullName: string;
  title?: string | null;
  roleKey: string;
  status: Status;
  count: number;
  last?: { lat: number; lng: number; accuracyM?: number | null; capturedAt: string } | null;
};

type Team = { date: string; inWindow: boolean; startHour: number; endHour: number; people: Person[] };

type Route = {
  date: string;
  person: { id: string; fullName: string };
  points: Array<{ id: string; lat: number; lng: number; accuracyM?: number | null; capturedAt: string }>;
};

const STATUS: Record<Status, { label: string; tone: string }> = {
  al_dia: { label: 'Al día', tone: 'ok' },
  atrasada: { label: 'Sin punto reciente', tone: 'warn' },
  sin_permiso: { label: 'Sin permiso', tone: 'danger' },
  apagada: { label: 'Ubicación apagada', tone: 'danger' },
  sin_aceptar: { label: 'No ha aceptado', tone: 'warn' },
  sin_datos: { label: 'Sin datos', tone: 'draft' },
  fuera_de_horario: { label: 'Fuera de horario', tone: 'draft' },
};

/** La fecha de hoy en Puebla, que es la que cuenta el servidor. */
function todayInPuebla() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

function clock(iso?: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Ubicación del equipo, de 10:00 a 18:00 (docs/UBICACION.md). Solo Chacho y Arturo: a ellos no se les
 * mide. Primero el último punto de cada quien; al elegir a alguien, su recorrido del día.
 */
export default function UbicacionPage() {
  const { user } = useUser();
  const allowed = canSeeTeamLocation(user?.roleKey);
  const [date, setDate] = useState(todayInPuebla);
  const [team, setTeam] = useState<Team | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setTeam(await api<Team>(`/ubicacion/equipo?date=${date}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ubicación');
    }
  }, [date]);

  useEffect(() => {
    if (!allowed) return;
    setTeam(null);
    void load();
    // Dentro del horario entra un punto cada media hora: basta refrescar cada 5 minutos.
    const timer = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [allowed, load]);

  useEffect(() => {
    if (!selected) {
      setRoute(null);
      return;
    }
    let live = true;
    setRoute(null);
    api<Route>(`/ubicacion/persona/${selected}?date=${date}`)
      .then((r) => {
        if (live) setRoute(r);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'No se pudo cargar el recorrido');
      });
    return () => {
      live = false;
    };
  }, [selected, date]);

  const markers = useMemo<MapMarker[]>(() => {
    if (selected) {
      return (route?.points ?? []).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: clock(p.capturedAt) }));
    }
    return (team?.people ?? [])
      .filter((p) => p.last)
      .map((p) => ({ id: p.id, lat: p.last!.lat, lng: p.last!.lng, label: p.fullName.split(' ')[0] }));
  }, [selected, route, team]);

  const people = team?.people ?? [];
  const live = people.filter((p) => p.status === 'al_dia').length;
  const problems = people.filter((p) => ['sin_permiso', 'apagada', 'sin_aceptar', 'atrasada'].includes(p.status)).length;

  return (
    <AppShell title="Ubicación">
      <div className="stack page-workspace">
        <PageHeader
          title="Ubicación del equipo"
          description="Lo que registran las apps de 10:00 a 18:00, un punto cada media hora. Solo dirección general lo ve."
        >
          {allowed ? (
            <div className="fx fin-range">
              <label className="fx-field">
                <span>Día</span>
                <input
                  type="date"
                  value={date}
                  max={todayInPuebla()}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setSelected(null);
                    setDate(e.target.value);
                  }}
                />
              </label>
            </div>
          ) : null}
        </PageHeader>

        {!allowed ? (
          <div className="surface">
            <EmptyLite icon="+" title="Esta pantalla no está a tu alcance" text="La ven Chacho y Arturo." />
          </div>
        ) : null}
        {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}
        {allowed && !team && !error ? <LoadingBlock rows={5} label="Cargando ubicación…" /> : null}

        {allowed && team ? (
          <>
            <div className="tiles">
              <Tile label="Al día" value={live} sub={`de ${people.length} personas`} />
              <Tile
                label="Por revisar"
                value={problems}
                tone={problems ? 'warn' : undefined}
                sub={problems ? 'Sin permiso, sin aceptar o sin punto reciente' : 'Todo en orden'}
              />
            </div>
            <div className="geo-layout">
              <section className="surface">
                <div className="geo-list" role="list">
                  {selected ? (
                    <button className="btn-quiet" type="button" onClick={() => setSelected(null)}>
                      Ver a todos
                    </button>
                  ) : null}
                  {people.map((p) => {
                    const status = STATUS[p.status];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="listitem"
                        className={`geo-row ${selected === p.id ? 'is-on' : ''}`}
                        aria-pressed={selected === p.id}
                        onClick={() => setSelected(p.id)}
                      >
                        <span className="geo-row__name">{p.fullName}</span>
                        <Pill tone={status.tone}>{status.label}</Pill>
                        <span className="geo-row__sub">
                          {p.last ? `Último punto ${clock(p.last.capturedAt)} · ${p.count} hoy` : p.title || 'Sin puntos en este día'}
                        </span>
                      </button>
                    );
                  })}
                  {!people.length ? <EmptyLite icon="+" title="Nadie que medir" /> : null}
                </div>
              </section>
              <div>
                <TeamMap markers={markers} route={!!selected} />
                {route?.points.length ? (
                  <ul className="geo-points" aria-label={`Puntos de ${route.person.fullName}`}>
                    {route.points.map((p) => (
                      <li key={p.id}>
                        <span>{clock(p.capturedAt)}</span>
                        <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                          Abrir en Google Maps
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
