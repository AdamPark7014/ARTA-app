'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { SectionHead } from '@/components/ui/Lite';
import { MonthCalendar, type CalendarItem } from '@/components/ui/MonthCalendar';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventRow = {
  id: string;
  name: string;
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
};

/**
 * Calendario de shows: el mismo mes que en Campañas, cada show en sus días y
 * un clic para abrirlo. Sin filtros ni panel lateral: los cancelados no salen.
 */
export default function EventsCalendarPage() {
  const { entity, user } = useUser();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!user || !entity) return;
    setLoading(true);
    api<EventRow[]>(`/events?entity=${entity}&scope=all`)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, entity]);

  const items = useMemo<CalendarItem[]>(
    () =>
      events
        .filter((e) => e.startsAt && e.status !== 'CANCELLED')
        .map((e) => ({
          key: e.id,
          label: e.name,
          from: e.startsAt as string,
          to: e.endsAt || e.startsAt,
          tone: 'show' as const,
          href: `/events/${e.id}`,
        })),
    [events],
  );

  return (
    <AppShell title="Calendario">
      <div className="sx-stack page-workspace">
        <SectionHead title="Calendario" sub={`Shows de ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}`}>
          <Link className="btn-quiet" href="/events">
            Ver lista
          </Link>
        </SectionHead>
        {loading ? <LoadingBlock rows={6} label="Cargando calendario…" /> : <MonthCalendar items={items} />}
      </div>
    </AppShell>
  );
}
