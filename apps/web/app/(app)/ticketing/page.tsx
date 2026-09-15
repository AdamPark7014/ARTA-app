'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite, Pill, SectionHead } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FieldSearch } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { userHasPermission } from '@/lib/access-matrix';
import { boleteraDateLabel } from '@/lib/boletera';
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

function startTime(e: EventRow): number {
  const t = e.startsAt ? new Date(e.startsAt).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export default function TicketingPage() {
  const { entity, user } = useUser();
  const canEdit = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'ticketing.edit',
    'everything',
  ]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [setups, setSetups] = useState<SetupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [pdfId, setPdfId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<EventRow[]>(`/events?entity=${entity}&scope=active`),
      api<SetupRow[]>('/ticketing'),
    ])
      .then(([ev, st]) => {
        if (!alive) return;
        setEvents(ev);
        setSetups(st);
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
        <SectionHead title="Creación de boletera" sub="Eventos actuales y su documento para la boletera.">
          {rows.length > 6 ? (
            <FieldSearch value={q} onChange={setQ} placeholder="Buscar evento…" label="Buscar evento" />
          ) : null}
        </SectionHead>

        {error ? (
          <p className="inline-note bol-error" role="alert">
            {error}
          </p>
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
                      <td>{setup ? setup.boletera : <Pill tone="draft">Sin crear</Pill>}</td>
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
                            <Link className="btn btn-sm" href={href}>
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
