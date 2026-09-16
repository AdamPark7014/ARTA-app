'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { AssigneeSelect } from '@/components/ui/AssigneeSelect';
import { BulkBar, SelectCheck } from '@/components/ui/BulkBar';
import {
  ActionLink,
  FieldSearch,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useStickyState } from '@/lib/use-sticky-state';
import { useUser } from '@/lib/user-context';
import { TaskApprovalActions } from '@/components/tasks/TaskApprovalActions';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { TaskDeliveryModal } from '@/components/tasks/TaskDeliveryModal';
import {
  TASK_STATUS_LABEL,
  taskNeedsApproval,
  type TaskRecord,
} from '@/components/tasks/task-types';

type DirUser = { id: string; fullName: string; title?: string | null; roleKey?: string };
type EventRow = { id: string; name: string; status: string };

type View = 'mine' | 'requested' | 'team';
type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'someday' | 'done';
type GroupMode = 'due' | 'assignee' | 'none';
type QuickFilter = 'open' | 'all' | 'overdue' | 'blocked' | 'done';

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

const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'week', 'later', 'someday', 'done'];

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Vencidas',
  today: 'Para hoy',
  week: 'Esta semana',
  later: 'Más adelante',
  someday: 'Sin fecha',
  done: 'Completadas',
};

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: 'open', label: 'Pendientes' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'blocked', label: 'Bloqueadas' },
  { key: 'done', label: 'Hechas' },
  { key: 'all', label: 'Todas' },
];

const STATUS_LABEL = TASK_STATUS_LABEL;

const emptyForm = { title: '', detail: '', module: '', assigneeId: '', eventId: '', dueAt: '' };

/** Arturo, José Luis, Marisol, Leida + gerencias. */
const TEAM_ROLES = new Set([
  'super_admin',
  'dir_general',
  'dir_adjunta',
  'gerente_arta',
  'dir_auditorio',
  'convenios',
]);

