'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  FieldSearch,
  FieldSelect,
  FilterBar,
  FlashMessage,
  PageHeader,
} from '@/components/ui/PageChrome';
import { api } from '@/lib/api';

type JobRun = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  createdAt: string;
  resultJson?: Record<string, unknown> | null;
};

type OutboxRow = {
  id: string;
  channel: string;
  toAddr: string;
  subject: string;
  status: string;
  attempts: number;
  sentAt?: string | null;
  error?: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  'digest.daily': 'Resumen diario',
  'ticketing.sync': 'Sincronizar boletera',
  'webhook.retry': 'Reintento de aviso',
  'automation.scan': 'Revisión automática',
};

/** Estado → texto y color. Mismo vocabulario para tareas y correos. */
const STATUS: Record<string, { label: string; tone: string }> = {
  done: { label: 'Listo', tone: 'ok' },
  sent: { label: 'Enviado', tone: 'ok' },
  running: { label: 'En curso', tone: 'warn' },
  pending: { label: 'Pendiente', tone: 'warn' },
  failed: { label: 'Falló', tone: 'danger' },
};

function statusBadge(status: string) {
  const s = STATUS[status];
  return <span className={`badge ${s?.tone || ''}`}>{s?.label || 'Sin estado'}</span>;
}

type Flash = { text: string; tone: 'success' | 'error' };

export default function DigestsPage() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [msg, setMsg] = useState<Flash | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jobFilter, setJobFilter] = useState('all');
  const [outboxFilter, setOutboxFilter] = useState('all');
  const [outboxQ, setOutboxQ] = useState('');

  async function load() {
    const [j, o] = await Promise.all([
      api<JobRun[]>('/digests/jobs'),
      api<OutboxRow[]>('/digests/outbox'),
    ]);
    setJobs(j);
    setOutbox(o);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setMsg({ text: e.message, tone: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  async function runDaily() {
    setMsg(null);
    setBusy(true);
    try {
      await api('/digests/run-daily', { method: 'POST' });
      setMsg({ text: 'Resumen diario generado', tone: 'success' });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo generar', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function flush() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await api<{ sent: number }>('/digests/flush-outbox', { method: 'POST' });
      setMsg({
        text: res.sent === 1 ? '1 correo enviado' : `${res.sent} correos enviados`,
        tone: 'success',
      });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudieron enviar', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const failedJobs = jobs.filter((j) => j.status === 'failed').length;
  const pendingOut = outbox.filter((o) => o.status === 'pending' || o.status === 'failed').length;

  const filteredJobs = useMemo(() => {
    if (jobFilter === 'all') return jobs;
    return jobs.filter((j) => j.status === jobFilter);
  }, [jobs, jobFilter]);

  const filteredOutbox = useMemo(() => {
    let list = outbox;
    if (outboxFilter !== 'all') list = list.filter((o) => o.status === outboxFilter);
    if (outboxQ.trim()) {
      const n = outboxQ.toLowerCase();
      list = list.filter(
        (o) => o.toAddr.toLowerCase().includes(n) || o.subject.toLowerCase().includes(n),
      );
    }
    return list;
  }, [outbox, outboxFilter, outboxQ]);

  return (
    <AppShell title="Resúmenes">
      <div className="stack page-workspace">
        <PageHeader description="Cada mañana a las 8:00 se manda a dirección y gerencias un resumen de lo que necesita atención: eventos en riesgo, órdenes de compra atrasadas y firmas pendientes.">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" disabled={busy} onClick={() => runDaily()}>
              {busy ? 'Generando…' : 'Generar resumen ahora'}
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => flush()}>
              Enviar correos pendientes
            </button>
          </div>
        </PageHeader>
        {msg ? (
          <FlashMessage variant={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={3} />
            <LoadingBlock rows={4} label="Cargando resúmenes…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Ejecuciones recientes</div>
                <div className="value">{jobs.length}</div>
              </div>
              <div className={`kpi ${failedJobs ? 'kpi--danger' : ''}`}>
                <div className="label">Con error</div>
                <div className="value">{failedJobs}</div>
              </div>
              <div className={`kpi ${pendingOut ? 'kpi--danger' : ''}`}>
                <div className="label">Correos sin enviar</div>
                <div className="value">{pendingOut}</div>
              </div>
            </div>

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Ejecuciones · {jobs.length}</h2>
                </div>
                <div className="panel-body">
                  {!jobs.length ? (
                    <EmptyState
                      title="Nada ejecutado todavía"
                      description="Genera el resumen ahora o espera al de las 8:00."
                    />
                  ) : (
                    <>
                      <FilterBar meta={`${filteredJobs.length} de ${jobs.length}`}>
                        <FieldSelect
                          value={jobFilter}
                          onChange={setJobFilter}
                          label="Filtrar por estado"
                          options={[
                            { value: 'all', label: 'Todas' },
                            { value: 'done', label: 'Listas' },
                            { value: 'failed', label: 'Con error' },
                            { value: 'running', label: 'En curso' },
                            { value: 'pending', label: 'Pendientes' },
                          ]}
                        />
                      </FilterBar>
                      {!filteredJobs.length ? (
                        <EmptyState title="Sin coincidencias" description="Cambia el filtro de estado." />
                      ) : (
                        <div className="table-wrap">
                          <table className="table table-sticky">
                            <thead>
                              <tr>
                                <th>Qué</th>
                                <th>Estado</th>
                                <th className="num">Intentos</th>
                                <th>Cuándo</th>
                                <th>Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredJobs.map((j) => (
                                <tr key={j.id}>
                                  <td>{KIND_LABEL[j.kind] || 'Tarea del sistema'}</td>
                                  <td>{statusBadge(j.status)}</td>
                                  <td className="num">{j.attempts}</td>
                                  <td className="muted">{new Date(j.createdAt).toLocaleString('es-MX')}</td>
                                  <td className="muted">{j.error || '—'}</td>
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

              <div className="panel">
                <div className="panel-head">
                  <h2>Correos · {outbox.length}</h2>
                </div>
                <div className="panel-body">
                  {!outbox.length ? (
                    <EmptyState
                      title="Sin correos"
                      description="Cada resumen deja aquí los correos que manda."
                    />
                  ) : (
                    <>
                      <FilterBar meta={`${filteredOutbox.length} de ${outbox.length}`}>
                        <FieldSearch
                          value={outboxQ}
                          onChange={setOutboxQ}
                          placeholder="Correo o asunto…"
                          label="Buscar correo"
                          maxWidth={240}
                        />
                        <FieldSelect
                          value={outboxFilter}
                          onChange={setOutboxFilter}
                          label="Filtrar por estado"
                          options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'pending', label: 'Pendientes' },
                            { value: 'sent', label: 'Enviados' },
                            { value: 'failed', label: 'Con error' },
                          ]}
                        />
                      </FilterBar>
                      {!filteredOutbox.length ? (
                        <EmptyState title="Sin coincidencias" description="Ajusta la búsqueda o el filtro." />
                      ) : (
                        <div className="table-wrap">
                          <table className="table table-sticky">
                            <thead>
                              <tr>
                                <th>Para</th>
                                <th>Asunto</th>
                                <th>Estado</th>
                                <th>Enviado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredOutbox.map((o) => (
                                <tr key={o.id}>
                                  <td>{o.toAddr}</td>
                                  <td>{o.subject}</td>
                                  <td>{statusBadge(o.status)}</td>
                                  <td className="muted">
                                    {o.sentAt ? new Date(o.sentAt).toLocaleString('es-MX') : '—'}
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
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
