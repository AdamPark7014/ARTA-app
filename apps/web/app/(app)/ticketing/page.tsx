'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Zone = { zona: string; aforo: number; precio: number };
type Setup = {
  id: string;
  boletera: string;
  holdUntil?: string | null;
  artist?: string | null;
  promoter?: string | null;
  notes?: string | null;
  zonesJson: Zone[];
  event: { id: string; name: string; entity: string };
};

type EventOpt = { id: string; name: string; entity: string };

const DEFAULT_ZONES: Zone[] = [
  { zona: 'Diamante', aforo: 0, precio: 0 },
  { zona: 'Oro', aforo: 0, precio: 0 },
  { zona: 'Plata', aforo: 0, precio: 0 },
  { zona: 'Bronce', aforo: 0, precio: 0 },
];

export default function TicketingPage() {
  const { entity } = useUser();
  const [rows, setRows] = useState<Setup[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    eventId: '',
    boletera: 'Arema',
    holdUntil: '',
    artist: '',
    promoter: '',
    notes: '',
  });
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [msg, setMsg] = useState('');

  async function load() {
    const [t, e] = await Promise.all([
      api<Setup[]>('/ticketing'),
      api<EventOpt[]>(`/events?entity=${entity}`),
    ]);
    setRows(t.filter((r) => r.event.entity === entity));
    setEvents(e);
    if (!form.eventId && e[0]) setForm((f) => ({ ...f, eventId: e[0].id }));
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  function startEdit(r: Setup) {
    setEditingId(r.id);
    setForm({
      eventId: r.event.id,
      boletera: r.boletera,
      holdUntil: r.holdUntil ? r.holdUntil.slice(0, 10) : '',
      artist: r.artist || '',
      promoter: r.promoter || '',
      notes: r.notes || '',
    });
    setZones(
      (r.zonesJson || []).map((z) => ({
        zona: z.zona,
        aforo: Number(z.aforo || 0),
        precio: Number(z.precio || 0),
      })),
    );
  }

  function resetForm() {
    setEditingId(null);
    setZones(DEFAULT_ZONES.map((z) => ({ ...z })));
    setForm((f) => ({
      ...f,
      boletera: 'Arema',
      holdUntil: '',
      artist: '',
      promoter: '',
      notes: '',
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    const payload = {
      boletera: form.boletera,
      holdUntil: form.holdUntil || undefined,
      artist: form.artist || undefined,
      promoter: form.promoter || undefined,
      notes: form.notes || undefined,
      zonesJson: zones,
    };
    try {
      if (editingId) {
        await api(`/ticketing/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Boletera actualizada');
      } else {
        await api(`/ticketing/event/${form.eventId}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Boletera creada');
      }
      resetForm();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function remove(id: string) {
    await api(`/ticketing/${id}`, { method: 'DELETE' });
    if (editingId === id) resetForm();
    await load();
  }

  return (
    <AppShell title="Boletera">
      <div className="stack">
        <p className="muted">
          Creación / edición · Arema / eTicket / otra · zona / aforo / precio · hold.
        </p>

        <div className="panel">
          <div className="panel-head">
            <h2>{editingId ? 'Editar configuración' : 'Nueva configuración'}</h2>
            {editingId ? (
              <button className="btn ghost" type="button" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            <form className="form" onSubmit={onSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  Evento
                  <select
                    required
                    disabled={!!editingId}
                    value={form.eventId}
                    onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  >
                    <option value="">Selecciona…</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Boletera
                  <select
                    value={form.boletera}
                    onChange={(e) => setForm({ ...form, boletera: e.target.value })}
                  >
                    <option>Arema</option>
                    <option>eTicket</option>
                    <option>Otra</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <label>
                  Hold hasta
                  <input
                    type="date"
                    value={form.holdUntil}
                    onChange={(e) => setForm({ ...form, holdUntil: e.target.value })}
                  />
                </label>
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
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th>Aforo</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z, i) => (
                    <tr key={z.zona}>
                      <td>{z.zona}</td>
                      <td>
                        <input
                          type="number"
                          value={z.aforo}
                          onChange={(e) => {
                            const next = [...zones];
                            next[i] = { ...z, aforo: Number(e.target.value) };
                            setZones(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={z.precio}
                          onChange={(e) => {
                            const next = [...zones];
                            next[i] = { ...z, precio: Number(e.target.value) };
                            setZones(next);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <label>
                Notas
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>

              {msg ? <div className="muted">{msg}</div> : null}
              <button className="btn" type="submit">
                {editingId ? 'Actualizar boletera' : 'Guardar boletera'}
              </button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Configuraciones · {entity}</h2>
          </div>
          <div className="panel-body">
            <table className="table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Boletera</th>
                  <th>Hold</th>
                  <th>Zonas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/events/${r.event.id}`}>{r.event.name}</Link>
                    </td>
                    <td>{r.boletera}</td>
                    <td>{r.holdUntil ? new Date(r.holdUntil).toLocaleDateString('es-MX') : '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {(r.zonesJson || []).map((z) => `${z.zona}:${z.aforo}`).join(' · ')}
                    </td>
                    <td className="row">
                      <button className="btn ghost" type="button" onClick={() => startEdit(r)}>
                        Editar
                      </button>
                      <button className="btn ghost" type="button" onClick={() => remove(r.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
