'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import {
  EventFields,
  emptyEventForm,
  eventFormProblem,
  eventPayload,
} from '@/components/events/EventFields';
import { FlashMessage } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

export default function NewEventPage() {
  const { entity } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyEventForm());

  const problem = eventFormProblem(form);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { endsAt, ...payload } = eventPayload(form);
      const created = await api<{ id: string }>('/events', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          ...(endsAt ? { endsAt } : {}),
          functions: payload.functions ?? undefined,
          entity,
        }),
      });
      router.push(`/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el evento');
      setBusy(false);
    }
  }

  return (
    <AppShell title="Nuevo evento">
      <div className="page-workspace new-event">
        <form className="surface new-event__card" onSubmit={onSubmit}>
          <header className="new-event__head">
            <p className="new-event__eyebrow">{entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'}</p>
            <h2 className="new-event__title">Crear evento</h2>
          </header>

          <EventFields value={form} onChange={setForm} autoFocus />

          {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

          <div className="fx-actions">
            <Link className="btn ghost" href="/events">
              Cancelar
            </Link>
            <button className="btn" type="submit" disabled={busy || !!problem}>
              {busy ? 'Creando…' : 'Crear evento'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
