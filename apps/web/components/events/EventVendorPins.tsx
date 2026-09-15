'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Pill } from '@/components/ui/Lite';
import { api } from '@/lib/api';

type VendorPin = { id: string; label: string; scopes: string[]; active: boolean; expiresAt?: string | null };

const SCOPES: Array<{ key: string; label: string }> = [
  { key: 'files', label: 'Archivos' },
  { key: 'checklists', label: 'Formatos' },
  { key: 'hospitality', label: 'Hospedaje' },
];

/**
 * Enlace + PIN para proveedores. Vivía cableado en la página del evento con
 * seis estados sueltos; aquí se queda con lo suyo y la página no lo sabe.
 */
export function EventVendorPins({
  eventId,
  closed,
  flash,
}: {
  eventId: string;
  closed: boolean;
  flash: (text: string, variant?: 'success' | 'error' | 'info' | 'warn') => void;
}) {
  const [pins, setPins] = useState<VendorPin[]>([]);
  const [form, setForm] = useState({ label: '', pin: '', expiresAt: '', scopes: ['files', 'checklists'] });
  const [revealed, setRevealed] = useState<{ path: string; pin: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<VendorPin[]>(`/vendor/event/${eventId}`)
      .then(setPins)
      .catch(() => undefined);
  }, [eventId]);

  async function create() {
    if (form.pin.length < 4) {
      flash('El PIN lleva al menos 4 caracteres', 'warn');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ portalPath: string; pin: string }>('/vendor/pins', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          label: form.label.trim() || 'Proveedor',
          pin: form.pin,
          scopes: form.scopes.length ? form.scopes : ['files'],
          expiresAt: form.expiresAt || undefined,
        }),
      });
      setRevealed({ path: res.portalPath, pin: res.pin });
      setForm({ label: '', pin: '', expiresAt: '', scopes: ['files', 'checklists'] });
      setPins(await api<VendorPin[]>(`/vendor/event/${eventId}`));
      flash('PIN creado — cópialo ahora, no se vuelve a mostrar');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo crear el PIN', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await api(`/vendor/pins/${id}`, { method: 'DELETE' });
      setPins((prev) => prev.map((p) => (p.id === id ? { ...p, active: false } : p)));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo desactivar', 'error');
    }
  }

  return (
    <div className="sx-stack">
      {!closed ? (
        <div className="fx">
          <div className="fx-grid">
            <label>
              Proveedor
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Catering externo"
              />
            </label>
            <label>
              PIN
              <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="Mín. 4" />
            </label>
            <label>
              Expira
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
          </div>
          <div className="toolbar-row">
            <div className="choice" role="group" aria-label="Qué puede ver">
              {SCOPES.map((s) => {
                const on = form.scopes.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`choice__opt ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      setForm({
                        ...form,
                        scopes: on ? form.scopes.filter((x) => x !== s.key) : [...form.scopes, s.key],
                      })
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-sm" type="button" disabled={busy} onClick={create}>
              Generar enlace
            </button>
          </div>
        </div>
      ) : null}

      {revealed ? (
        <div className="credential-strip">
          <span>
            PIN: <code>{revealed.pin}</code>
          </span>
          <Link className="btn-quiet" href={revealed.path} target="_blank">
            Abrir portal
          </Link>
          <button
            className="btn-quiet"
            type="button"
            onClick={() => {
              const url = `${window.location.origin}${revealed.path}`;
              navigator.clipboard?.writeText(`${url}\nPIN: ${revealed.pin}`).catch(() => undefined);
            }}
          >
            Copiar
          </button>
        </div>
      ) : null}

      {pins.length ? (
        <div className="dtable-wrap">
          <table className="dtable">
            <tbody>
              {pins.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td className="is-muted t-small">
                    {p.scopes.map((s) => SCOPES.find((x) => x.key === s)?.label || s).join(' · ')}
                  </td>
                  <td>
                    <Pill tone={p.active ? 'ok' : 'draft'}>{p.active ? 'Activo' : 'Inactivo'}</Pill>
                  </td>
                  <td className="col-act">
                    {p.active && !closed ? (
                      <button className="btn-quiet" type="button" onClick={() => deactivate(p.id)}>
                        Desactivar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