/**
 * Las fechas de vencimiento se guardan como medianoche UTC. Comparar con
 * `new Date()` local corría un día en México, así que todo el cálculo se hace
 * sobre la parte `YYYY-MM-DD` de la cadena.
 */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function bucketOf(t: TaskRecord, today: string): Bucket {
  if (t.status === 'DONE') return 'done';
  if (!t.dueAt) return 'someday';
  const diff = daysBetween(today, t.dueAt.slice(0, 10));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

function isOverdue(t: TaskRecord, today: string) {
  return t.status !== 'DONE' && !!t.dueAt && bucketOf(t, today) === 'overdue';
}

function engagementLabel(t: TaskRecord): { label: string; tone: string } | null {
  if (t.status === 'DONE') return null;
  if (t.status === 'PENDING_APPROVAL') return { label: 'Por aprobar', tone: 'warn' };
  if (t.status === 'BLOCKED') return { label: 'Bloqueada', tone: 'danger' };
  if (t.status === 'IN_PROGRESS') return { label: 'En curso', tone: 'warn' };
  if (!t.assigneeId) return { label: 'Sin asignar', tone: 'muted-tone' };
  if (!t.seenAt) return { label: 'Sin abrir', tone: 'warn' };
  return { label: 'Vio · sin avance', tone: 'warn' };
}

/** `2026-08-31` para inputs `type=date` sin desfase de zona horaria. */
function toDateInput(iso?: string | null) {
  if (!iso) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

export default function TasksPage() {
  const { entity, user } = useUser();
  const canSeeTeam = TEAM_ROLES.has(user?.roleKey || '');
  const [view, setView] = useStickyState<View>('tasks.view', canSeeTeam ? 'requested' : 'mine');
  const [quick, setQuick] = useStickyState<QuickFilter>('tasks.quick', 'open');
  const [group, setGroup] = useStickyState<GroupMode>('tasks.group', 'due');
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [form, setForm] = useState(emptyForm);
  const [advanced, setAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['done']));
  const [deliveryTask, setDeliveryTask] = useState<TaskRecord | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  const titleRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  useEffect(() => {
    if (view === 'team' && !canSeeTeam) setView('mine');
  }, [view, canSeeTeam, setView]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<TaskRecord[]>(VIEW_ENDPOINT[view]));
      setSelected(new Set());
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

  /** Sustituye la fila en memoria — nada de recargar 300 tareas por un clic. */
  const patchRow = useCallback((task: TaskRecord) => {
    setRows((prev) => prev.map((r) => (r.id === task.id ? task : r)));
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (quick === 'open') list = list.filter((t) => t.status !== 'DONE');
    else if (quick === 'overdue') list = list.filter((t) => isOverdue(t, today));
    else if (quick === 'blocked') list = list.filter((t) => t.status === 'BLOCKED');
    else if (quick === 'done') list = list.filter((t) => t.status === 'DONE');
    if (who !== 'all') {
      list = list.filter((t) => (who === 'none' ? !t.assigneeId : t.assigneeId === who));
    }
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(n) ||
          (t.module || '').toLowerCase().includes(n) ||
          (t.detail || '').toLowerCase().includes(n) ||
          (t.assignee?.fullName || '').toLowerCase().includes(n) ||
          (t.event?.name || '').toLowerCase().includes(n),
      );
    }
    return list;
  }, [rows, quick, who, q, today]);

  /** Secciones ordenadas por urgencia — lo vencido siempre arriba. */
  const groups = useMemo(() => {
    if (group === 'none') {
      return [{ key: 'all', label: `${VIEW_LABEL[view]} · ${filtered.length}`, tasks: filtered }];
    }
    if (group === 'assignee') {
      const map = new Map<string, { key: string; label: string; tasks: TaskRecord[] }>();
      for (const t of filtered) {
        const key = t.assigneeId || 'none';
        const label = t.assignee?.fullName || 'Sin asignar';
        const bucket = map.get(key) || { key, label, tasks: [] };
        bucket.tasks.push(t);
        map.set(key, bucket);
      }
      return [...map.values()].sort(
        (a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label, 'es'),
      );
    }
    const byBucket = new Map<Bucket, TaskRecord[]>();
    for (const t of filtered) {
      const b = bucketOf(t, today);
      byBucket.set(b, [...(byBucket.get(b) || []), t]);
    }
    return BUCKET_ORDER.filter((b) => byBucket.get(b)?.length).map((b) => ({
      key: b,
      label: BUCKET_LABEL[b],
      tasks: (byBucket.get(b) || []).sort((a, c) => (a.dueAt || '').localeCompare(c.dueAt || '')),
    }));
  }, [filtered, group, today, view]);

  const kpis = useMemo(
    () => ({
      open: rows.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
      overdue: rows.filter((t) => isOverdue(t, today)).length,
      blocked: rows.filter((t) => t.status === 'BLOCKED').length,
      unassigned: rows.filter((t) => !t.assigneeId && t.status !== 'DONE').length,
      done: rows.filter((t) => t.status === 'DONE').length,
    }),
    [rows, today],
  );

  async function setTaskStatus(id: string, next: string) {
    setError('');
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    try {
      patchRow(await api<TaskRecord>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }));
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la tarea');
    }
  }

  function handleCompleteClick(t: TaskRecord) {
    const done = t.status === 'DONE';
    if (done || t.status === 'PENDING_APPROVAL') {
      void setTaskStatus(t.id, 'OPEN');
      return;
    }
    if (taskNeedsApproval(t) && t.assigneeId === user?.id) {
      setDeliveryTask(t);
      return;
    }
    void setTaskStatus(t.id, 'DONE');
  }

  async function bulkMarkDone() {
    const ids = [...selected];
    const blocked = rows.filter(
      (r) => ids.includes(r.id) && taskNeedsApproval(r) && r.assigneeId === user?.id,
    );
    if (blocked.length) {
      setError('Varias tareas piden entrega con evidencia — complétalas una por una');
      return;
    }
    await bulkPatch({ status: 'DONE' }, 'marcadas como hechas');
  }

  async function reassign(id: string, assigneeId: string) {
    setError('');
    const prev = rows;
    const person = directory.find((d) => d.id === assigneeId);
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, assigneeId: assigneeId || null, assignee: person ? { id: person.id, fullName: person.fullName } : null, seenAt: null }
          : r,
      ),
    );
    try {
      patchRow(
        await api<TaskRecord>(`/tasks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ assigneeId: assigneeId || null }),
        }),
      );
      setMsg(person ? `Tarea reasignada a ${person.fullName}` : 'Tarea sin asignar');
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : 'No se pudo reasignar');
    }
  }

  async function setDue(id: string, dueAt: string) {
    setError('');
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, dueAt: dueAt || null } : r)));
    try {
      patchRow(
        await api<TaskRecord>(`/tasks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ dueAt: dueAt || null }),
        }),
      );
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la fecha');
    }
  }

  /** ¿La tarea recién creada pertenece a la vista abierta? */
  function belongsToView(t: TaskRecord) {
    if (view === 'team') return true;
    if (view === 'mine') return t.assigneeId === user?.id;
    return t.createdById === user?.id && t.assigneeId !== user?.id;
  }

  async function createTask() {
    if (!form.title.trim()) {
      setError('La tarea necesita un título');
      titleRef.current?.focus();
      return;
    }
    setCreating(true);
    setError('');
    try {
      const created = await api<TaskRecord>('/tasks', {
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
      const who2 = directory.find((d) => d.id === form.assigneeId)?.fullName;
      // Se conservan responsable/evento/fecha: normalmente se asignan varias seguidas.
      setForm({ ...form, title: '', detail: '' });
      setMsg(who2 ? `Tarea asignada a ${who2} — le llega el aviso en su panel` : 'Tarea creada');
      if (belongsToView(created)) setRows((rs) => [created, ...rs]);
      titleRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la tarea');
    } finally {
      setCreating(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupSelection(tasks: TaskRecord[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of tasks) {
        if (checked) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });
  }

  async function bulkPatch(body: Record<string, unknown>, done: string) {
    setBulkBusy(true);
    setError('');
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) => api<TaskRecord>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) })),
    );
    const ok: TaskRecord[] = [];
    let failed = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') ok.push(r.value);
      else failed += 1;
    }
    if (ok.length) {
      const byId = new Map(ok.map((t) => [t.id, t]));
      setRows((rs) => rs.map((r) => byId.get(r.id) || r));
    }
    setSelected(new Set());
    setBulkBusy(false);
    setMsg(failed ? `${ok.length} ${done}, ${failed} con error` : `${ok.length} ${done}`);
    if (failed) setError(`${failed} tarea${failed === 1 ? '' : 's'} no se pudo actualizar`);
  }

  const filterActive = quick !== 'open' || !!q.trim() || who !== 'all';
  const views = (canSeeTeam ? ['mine', 'requested', 'team'] : ['mine', 'requested']) as View[];

  return (
    <AppShell title="Tareas">
      <div className="stack page-workspace">
        <PageHeader
          description={`Todo lo que el equipo tiene pendiente en ${entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema'}. Escribe una tarea y pulsa Enter para asignarla.`}
          hint="Al entregar una tarea que pediste a otra persona, el responsable sube evidencia (nota + archivo) y tú la apruebas o rechazas en «Que pedí». Todo queda en el historial."
        >
          <ActionLink href="/events" variant="ghost">
            Ir a eventos
          </ActionLink>
        </PageHeader>

        {msg ? (
          <FlashMessage variant="success" onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}
        {error ? (
          <FlashMessage variant="error" onDismiss={() => setError('')}>
            {error}
          </FlashMessage>
        ) : null}

        <div className="quick-add">
          <div className="quick-add__row">
            <input
              ref={titleRef}
              className="field quick-add__title"
              value={form.title}
              placeholder="Nueva tarea… (ej. Cotizar transporte del staff)"
              aria-label="Tarea"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) {
                  e.preventDefault();
                  void createTask();
                }
              }}
            />
            <AssigneeSelect
              value={form.assigneeId}
              directory={directory}
              onChange={(id) => setForm({ ...form, assigneeId: id })}
              label="Asignar a"
              className="field field--select quick-add__who"
              eager
            />
            <input
              className="field quick-add__due"
              type="date"
              value={form.dueAt}
              aria-label="Fecha de vencimiento"
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
            <button className="btn" type="button" disabled={creating} onClick={createTask}>
              {creating ? 'Asignando…' : 'Asignar tarea'}
            </button>
            <button
              className="btn ghost btn-sm"
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced((v) => !v)}
            >
              {advanced ? 'Menos' : 'Más campos'}
            </button>
          </div>
          {advanced ? (
            <div className="quick-add__more">
              <FormGrid cols={2}>
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
              <p className="muted kpi-sub">
                Responsable, evento y fecha se conservan al crear varias tareas seguidas.
              </p>
            </div>
          ) : null}
        </div>

        <div className="tab-bar" role="tablist" aria-label="Vista de tareas">
          {views.map((v) => (
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
          ))}
        </div>

        {loading ? (
          <>
            <LoadingKpis count={5} />
            <LoadingBlock rows={5} label="Cargando tareas…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <button
                type="button"
                className={`kpi kpi--action ${quick === 'open' ? 'kpi--on' : ''}`}
                onClick={() => setQuick('open')}
              >
                <div className="label">Pendientes</div>
                <div className="value">{kpis.open}</div>
                <div className="kpi-sub muted">Abiertas + en curso</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${kpis.overdue ? 'kpi--danger' : ''} ${quick === 'overdue' ? 'kpi--on' : ''}`}
                onClick={() => setQuick('overdue')}
              >
                <div className="label">Vencidas</div>
                <div className="value">{kpis.overdue}</div>
                <div className="kpi-sub muted">Fuera de fecha</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${kpis.blocked ? 'kpi--danger' : ''} ${quick === 'blocked' ? 'kpi--on' : ''}`}
                onClick={() => setQuick('blocked')}
              >
                <div className="label">Bloqueadas</div>
                <div className="value">{kpis.blocked}</div>
                <div className="kpi-sub muted">Esperan desbloqueo</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${who === 'none' ? 'kpi--on' : ''}`}
                onClick={() => setWho(who === 'none' ? 'all' : 'none')}
              >
                <div className="label">Sin dueño</div>
                <div className="value">{kpis.unassigned}</div>
                <div className="kpi-sub muted">Nadie las tomó</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${quick === 'done' ? 'kpi--on' : ''}`}
                onClick={() => setQuick('done')}
              >
                <div className="label">Hechas</div>
                <div className="value">{kpis.done}</div>
                <div className="kpi-sub muted">Completadas</div>
              </button>
            </div>

            <FilterBar meta={`${filtered.length} de ${rows.length}`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar tarea, persona, evento…"
                label="Buscar tarea"
                maxWidth={280}
              />
              <div className="chip-row" role="group" aria-label="Filtro rápido">
                {QUICK_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`chip ${quick === f.key ? 'is-on' : ''}`}
                    aria-pressed={quick === f.key}
                    onClick={() => setQuick(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {view === 'team' ? (
                <select
                  className="field field--select"
                  aria-label="Filtrar por responsable"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                >
                  <option value="all">Todo el equipo</option>
                  <option value="none">Sin asignar</option>
                  {directory.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                className="field field--select"
                aria-label="Agrupar tareas"
                value={group}
                onChange={(e) => setGroup(e.target.value as GroupMode)}
              >
                <option value="due">Agrupar por fecha</option>
                <option value="assignee">Agrupar por persona</option>
                <option value="none">Sin agrupar</option>
              </select>
              {filterActive ? (
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setQuick('open');
                    setQ('');
                    setWho('all');
                  }}
                >
                  Limpiar
                </button>
              ) : null}
            </FilterBar>

            <BulkBar count={selected.size} noun="tarea" busy={bulkBusy} onClear={() => setSelected(new Set())}>
              <button
                className="btn btn-sm"
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkMarkDone()}
              >
                Marcar hechas
              </button>
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={bulkBusy}
                onClick={() => bulkPatch({ status: 'OPEN' }, 'reabiertas')}
              >
                Reabrir
              </button>
              <select
                className="field field--select"
                aria-label="Reasignar seleccionadas"
                value=""
                disabled={bulkBusy}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const name = directory.find((d) => d.id === id)?.fullName || 'otra persona';
                  void bulkPatch({ assigneeId: id }, `reasignadas a ${name}`);
                }}
              >
                <option value="">Reasignar a…</option>
                {directory.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </BulkBar>

            {!filtered.length ? (
              <div className="panel">
                <div className="panel-body">
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
                        ? 'Escribe arriba lo que necesitas y elige a quién se lo pides.'
                        : 'Prueba otro filtro o limpia la búsqueda.'
                    }
                  >
                    {filterActive && rows.length ? (
                      <button
                        className="btn ghost btn-sm"
                        type="button"
                        onClick={() => {
                          setQuick('all');
                          setQ('');
                          setWho('all');
                        }}
                      >
                        Limpiar filtros
                      </button>
                    ) : null}
                  </EmptyState>
                </div>
              </div>
            ) : (
              groups.map((g) => {
                const allSelected = g.tasks.every((t) => selected.has(t.id));
                const someSelected = g.tasks.some((t) => selected.has(t.id));
                const isCollapsed = collapsed.has(g.key);
                return (
                  <section className={`task-group ${g.key === 'overdue' ? 'task-group--urgent' : ''}`} key={g.key}>
                    <header className="task-group__head">
                      <SelectCheck
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(c) => toggleGroupSelection(g.tasks, c)}
                        label={`Seleccionar ${g.label}`}
                      />
                      <button
                        type="button"
                        className="task-group__toggle"
                        aria-expanded={!isCollapsed}
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                      >
                        <span className="task-group__caret" aria-hidden>
                          {isCollapsed ? '▸' : '▾'}
                        </span>
                        <h2>{g.label}</h2>
                        <span className="badge">{g.tasks.length}</span>
                      </button>
                    </header>
                    {!isCollapsed ? (
                      <ul className="task-list">
                        {g.tasks.map((t) => {
                          const overdue = isOverdue(t, today);
                          const eng = engagementLabel(t);
                          const done = t.status === 'DONE';
                          const pending = t.status === 'PENDING_APPROVAL';
                          const needsDelivery =
                            taskNeedsApproval(t) && t.assigneeId === user?.id && view === 'mine';
                          const canReview =
                            pending &&
                            (t.createdById === user?.id ||
                              user?.roleKey === 'dir_general' ||
                              user?.roleKey === 'dir_adjunta') &&
                            (view === 'requested' || view === 'team');
                          return (
                            <li key={t.id} className="task-row-wrap">
                              <div
                                className={`task-row ${done ? 'task-row--done' : ''} ${overdue ? 'task-row--overdue' : ''} ${pending ? 'task-row--pending' : ''} ${selected.has(t.id) ? 'task-row--selected' : ''}`}
                              >
                                <SelectCheck
                                  checked={selected.has(t.id)}
                                  onChange={() => toggleSelected(t.id)}
                                  label={`Seleccionar ${t.title}`}
                                />
                                <button
                                  type="button"
                                  className={`task-row__check ${done ? 'is-done' : ''} ${pending ? 'is-done' : ''}`}
                                  aria-label={
                                    done || pending
                                      ? `Reabrir ${t.title}`
                                      : needsDelivery
                                        ? `Entregar ${t.title}`
                                        : `Marcar ${t.title} como hecha`
                                  }
                                  title={
                                    done || pending
                                      ? 'Reabrir'
                                      : needsDelivery
                                        ? 'Entregar con evidencia'
                                        : 'Marcar hecha'
                                  }
                                  onClick={() => handleCompleteClick(t)}
                                >
                                  {done || pending ? '✓' : needsDelivery ? '↑' : ''}
                                </button>
                                <div className="task-row__main">
                                  <div className="task-row__title">{t.title}</div>
                                  <div className="task-row__meta muted kpi-sub">
                                    {t.event ? (
                                      <Link href={`/events/${t.event.id}?tab=tasks`}>{t.event.name}</Link>
                                    ) : (
                                      <span>Sin evento</span>
                                    )}
                                    {t.module ? <span>· {t.module}</span> : null}
                                    {t.createdBy ? <span>· pidió {t.createdBy.fullName}</span> : null}
                                    {eng ? <span className={`badge ${eng.tone}`}>{eng.label}</span> : null}
                                    {done ? <span className="badge ok">{STATUS_LABEL.DONE}</span> : null}
                                    {pending ? <span className="badge warn">{STATUS_LABEL.PENDING_APPROVAL}</span> : null}
                                  </div>
                                  {t.detail ? <div className="task-row__detail muted">{t.detail}</div> : null}
                                  {t.rejectionNote ? (
                                    <div className="task-row__detail" style={{ color: 'var(--danger)' }}>
                                      Corrección: {t.rejectionNote}
                                    </div>
                                  ) : null}
                                </div>
                                <AssigneeSelect
                                  value={t.assigneeId || ''}
                                  directory={directory}
                                  onChange={(id) => reassign(t.id, id)}
                                  label={`Responsable de ${t.title}`}
                                />
                                <input
                                  className={`field field--date ${overdue ? 'field--overdue' : ''}`}
                                  type="date"
                                  aria-label={`Vencimiento de ${t.title}`}
                                  value={toDateInput(t.dueAt)}
                                  onChange={(e) => setDue(t.id, e.target.value)}
                                />
                                <div className="task-row__actions row row--tight">
                                  {needsDelivery && !done && !pending ? (
                                    <button
                                      className="btn btn-sm"
                                      type="button"
                                      onClick={() => setDeliveryTask(t)}
                                    >
                                      Entregar
                                    </button>
                                  ) : null}
                                  {!done && !pending && t.status !== 'IN_PROGRESS' ? (
                                    <button
                                      className="btn ghost btn-sm"
                                      type="button"
                                      onClick={() => setTaskStatus(t.id, 'IN_PROGRESS')}
                                    >
                                      En curso
                                    </button>
                                  ) : null}
                                  {!done && !pending ? (
                                    <button
                                      className={`btn ghost btn-sm ${t.status === 'BLOCKED' ? '' : 'btn-danger'}`}
                                      type="button"
                                      onClick={() =>
                                        setTaskStatus(t.id, t.status === 'BLOCKED' ? 'OPEN' : 'BLOCKED')
                                      }
                                    >
                                      {t.status === 'BLOCKED' ? 'Desbloquear' : 'Bloquear'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              {(canReview || (t.activities?.length ?? 0) > 0) ? (
                                <div className="task-row__extras">
                                  {canReview ? (
                                    <TaskApprovalActions task={t} onDone={patchRow} />
                                  ) : null}
                                  <TaskActivityTimeline
                                    task={t}
                                    expanded={historyOpen.has(t.id)}
                                    onToggle={() =>
                                      setHistoryOpen((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(t.id)) next.delete(t.id);
                                        else next.add(t.id);
                                        return next;
                                      })
                                    }
                                  />
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              })
            )}
          </>
        )}
      </div>
      {deliveryTask ? (
        <TaskDeliveryModal
          task={deliveryTask}
          onClose={() => setDeliveryTask(null)}
          onDone={(task) => {
            patchRow(task);
            setMsg(
              task.status === 'PENDING_APPROVAL'
                ? 'Entrega enviada — espera aprobación de quien pidió la tarea'
                : 'Tarea completada',
            );
          }}
        />
      ) : null}
    </AppShell>
  );
}
