'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { FlashMessage, FormGrid } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

export default function NewEventPage() {
  const { entity } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    artist: '',
    promoter: '',
    venue: '',
    city: 'Puebla',
    startsAt: '',
    campaignType: 'NONE',
    notes: '',
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/events', {
        method: 'POST',
        body: JSON.stringify({ ...form, entity }),
      });
      router.push(`/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setBusy(false);
    }
  }

  const entityLabel = entity === 'ARTA' ? 'Arta' : 'Auditorio';

  return (
    <AppShell title="Nuevo evento">
      <div className="panel panel--narrow">
        <div className="panel-head">
          <h2>Crear en {entityLabel}</h2>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
            Al crear el evento se instancian automáticamente todas las plantillas de checklist para
            esta entidad.
          </p>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Nombre del evento / concierto
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Concierto en Explanada"
              />
            </label>
            <FormGrid>
              <label>
                Artista
                <input
                  value={form.artist}
                  onChange={(e) => setForm({ ...form, artist: e.target.value })}
                />
              </label>
              <label>
                Promotor
                <input
                  value={form.promoter}
                  onChange={(e) => setForm({ ...form, promoter: e.target.value })}
                />
              </label>
            </FormGrid>
            <FormGrid>
              <label>
                Venue
                <input
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                />
              </label>
              <label>
                Ciudad
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
            </FormGrid>
            <FormGrid>
              <label>
                Fecha inicio
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </label>
              <label>
                Campaña
                <select
                  value={form.campaignType}
                  onChange={(e) => setForm({ ...form, campaignType: e.target.value })}
                >
                  <option value="NONE">Sin campaña</option>
                  <option value="INTERNAL">Interna (Melissa / Will)</option>
                  <option value="EXTERNAL">Externa</option>
                </select>
              </label>
            </FormGrid>
            <label>
              Notas
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Contexto, restricciones o acuerdos previos…"
              />
            </label>
            {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}
            <div className="row" style={{ marginTop: '0.25rem' }}>
              <button className="btn" disabled={busy} type="submit">
                {busy ? 'Creando…' : 'Crear evento + checklists'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
