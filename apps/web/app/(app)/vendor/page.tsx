'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type EventOpt = { id: string; name: string; entity: string };
type Pin = {
  id: string;
  label: string;
  scopes: string[];
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
};

export default function VendorPinsPage() {
  const { entity } = useUser();
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [eventId, setEventId] = useState('');
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    label: '',
    pin: '',
    scopes: ['files', 'checklists'] as string[],
    expiresAt: '',
  });
  const [revealed, setRevealed] = useState<{ pin: string; portalPath: string } | null>(null);

  async function loadEvents() {
    setLoading(true);
    try {
      const e = await api<EventOpt[]>(`/events?entity=${entity}`);
      setEvents(e);
      if (!eventId && e[0]) setEventId(e[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function loadPins(id: string) {
    if (!id) {
      setPins([]);
      return;
    }
    const rows = await api<Pin[]>(`/vendor/event/${id}`);
    setPins(rows);
  }

  useEffect(() => {
    loadEvents().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    loadPins(eventId).catch((e) => setMsg(e.message));
  }, [eventId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setRevealed(null);
    try {
      const created = await api<{ pin: string; portalPath: string; id: string }>('/vendor/pins', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          label: form.label,
          pin: form.pin,
          scopes: form.scopes,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      setRevealed({ pin: created.pin, portalPath: created.portalPath });
      setForm({ label: '', pin: '', scopes: ['files', 'checklists'], expiresAt: '' });
      setMsg('PIN creado — guárdalo ahora (solo se muestra una vez)');
      await loadPins(eventId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function deactivate(id: string) {
    await api(`/vendor/pins/${id}`, { method: 'DELETE' });
    await loadPins(eventId);
  }

  async function rotate(id: string) {
    const next = window.prompt('Nuevo PIN (mín. 4 caracteres)');
    if (!next || next.length < 4) {
      setMsg('PIN de rotación inválido');
      return;
    }
    try {
      const res = await api<{ pin: string; portalPath: string }>(`/vendor/pins/${id}/rotate`, {
        method: 'POST',
        body: JSON.stringify({ pin: next }),
      });
      setRevealed({ pin: res.pin, portalPath: res.portalPath });
      setMsg('PIN rotado — cópialo ahora');
      await loadPins(eventId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al rotar');
    }
  }

  return (
    <AppShell title="Vendor PIN · Acceso externo">
      <div className="stack page-workspace">
        <div className="page-intro">
          <p className="muted">
            PINs de acceso limitado para proveedores (archivos / checklists / hospitality). Portal
            público en <code>/v/[pinId]</code>.
          </p>
        </div>
        {msg ? <div className="muted">{msg}</div> : null}
        {revealed ? (
          <div className="panel">
            <div className="panel-body row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>
                <strong>PIN (única vez):</strong> <code>{revealed.pin}</code>
              </span>
              <a className="btn ghost" href={revealed.portalPath} target="_blank" rel="noreferrer">
                Abrir portal
              </a>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  const url =
                    typeof window !== 'undefined'
                      ? `${window.location.origin}${revealed.portalPath}`
                      : revealed.portalPath;
                  navigator.clipboard
                    ?.writeText(`${url}\nPIN: ${revealed.pin}`)
                    .then(() => setMsg('Link + PIN copiados'))
                    .catch(() => undefined);
                }}
              >
                Copiar link + PIN
              </button>
            </div>
          </div>
        ) : null}

        {loading && !events.length ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
        ) : (
          <div className="dash-split">
            <div className="panel">
              <div className="panel-head">
                <h2>Nuevo PIN</h2>
              </div>
              <div className="panel-body">
                {!events.length ? (
                  <EmptyState
                    title="Sin eventos"
                    description="Crea un evento para emitir PINs de vendor."
                    actionHref="/events/new"
                    actionLabel="Crear evento"
                  />
                ) : (
                  <form className="form" onSubmit={onCreate}>
                    <label>
                      Evento
                      <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Etiqueta
                      <input
                        required
                        value={form.label}
                        onChange={(e) => setForm({ ...form, label: e.target.value })}
                        placeholder="Proveedor catering"
                      />
                    </label>
                    <label>
                      PIN (mín. 4)
                      <input
                        required
                        minLength={4}
                        value={form.pin}
                        onChange={(e) => setForm({ ...form, pin: e.target.value })}
                      />
                    </label>
                    <label>
                      Expira
                      <input
                        type="date"
                        value={form.expiresAt}
                        onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                      />
                    </label>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Scopes
                      </div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                        {(['files', 'checklists', 'hospitality'] as const).map((s) => (
                          <label key={s} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={form.scopes.includes(s)}
                              onChange={() => {
                                const next = form.scopes.includes(s)
                                  ? form.scopes.filter((x) => x !== s)
                                  : [...form.scopes, s];
                                setForm({ ...form, scopes: next.length ? next : ['files'] });
                              }}
                            />
                            {s}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button className="btn" type="submit">
                      Generar PIN
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>PINs del evento · {pins.length}</h2>
              </div>
              <div className="panel-body">
                {!pins.length ? (
                  <EmptyState
                    title="Sin PINs para este evento"
                    description="Genera un PIN con scopes y, si aplica, fecha de expiración."
                  />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Scopes</th>
                        <th>Activo</th>
                        <th>Último uso</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pins.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.label}</strong>
                            <div className="muted">
                              <code>/v/{p.id}</code>
                            </div>
                          </td>
                          <td>{p.scopes.join(', ')}</td>
                          <td>{p.active ? 'sí' : 'no'}</td>
                          <td className="muted">
                            {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              <button className="btn ghost" type="button" onClick={() => rotate(p.id)}>
                                Rotar PIN
                              </button>
                              {p.active ? (
                                <button
                                  className="btn ghost"
                                  type="button"
                                  onClick={() => deactivate(p.id)}
                                >
                                  Desactivar
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
