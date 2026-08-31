'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import {
  FieldCheck,
  FieldSearch,
  FieldSelect,
  FlashMessage,
  FormGrid,
  PageHeader,
  FilterBar,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

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

const SCOPE_OPTIONS = ['files', 'checklists', 'hospitality'] as const;

function flashVariant(msg: string): 'info' | 'success' | 'error' | 'warn' {
  if (/error|inválid/i.test(msg)) return 'error';
  if (/cread|rotad|copiad/i.test(msg)) return 'success';
  if (/única vez|guárdalo|cópialo/i.test(msg)) return 'warn';
  return 'info';
}

export default function VendorPinsPage() {
  const { entity, user } = useUser();
  const canPin = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'vendor.pin',
    'everything',
  ]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [eventId, setEventId] = useState('');
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    label: '',
    pin: '',
    scopes: ['files', 'checklists'] as string[],
    expiresAt: '',
  });
  const [revealed, setRevealed] = useState<{ pin: string; portalPath: string } | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [rotatePin, setRotatePin] = useState('');

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

  const eventOptions = useMemo(
    () => events.map((ev) => ({ value: ev.id, label: ev.name })),
    [events],
  );

  const filteredPins = useMemo(() => {
    if (!q.trim()) return pins;
    const n = q.toLowerCase();
    return pins.filter(
      (p) =>
        p.label.toLowerCase().includes(n) ||
        p.scopes.some((s) => s.toLowerCase().includes(n)) ||
        p.id.toLowerCase().includes(n),
    );
  }, [pins, q]);

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
    if (!rotatePin || rotatePin.length < 4) {
      setMsg('PIN de rotación inválido (mín. 4 caracteres)');
      return;
    }
    try {
      const res = await api<{ pin: string; portalPath: string }>(`/vendor/pins/${id}/rotate`, {
        method: 'POST',
        body: JSON.stringify({ pin: rotatePin }),
      });
      setRevealed({ pin: res.pin, portalPath: res.portalPath });
      setMsg('PIN rotado — cópialo ahora');
      setRotateId(null);
      setRotatePin('');
      await loadPins(eventId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al rotar');
    }
  }

  return (
    <AppShell title="PIN proveedores">
      <div className="stack page-workspace">
        <PageHeader description="PINs de acceso limitado para proveedores (archivos / checklists / hospitality). Portal público en /v/[pinId]." />

        {msg ? (
          <FlashMessage variant={flashVariant(msg)} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {revealed ? (
          <FlashMessage variant="warn">
            <div className="credential-strip">
              <span>
                <strong>PIN (única vez):</strong> <code>{revealed.pin}</code>
              </span>
              <a className="btn ghost btn-sm" href={revealed.portalPath} target="_blank" rel="noreferrer">
                Abrir portal
              </a>
              <button
                className="btn ghost btn-sm"
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
          </FlashMessage>
        ) : null}

        {loading && !events.length ? (
          <LoadingBlock rows={4} label="Cargando eventos…" />
        ) : (
          <div className="dash-split">
            {canPin ? (
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
                      <FieldSelect
                        value={eventId}
                        onChange={setEventId}
                        options={eventOptions}
                      />
                    </label>
                    <FormGrid cols={2}>
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
                    </FormGrid>
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
                        {SCOPE_OPTIONS.map((s) => (
                          <FieldCheck
                            key={s}
                            label={s}
                            checked={form.scopes.includes(s)}
                            onChange={(checked) => {
                              const next = checked
                                ? [...form.scopes, s]
                                : form.scopes.filter((x) => x !== s);
                              setForm({ ...form, scopes: next.length ? next : ['files'] });
                            }}
                          />
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
            ) : null}

            <div className="panel">
              <div className="panel-head">
                <h2>PINs del evento · {pins.length}</h2>
              </div>
              <div className="panel-body">
                <FilterBar meta={`${filteredPins.length} de ${pins.length} PINs`}>
                  {!canPin ? (
                    <FieldSelect
                      value={eventId}
                      onChange={setEventId}
                      options={eventOptions}
                      label="Evento"
                    />
                  ) : null}
                  <FieldSearch
                    value={q}
                    onChange={setQ}
                    placeholder="Buscar por etiqueta o scope…"
                    label="Buscar PINs"
                  />
                </FilterBar>

                {!pins.length ? (
                  <EmptyState
                    title="Sin PINs para este evento"
                    description="Genera un PIN con scopes y, si aplica, fecha de expiración."
                  />
                ) : !filteredPins.length ? (
                  <EmptyState title="Sin coincidencias" description="Prueba otro término de búsqueda." />
                ) : (
                  <>
                    {canPin && rotateId ? (
                      <form
                        className="credential-rotate form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          rotate(rotateId);
                        }}
                      >
                        <label>
                          Nuevo PIN (mín. 4 caracteres)
                          <input
                            required
                            minLength={4}
                            value={rotatePin}
                            onChange={(e) => setRotatePin(e.target.value)}
                            autoFocus
                          />
                        </label>
                        <div className="row">
                          <button className="btn btn-sm" type="submit">
                            Confirmar rotación
                          </button>
                          <button
                            className="btn ghost btn-sm"
                            type="button"
                            onClick={() => {
                              setRotateId(null);
                              setRotatePin('');
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : null}
                    <div className="table-wrap">
                      <table className="table">
                    <thead>
                      <tr>
                        <th>Etiqueta</th>
                        <th>Scopes</th>
                        <th>Estado</th>
                        <th>Último uso</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPins.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.label}</strong>
                            <div className="muted">
                              <code>/v/{p.id}</code>
                            </div>
                          </td>
                          <td>{p.scopes.join(', ')}</td>
                          <td>
                            <StatusBadge
                              value={p.active ? 'healthy' : 'critical'}
                              kind="risk"
                            />
                          </td>
                          <td className="muted">
                            {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            {canPin ? (
                            <div className="row row--tight">
                              <button
                                className="btn ghost btn-sm"
                                type="button"
                                onClick={() => {
                                  setRotateId(p.id);
                                  setRotatePin('');
                                }}
                              >
                                Rotar PIN
                              </button>
                              {p.active ? (
                                <button
                                  className="btn ghost btn-sm btn-danger"
                                  type="button"
                                  onClick={() => deactivate(p.id)}
                                >
                                  Desactivar
                                </button>
                              ) : null}
                            </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
