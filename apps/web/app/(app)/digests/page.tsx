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
import { StatusBadge } from '@/components/ui/StatusBadge';
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
  'digest.daily': 'Digest diario',
  'ticketing.sync': 'Sync boletera',
  'webhook.retry': 'Reintento webhook',
  'automation.scan': 'Scan automatizaciones',
};

const STATUS_LABEL: Record<string, string> = {
  done: 'Listo',
  failed: 'Falló',
  running: 'Corriendo',
  pending: 'Pendiente',
  sent: 'Enviado',
};

function jobStatusBadge(status: string) {
  if (status === 'done') return <StatusBadge value="ACTIVE" kind="event" />;
  if (status === 'failed') return <StatusBadge value="REJECTED" kind="po" />;
  if (status === 'pending') return <StatusBadge value="PENDING" kind="po" />;
  if (status === 'running') return <span className="badge warn">{STATUS_LABEL.running}</span>;
  return <span className="badge">{STATUS_LABEL[status] || status}</span>;
}

function outboxStatusBadge(status: string) {
  if (status === 'sent') return <StatusBadge value="PAID" kind="po" />;
  if (status === 'failed') return <StatusBadge value="REJECTED" kind="po" />;
  if (status === 'pending') return <StatusBadge value="PENDING" kind="po" />;
  return <span className="badge">{STATUS_LABEL[status] || status}</span>;
}

export default function DigestsPage() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [msg, setMsg] = useState('');
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
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function runDaily() {
    setMsg('');
    setBusy(true);
    try {
      await api('/digests/run-daily', { method: 'POST' });
      setMsg('Digest diario ejecutado');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function flush() {
    setMsg('');
    setBusy(true);
    try {
      const res = await api<{ sent: number; mode?: string }>('/digests/flush-outbox', {
        method: 'POST',
      });
      setMsg(`Outbox flush · ${res.sent} enviados${res.mode ? ` (${res.mode})` : ''}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
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

  const msgVariant =
    msg === 'Digest diario ejecutado' || msg.startsWith('Outbox flush') ? 'success' : 'error';

  return (
    <AppShell title="Resúmenes">
      <div className="stack page-workspace">
        <PageHeader
          description="Digest operativo diario por organización (riesgo, aging OC, firmas). Outbox de email con SMTP si hay SMTP_HOST; si no, modo log-only."
        >
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" type="button" disabled={busy} onClick={() => runDaily()}>
              {busy ? 'Ejecutando…' : 'Ejecutar digest ahora'}
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => flush()}>
              Flush outbox
            </button>
          </div>
        </PageHeader>
        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={3} />
            <LoadingBlock rows={4} label="Cargando jobs…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Jobs recientes</div>
                <div className="value">{jobs.length}</div>
              </div>
              <div className={`kpi ${failedJobs ? 'kpi--danger' : ''}`}>
                <div className="label">Jobs fallidos</div>
                <div className="value">{failedJobs}</div>
              </div>
              <div className={`kpi ${pendingOut ? 'kpi--danger' : ''}`}>
                <div className="label">Outbox pendiente/fallo</div>
                <div className="value">{pendingOut}</div>
              </div>
            </div>

            <div className="dash-split">
              <div className="panel">
                <div className="panel-head">
                  <h2>Job runs · {jobs.length}</h2>
                </div>
                <div className="panel-body">
                  {!jobs.length ? (
                    <EmptyState
                      title="Sin jobs aún"
                      description="Ejecuta el digest diario o espera el cron de las 8:00."
                    />
                  ) : (
                    <>
                      <FilterBar meta={`${filteredJobs.length} de ${jobs.length} jobs`}>
                        <FieldSelect
                          value={jobFilter}
                          onChange={setJobFilter}
                          label="Filtrar jobs por estado"
                          options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'done', label: 'Listos' },
                            { value: 'failed', label: 'Fallidos' },
                            { value: 'running', label: 'Corriendo' },
                            { value: 'pending', label: 'Pendientes' },
                          ]}
                        />
                      </FilterBar>
                      {!filteredJobs.length ? (
                        <EmptyState
                          title="Sin coincidencias"
                          description="Cambia el filtro de estado."
                        />
                      ) : (
                        <div className="table-wrap">
                          <table className="table table-sticky">
                            <thead>
                              <tr>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th className="num">Intentos</th>
                                <th>Creado</th>
                                <th>Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredJobs.map((j) => (
                                <tr key={j.id}>
                                  <td>{KIND_LABEL[j.kind] || j.kind}</td>
                                  <td>{jobStatusBadge(j.status)}</td>
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
                  <h2>Outbox · {outbox.length}</h2>
                </div>
                <div className="panel-body">
                  {!outbox.length ? (
                    <EmptyState
                      title="Outbox vacío"
                      description="Los digests generan filas de email aquí."
                    />
                  ) : (
                    <>
                      <FilterBar meta={`${filteredOutbox.length} de ${outbox.length} mensajes`}>
                        <FieldSearch
                          value={outboxQ}
                          onChange={setOutboxQ}
                          placeholder="Email o asunto…"
                          label="Buscar en outbox"
                          maxWidth={240}
                        />
                        <FieldSelect
                          value={outboxFilter}
                          onChange={setOutboxFilter}
                          label="Filtrar outbox por estado"
                          options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'pending', label: 'Pendientes' },
                            { value: 'sent', label: 'Enviados' },
                            { value: 'failed', label: 'Fallidos' },
                          ]}
                        />
                      </FilterBar>
                      {!filteredOutbox.length ? (
                        <EmptyState
                          title="Sin coincidencias"
                          description="Ajusta búsqueda o filtro de estado."
                        />
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
                                  <td>{outboxStatusBadge(o.status)}</td>
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
