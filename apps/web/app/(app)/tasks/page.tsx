'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Task = {
  id: string;
  title: string;
  module?: string | null;
  status: string;
  dueAt?: string | null;
  event?: { id: string; name: string; status: string };
};

export default function TasksPage() {
  const { entity } = useUser();
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    try {
      const mine = await api<Task[]>('/tasks/mine');
      setRows(mine);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [entity]);

  const filtered = useMemo(() => {
    let list = rows;
    if (status !== 'all') list = list.filter((t) => t.status === status);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(n) ||
          (t.module || '').toLowerCase().includes(n) ||
          (t.event?.name || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [rows, status, q]);

  const kpis = useMemo(() => {
    const now = Date.now();
    return {
      total: rows.length,
      open: rows.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
      blocked: rows.filter((t) => t.status === 'BLOCKED').length,
      done: rows.filter((t) => t.status === 'DONE').length,
      overdue: rows.filter(
        (t) => t.dueAt && new Date(t.dueAt).getTime() < now && t.status !== 'DONE',
      ).length,
    };
  }, [rows]);

  async function setTaskStatus(id: string, next: string) {
    await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    await load();
  }

  const filterActive = status !== 'all' || !!q.trim();

  return (
    <AppShell title="Mis tareas · Workload">
      <div className="stack page-workspace">
        <div className="page-intro">
          <p className="muted">
            Prioriza backlog personal: vencidas, bloqueadas y en curso. Entidad activa: {entity}.
          </p>
        </div>

        {loading ? (
          <>
            <LoadingKpis count={5} />
            <LoadingBlock rows={5} label="Cargando tareas…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Total</div>
                <div className="value">{kpis.total}</div>
              </div>
              <div className="kpi">
                <div className="label">Abiertas</div>
                <div className="value">{kpis.open}</div>
              </div>
              <div className={`kpi ${kpis.overdue ? 'kpi--danger' : ''}`}>
                <div className="label">Vencidas</div>
                <div className="value">{kpis.overdue}</div>
              </div>
              <div className={`kpi ${kpis.blocked ? 'kpi--danger' : ''}`}>
                <div className="label">Bloqueadas</div>
                <div className="value">{kpis.blocked}</div>
              </div>
              <div className="kpi">
                <div className="label">Hechas</div>
                <div className="value">{kpis.done}</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-body">
                <DistBar
                  segments={[
                    { label: 'open', value: kpis.open, tone: 'warn' },
                    { label: 'blocked', value: kpis.blocked, tone: 'danger' },
                    { label: 'done', value: kpis.done, tone: 'ok' },
                  ]}
                />
              </div>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <input
                className="field"
                style={{ maxWidth: 280 }}
                placeholder="Buscar tarea…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                className="field"
                style={{ width: 'auto' }}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="DONE">DONE</option>
              </select>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Cola · {filtered.length}</h2>
              </div>
              <div className="panel-body">
                {!filtered.length ? (
                  <EmptyState
                    title={rows.length === 0 ? 'Sin tareas asignadas' : 'Sin resultados en este filtro'}
                    description={
                      rows.length === 0
                        ? 'Cuando te asignen tareas desde un evento aparecerán aquí para priorizar vencidas y bloqueadas.'
                        : 'Prueba otro estado o limpia la búsqueda.'
                    }
                    actionHref={filterActive && rows.length ? undefined : '/events'}
                    actionLabel={filterActive && rows.length ? undefined : 'Ir a eventos'}
                  >
                    {filterActive && rows.length ? (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          setStatus('all');
                          setQ('');
                        }}
                      >
                        Limpiar filtros
                      </button>
                    ) : null}
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tarea</th>
                          <th>Módulo</th>
                          <th>Vence</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((t) => {
                          const overdue =
                            t.dueAt &&
                            new Date(t.dueAt).getTime() < Date.now() &&
                            t.status !== 'DONE';
                          return (
                            <tr key={t.id}>
                              <td>
                                <strong>{t.title}</strong>
                                {t.event ? (
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    <Link href={`/events/${t.event.id}`}>{t.event.name}</Link>
                                  </div>
                                ) : null}
                              </td>
                              <td className="muted">{t.module || '—'}</td>
                              <td>
                                <span className={`badge ${overdue ? 'danger' : 'ok'}`}>
                                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-MX') : '—'}
                                </span>
                              </td>
                              <td>
                                <span className="badge">{t.status}</span>
                              </td>
                              <td>
                                <div className="row" style={{ gap: 4 }}>
                                  {t.status !== 'DONE' ? (
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => setTaskStatus(t.id, 'DONE')}
                                    >
                                      Hecha
                                    </button>
                                  ) : (
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => setTaskStatus(t.id, 'OPEN')}
                                    >
                                      Reabrir
                                    </button>
                                  )}
                                  {t.status !== 'BLOCKED' && t.status !== 'DONE' ? (
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => setTaskStatus(t.id, 'BLOCKED')}
                                    >
                                      Bloquear
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
