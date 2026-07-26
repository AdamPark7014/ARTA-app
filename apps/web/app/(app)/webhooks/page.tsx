'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';

type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  _count?: { deliveries: number };
};

type Delivery = {
  id: string;
  event: string;
  success: boolean;
  statusCode?: number | null;
  error?: string | null;
  createdAt: string;
  endpoint: { name: string; url: string };
};

const EVENT_OPTS = [
  'automation.alert',
  'event.risk',
  'po.aging',
  'checklist.signature_backlog',
  'system.scan',
];

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    name: '',
    url: '',
    events: ['automation.alert'] as string[],
  });

  async function load() {
    setLoading(true);
    try {
      const [e, d] = await Promise.all([
        api<Endpoint[]>('/webhooks'),
        api<Delivery[]>('/webhooks/deliveries?take=40'),
      ]);
      setEndpoints(e);
      setDeliveries(d);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => {
      setMsg(e.message);
      setLoading(false);
    });
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const created = await api<Endpoint>('/webhooks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setMsg(
        created.secret
          ? `Webhook creado. Guarda el secret: ${created.secret}`
          : 'Webhook creado',
      );
      setForm({ name: '', url: '', events: ['automation.alert'] });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function testDispatch() {
    const res = await api<{ delivered: number }>('/webhooks/test', { method: 'POST' });
    setMsg(`Test dispatch · entregados: ${res.delivered}`);
    await load();
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  }

  return (
    <AppShell title="Integraciones · Webhooks">
      <div className="stack page-workspace">
        <div className="page-intro">
          <p className="muted">
            Endpoints firmados (HMAC SHA-256) para alertas de riesgo, aging de OC y backlog de firmas.
            El cron horario dispara eventos cuando hay señales.
          </p>
          <button className="btn ghost" type="button" onClick={() => testDispatch()}>
            Probar dispatch
          </button>
        </div>
        {msg ? <div className="muted">{msg}</div> : null}

        {loading && !endpoints.length && !deliveries.length ? (
          <>
            <LoadingKpis count={2} />
            <LoadingBlock rows={4} label="Cargando webhooks…" />
          </>
        ) : (
          <>
            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Nuevo endpoint</h2>
                </div>
                <div className="panel-body">
                  <form className="form" onSubmit={onCreate}>
                    <label>
                      Nombre
                      <input
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </label>
                    <label>
                      URL
                      <input
                        required
                        type="url"
                        placeholder="https://…"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                      />
                    </label>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Eventos
                      </div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {EVENT_OPTS.map((ev) => (
                          <label key={ev} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={form.events.includes(ev)}
                              onChange={() => toggleEvent(ev)}
                            />
                            {ev}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button className="btn" type="submit" disabled={!form.events.length}>
                      Crear
                    </button>
                  </form>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Endpoints · {endpoints.length}</h2>
                </div>
                <div className="panel-body">
                  {!endpoints.length ? (
                    <EmptyState
                      title="Sin webhooks"
                      description="Crea un endpoint HMAC para recibir alertas de riesgo, aging OC y firmas."
                    />
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>URL</th>
                          <th>Eventos</th>
                          <th>Entregas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoints.map((ep) => (
                          <tr key={ep.id}>
                            <td>
                              <strong>{ep.name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {ep.active ? 'activo' : 'off'}
                              </div>
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {ep.url}
                            </td>
                            <td className="muted" style={{ fontSize: 11 }}>
                              {ep.events.join(', ')}
                            </td>
                            <td>{ep._count?.deliveries ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Entregas recientes</h2>
              </div>
              <div className="panel-body">
                {!deliveries.length ? (
                  <EmptyState
                    title="Sin entregas aún"
                    description="Usa “Probar dispatch” o espera el cron horario cuando haya señales."
                  />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Endpoint</th>
                        <th>Evento</th>
                        <th>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d) => (
                        <tr key={d.id}>
                          <td className="muted">
                            {new Date(d.createdAt).toLocaleString('es-MX')}
                          </td>
                          <td>{d.endpoint.name}</td>
                          <td>
                            <code>{d.event}</code>
                          </td>
                          <td>
                            <span className={`badge ${d.success ? 'ok' : 'danger'}`}>
                              {d.success ? `OK ${d.statusCode || ''}` : d.error || 'fail'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
