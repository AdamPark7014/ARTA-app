'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  FieldCheck,
  FieldSearch,
  FieldSelect,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
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

/** Avisos que el sistema sabe mandar, con el nombre que se ve en pantalla. */
const EVENT_LABELS: Record<string, string> = {
  'automation.alert': 'Alertas automáticas',
  'event.risk': 'Eventos en riesgo',
  'po.aging': 'Órdenes de compra atrasadas',
  'checklist.signature_backlog': 'Firmas pendientes',
  'system.scan': 'Revisión del sistema',
};
const EVENT_OPTS = Object.keys(EVENT_LABELS);

const eventLabel = (ev: string) => EVENT_LABELS[ev] || 'Aviso del sistema';

type Flash = { text: string; tone: 'success' | 'warn' | 'error' };

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Flash | null>(null);
  const [q, setQ] = useState('');
  const [deliveryQ, setDeliveryQ] = useState('');
  const [deliveryResult, setDeliveryResult] = useState<'all' | 'ok' | 'fail'>('all');
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
      setMsg({ text: e.message, tone: 'error' });
      setLoading(false);
    });
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const created = await api<Endpoint>('/webhooks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setMsg(
        created.secret
          ? {
              text: `Conexión creada. Guarda esta clave, no se vuelve a mostrar: ${created.secret}`,
              tone: 'warn',
            }
          : { text: 'Conexión creada', tone: 'success' },
      );
      setForm({ name: '', url: '', events: ['automation.alert'] });
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo crear', tone: 'error' });
    }
  }

  async function testDispatch() {
    try {
      const res = await api<{ delivered: number }>('/webhooks/test', { method: 'POST' });
      setMsg({
        text:
          res.delivered === 1 ? 'Prueba enviada a 1 conexión' : `Prueba enviada a ${res.delivered} conexiones`,
        tone: 'success',
      });
      await load();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo enviar la prueba', tone: 'error' });
    }
  }

  const filteredEndpoints = useMemo(() => {
    if (!q.trim()) return endpoints;
    const n = q.toLowerCase();
    return endpoints.filter(
      (ep) =>
        ep.name.toLowerCase().includes(n) ||
        ep.url.toLowerCase().includes(n) ||
        ep.events.some((ev) => eventLabel(ev).toLowerCase().includes(n)),
    );
  }, [endpoints, q]);

  const filteredDeliveries = useMemo(() => {
    let list = deliveries;
    if (deliveryResult === 'ok') list = list.filter((d) => d.success);
    if (deliveryResult === 'fail') list = list.filter((d) => !d.success);
    if (deliveryQ.trim()) {
      const n = deliveryQ.toLowerCase();
      list = list.filter(
        (d) =>
          eventLabel(d.event).toLowerCase().includes(n) ||
          d.endpoint.name.toLowerCase().includes(n) ||
          (d.error || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [deliveries, deliveryQ, deliveryResult]);

  return (
    <AppShell title="Webhooks">
      <div className="stack page-workspace">
        <PageHeader description="Avisa a otros sistemas cuando algo necesita atención: eventos en riesgo, órdenes de compra atrasadas o firmas pendientes. Se revisa cada hora y cada aviso va firmado.">
          <button className="btn ghost" type="button" onClick={() => testDispatch()}>
            Enviar prueba
          </button>
        </PageHeader>
        {msg ? (
          <FlashMessage variant={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {loading && !endpoints.length && !deliveries.length ? (
          <>
            <LoadingKpis count={2} />
            <LoadingBlock rows={4} label="Cargando conexiones…" />
          </>
        ) : (
          <>
            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Nueva conexión</h2>
                </div>
                <div className="panel-body">
                  <form className="form" onSubmit={onCreate}>
                    <FormGrid cols={2}>
                      <label>
                        Nombre
                        <input
                          required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </label>
                      <label>
                        Dirección
                        <input
                          required
                          type="url"
                          placeholder="https://…"
                          value={form.url}
                          onChange={(e) => setForm({ ...form, url: e.target.value })}
                        />
                      </label>
                    </FormGrid>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Avisos
                      </div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {EVENT_OPTS.map((ev) => (
                          <FieldCheck
                            key={ev}
                            checked={form.events.includes(ev)}
                            onChange={(checked) =>
                              setForm((f) => ({
                                ...f,
                                events: checked
                                  ? [...f.events, ev]
                                  : f.events.filter((x) => x !== ev),
                              }))
                            }
                            label={eventLabel(ev)}
                          />
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
                  <h2>Conexiones · {endpoints.length}</h2>
                </div>
                <div className="panel-body">
                  {!endpoints.length ? (
                    <EmptyState
                      title="Sin conexiones"
                      description="Crea una para recibir los avisos en otro sistema."
                    />
                  ) : (
                    <>
                      <FilterBar meta={`${filteredEndpoints.length} de ${endpoints.length}`}>
                        <FieldSearch
                          value={q}
                          onChange={setQ}
                          placeholder="Nombre, dirección o aviso…"
                          label="Buscar conexión"
                          maxWidth={240}
                        />
                      </FilterBar>
                      {!filteredEndpoints.length ? (
                        <EmptyState title="Sin coincidencias" description="Prueba con otra palabra." />
                      ) : (
                        <div className="table-wrap">
                          <table className="table table-sticky">
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>Dirección</th>
                                <th>Avisos</th>
                                <th className="num">Envíos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredEndpoints.map((ep) => (
                                <tr key={ep.id}>
                                  <td>
                                    <strong>{ep.name}</strong>{' '}
                                    <span className={`badge ${ep.active ? 'ok' : ''}`}>
                                      {ep.active ? 'Activa' : 'Pausada'}
                                    </span>
                                  </td>
                                  <td className="muted" style={{ fontSize: 12 }}>
                                    {ep.url}
                                  </td>
                                  <td className="muted" style={{ fontSize: 12 }}>
                                    {ep.events.map(eventLabel).join(' · ')}
                                  </td>
                                  <td className="num">{ep._count?.deliveries ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Envíos recientes · {filteredDeliveries.length}</h2>
              </div>
              <div className="panel-body">
                {!deliveries.length ? (
                  <EmptyState
                    title="Sin envíos todavía"
                    description="Usa «Enviar prueba» o espera la revisión de cada hora."
                  />
                ) : (
                  <>
                    <FilterBar meta={`${filteredDeliveries.length} de ${deliveries.length}`}>
                      <FieldSearch
                        value={deliveryQ}
                        onChange={setDeliveryQ}
                        placeholder="Aviso, conexión o error…"
                        label="Buscar envío"
                        maxWidth={240}
                      />
                      <FieldSelect
                        value={deliveryResult}
                        onChange={(v) => setDeliveryResult(v as typeof deliveryResult)}
                        label="Filtrar por resultado"
                        options={[
                          { value: 'all', label: 'Todos' },
                          { value: 'ok', label: 'Entregados' },
                          { value: 'fail', label: 'Fallidos' },
                        ]}
                      />
                      <button className="btn ghost" type="button" disabled={loading} onClick={() => load()}>
                        {loading ? 'Actualizando…' : 'Actualizar'}
                      </button>
                    </FilterBar>
                    {!filteredDeliveries.length ? (
                      <EmptyState title="Sin coincidencias" description="Ajusta la búsqueda o el filtro." />
                    ) : (
                      <div className="table-wrap">
                        <table className="table table-sticky">
                          <thead>
                            <tr>
                              <th>Cuándo</th>
                              <th>Conexión</th>
                              <th>Aviso</th>
                              <th>Resultado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDeliveries.map((d) => (
                              <tr key={d.id}>
                                <td className="muted">
                                  {new Date(d.createdAt).toLocaleString('es-MX')}
                                </td>
                                <td>{d.endpoint.name}</td>
                                <td>{eventLabel(d.event)}</td>
                                <td>
                                  {d.success ? (
                                    <span className="badge ok">Entregado</span>
                                  ) : (
                                    <>
                                      <span className="badge danger">No llegó</span>
                                      {d.error ? (
                                        <div className="muted" style={{ fontSize: 11 }}>
                                          {d.error}
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
