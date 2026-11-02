'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { EventWitnessPanel } from '@/components/events/lazy-panels';
import { userHasPermission } from '@/lib/access-matrix';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type WitnessEvent = {
  id: string;
  name: string;
  entity: string;
  status?: string;
  startsAt?: string | null;
  count: number;
};

function dayLabel(iso?: string | null) {
  if (!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Testigos de publicidad fuera del evento: la pantalla del practicante, que no abre eventos.
 * Elige el show y sube ahí mismo.
 */
export default function TestigosPage() {
  const { entity, user } = useUser();
  const [events, setEvents] = useState<WitnessEvent[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' | 'info' | 'warn' } | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api<WitnessEvent[]>(`/testigos/events?entity=${entity}`);
      setEvents(rows);
      setEventId((prev) => (rows.some((e) => e.id === prev) ? prev : rows[0]?.id ?? ''));
    } catch (e) {
      setEvents([]);
      setMsg({ text: e instanceof Error ? e.message : 'No se pudieron cargar los eventos', variant: 'error' });
    }
  }, [entity]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = events?.find((e) => e.id === eventId);
  const canEdit = userHasPermission(user?.roleKey || '', user?.permissions || [], ['testigos.edit', 'everything']);

  return (
    <AppShell title="Testigos de publicidad">
      <div className="stack page-workspace">
        <PageHeader
          title="Testigos de publicidad"
          description="Sube la evidencia de cada anuncio al show que le toca."
        />
        {msg ? (
          <FlashMessage variant={msg.variant} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {events === null ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
        ) : !events.length ? (
          <div className="surface">
            <EmptyLite icon="+" title="Sin eventos" text="Cuando haya shows en este negocio, aparecerán aquí." />
          </div>
        ) : (
          <>
            <label className="fx-field witness-picker">
              <span>Evento</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {dayLabel(e.startsAt)} ({e.count})
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <EventWitnessPanel
                key={selected.id}
                eventId={selected.id}
                closed={selected.status === 'CANCELLED'}
                canEdit={canEdit}
                flash={(text, variant = 'success') => setMsg({ text, variant })}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
