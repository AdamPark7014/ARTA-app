'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldSearch,
  FieldSelect,
  FilterBar,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type Task = {
  id: string;
  title: string;
  module?: string | null;
  detail?: string | null;
  status: string;
  dueAt?: string | null;
  seenAt?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string } | null;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  event?: { id: string; name: string; status: string } | null;
};

type DirUser = { id: string; fullName: string; title?: string | null; roleKey?: string };
type EventRow = { id: string; name: string; status: string };

type View = 'mine' | 'requested' | 'team';

const VIEW_LABEL: Record<View, string> = {
  mine: 'Mis tareas',
  requested: 'Que pedí',
  team: 'Todas las tareas',
};

const VIEW_ENDPOINT: Record<View, string> = {
  mine: '/tasks/mine',
  requested: '/tasks/requested',
  team: '/tasks/workload',
};

function taskStatusTone(status: string): string {
  if (status === 'DONE') return 'healthy';
  if (status === 'BLOCKED') return 'critical';
  if (status === 'IN_PROGRESS') return 'watch';
  return 'medium';
}

function engagementLabel(t: Task): { label: string; tone: string } {
  if (t.status === 'DONE') return { label: 'Completada', tone: 'ok' };
  if (t.status === 'BLOCKED') return { label: 'Bloqueada', tone: 'danger' };
  if (t.status === 'IN_PROGRESS') return { label: 'En curso', tone: 'watch' };
  if (!t.assigneeId) return { label: 'Sin asignar', tone: 'muted' };
  if (!t.seenAt) return { label: 'Sin abrir', tone: 'warn' };
  return { label: 'Vio · sin avance', tone: 'warn' };
}

const emptyForm = { title: '', detail: '', module: '', assigneeId: '', eventId: '', dueAt: '' };

/** Arturo, José Luis, Marisol, Leida + gerencias. */
const TEAM_ROLES = new Set([
  'super_admin',
  'dir_general',
  'gerente_arta',
  'dir_auditorio',
  'convenios',
]);

export default function TasksPage() {
  const { entity, user } = useUser();
  const canSeeTeam = TEAM_ROLES.has(user?.roleKey || '');
  const [view, setView] = useState<View>(canSeeTeam ? 'requested' : 'mine');
  const [rows, setRows] = useState<Task[]>([]);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (view === 'team' && !canSeeTeam) setView('mine');
  }, [view, canSeeTeam]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Task[]>(VIEW_ENDPOINT[view]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load().catch(console.error);
  }, [load, entity]);

  useEffect(() => {
    api<DirUser[]>('/users/directory')
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, []);

  useEffect(() => {
    api<EventRow[]>(`/events?entity=${entity}`)
      .then((list) => setEvents(list.filter((e) => e.status !== 'CANCELLED')))
      .catch(() => setEvents([]));
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
          (t.assignee?.fullName || '').toLowerCase().includes(n) ||
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
    setError('');
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la tarea');
    }
  }

  async function reassign(id: string, assigneeId: string) {
    setError('');
    try {
      await api(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      setMsg('Tarea reasignada — la persona recibe el aviso en su panel');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reasignar');
    }
  }

  async function createTask() {
    if (!form.title.trim()) {
      setError('La tarea necesita un título');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          detail: form.detail || undefined,
          module: form.module || undefined,
          assigneeId: form.assigneeId || undefined,
          eventId: form.eventId || undefined,
          dueAt: form.dueAt || undefined,
        }),
      });
      const who = directory.find((d) => d.id === form.assigneeId)?.fullName;
      setForm(emptyForm);
      setMsg(who ? `Tarea asignada a ${who} — le llega el aviso en su panel` : 'Tarea creada');
      if (view === 'mine' && form.assigneeId && form.assigneeId !== user?.id) setView('requested');
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la tarea');
    } finally {
      setCreating(false);
    }
  }

  const filterActive = status !== 'all' || !!q.trim();

  return (
    <AppShell title="Tareas">
      <div className="stack page-workspace">
        <PageHeader
          description={
            canSeeTeam
              ? `Seguimiento de actividades del equipo. «Que pedí» = las que asignaste; «Todas» = toda la organización. Entidad: ${
                  entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'
                }.`
              : `Tus tareas asignadas y las que pediste a otros. Entidad: ${
                  entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'
                }.`
          }
          hint="Al abrir Mis tareas, el sistema marca que la persona ya vio la actividad. Si no cambia el status, verás «Vio · sin avance»."
        >
          <ActionLink href="/events" variant="ghost">
            Ir a eventos
          </ActionLink>
        </PageHeader>

        {msg ? (
          <div className="module-banner" role="status">
            {msg}
          </div>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Asignar una tarea</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                A cualquier persona del equipo, con o sin evento detrás.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form">
              <FormGrid cols={2}>
                <label>
                  Tarea
                  <input
                    className="field"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Ej. Cotizar transporte del staff"
                  />
                </label>
                <label>
                  Asignar a
                  <select
                    className="field"
                    value={form.assigneeId}
                    onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {directory.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                        {u.title ? ` · ${u.title}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </FormGrid>
              <FormGrid cols={3}>
                <label>
                  Evento (opcional)
                  <select
                    className="field"
                    value={form.eventId}
                    onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  >
                    <option value="">Sin evento</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Módulo
                  <input
                    className="field"
                    value={form.module}
                    onChange={(e) => setForm({ ...form, module: e.target.value })}
                    placeholder="producción / campaña…"
                  />
                </label>
                <label>
                  Vence
                  <input
                    className="field"
                    type="date"
                    value={form.dueAt}
                    onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  />
                </label>
              </FormGrid>
              <label>
                Detalle
                <textarea
                  className="field"
                  rows={2}
                  value={form.detail}
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                  placeholder="Qué se necesita exactamente, con qué contacto o referencia…"
                />
              </label>
              <button className="btn" type="button" disabled={creating} onClick={createTask}>
                {creating ? 'Asignando…' : 'Asignar tarea'}
              </button>
            </div>
          </div>
        </div>

        <div className="tab-bar" role="tablist" aria-label="Vista de tareas">
          {((canSeeTeam ? ['mine', 'requested', 'team'] : ['mine', 'requested']) as View[]).map(
            (v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`tab-bar__btn ${view === v ? 'is-active' : ''}`}
              onClick={() => setView(v)}
            >
              {VIEW_LABEL[v]}
            </button>
            ),
          )}
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
                <div className="kpi-sub muted">{VIEW_LABEL[view]}</div>
              </div>
              <div className="kpi">
                <div className="label">Abiertas</div>
                <div className="value">{kpis.open}</div>
                <div className="kpi-sub muted">Abiertas + en curso</div>
              </div>
              <div className={`kpi ${kpis.overdue ? 'kpi--danger' : ''}`}>
                <div className="label">Vencidas</div>
                <div className="value">{kpis.overdue}</div>
                <div className="kpi-sub muted">Fuera de fecha</div>
              </div>
              <div className={`kpi ${kpis.blocked ? 'kpi--danger' : ''}`}>
                <div className="label">Bloqueadas</div>
                <div className="value">{kpis.blocked}</div>
                <div className="kpi-sub muted">Esperan desbloqueo</div>
              </div>
              <div className="kpi">
                <div className="label">Hechas</div>
                <div className="value">{kpis.done}</div>
                <div className="kpi-sub muted">Completadas</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-body">
                <div className="muted kpi-sub">Distribución de carga</div>
                <DistBar
                  segments={[
                    { label: 'Abiertas', value: kpis.open, tone: 'warn' },
                    { label: 'Bloqueadas', value: kpis.blocked, tone: 'danger' },
                    { label: 'Hechas', value: kpis.done, tone: 'ok' },
                  ]}
                />
              </div>
            </div>

            <FilterBar meta={`${filtered.length} en cola`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar tarea, persona, evento…"
                label="Buscar tarea"
                maxWidth={280}
              />
              <FieldSelect
                value={status}
                onChange={setStatus}
                label="Filtrar por estado"
                options={[
                  { value: 'all', label: 'Todos los estados' },
                  { value: 'OPEN', label: 'Abierta' },
                  { value: 'IN_PROGRESS', label: 'En curso' },
                  { value: 'BLOCKED', label: 'Bloqueada' },
                  { value: 'DONE', label: 'Hecha' },
                ]}
              />
            </FilterBar>

            <div className="panel">
              <div className="panel-head">
                <h2>
                  {VIEW_LABEL[view]} · {filtered.length}
                </h2>
              </div>
              <div className="panel-body">
                <div className="table-wrap">
                  <table className="table table-sticky">
                    <thead>
                      <tr>
                        <th>Tarea</th>
                        <th>Asignada a</th>
                        <th>Pedida por</th>
                        <th>Seguimiento</th>
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
                        const eng = engagementLabel(t);
                        return (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.title}</strong>
                              <div className="muted kpi-sub">
                                {t.event ? (
                                  <Link href={`/events/${t.event.id}?tab=tasks`}>
                                    {t.event.name}
                                  </Link>
                                ) : (
                                  'Sin evento'
                                )}
                                {t.module ? ` · ${t.module}` : ''}
                              </div>
                              {t.detail ? <div className="muted kpi-sub">{t.detail}</div> : null}
                            </td>
                            <td>
                              <select
                                className="field field--select"
                                aria-label={`Reasignar ${t.title}`}
                                value={t.assigneeId || ''}
                                onChange={(e) => reassign(t.id, e.target.value)}
                              >
                                <option value="">Sin asignar</option>
                                {directory.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.fullName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="muted kpi-sub">{t.createdBy?.fullName || '—'}</td>
                            <td>
                              <span className={`badge ${eng.tone}`}>{eng.label}</span>
                              {t.seenAt && t.status === 'OPEN' ? (
                                <div className="muted kpi-sub">
                                  Visto {new Date(t.seenAt).toLocaleString('es-MX', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <span className={`badge ${overdue ? 'danger' : 'ok'}`}>
                                {t.dueAt ? new Date(t.dueAt).toLocaleDateString('es-MX') : '—'}
                              </span>
                            </td>
                            <td>
                              <StatusBadge value={taskStatusTone(t.status)} kind="risk" />
                              <span className="muted kpi-sub">{t.status}</span>
                            </td>
                            <td>
                              <div className="row row--tight">
                                {t.status !== 'DONE' ? (
                                  <button
                                    className="btn btn-sm"
                                    type="button"
                                    onClick={() => setTaskStatus(t.id, 'DONE')}
                                  >
                                    Hecha
                                  </button>
                                ) : (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => setTaskStatus(t.id, 'OPEN')}
                                  >
                                    Reabrir
                                  </button>
                                )}
                                {t.status !== 'BLOCKED' && t.status !== 'DONE' ? (
                                  <button
                                    className="btn ghost btn-sm btn-danger"
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
                      {!filtered.length ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              title={
                                rows.length === 0
                                  ? view === 'mine'
                                    ? 'Sin tareas asignadas'
                                    : view === 'requested'
                                      ? 'No has pedido apoyo todavía'
                                      : 'El equipo no tiene tareas abiertas'
                                  : 'Sin resultados en este filtro'
                              }
                              description={
                                rows.length === 0
                                  ? 'Usa el formulario de arriba para pedirle una actividad a cualquier integrante del equipo.'
                                  : 'Prueba otro estado o limpia la búsqueda.'
                              }
                            >
                              {filterActive && rows.length ? (
                                <button
                                  className="btn ghost btn-sm"
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
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
