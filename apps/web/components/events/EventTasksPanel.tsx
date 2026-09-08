'use client';

import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AssigneeSelect } from '@/components/ui/AssigneeSelect';
import { FormGrid } from '@/components/ui/PageChrome';
import { TaskApprovalActions } from '@/components/tasks/TaskApprovalActions';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { TaskDeliveryModal } from '@/components/tasks/TaskDeliveryModal';
import { taskNeedsApproval, TASK_STATUS_LABEL } from '@/components/tasks/task-types';
import type { DirUser, Task } from '@/components/events/event-detail.types';

type TaskForm = { title: string; module: string; assigneeId: string; dueAt: string; detail: string };

type EventTasksPanelProps = {
  closed: boolean;
  tasks: Task[];
  directory: DirUser[];
  currentUserId?: string;
  taskForm: TaskForm;
  setTaskForm: (form: TaskForm) => void;
  onCreateTask: () => Promise<void>;
  onSetTaskStatus: (taskId: string, status: string) => Promise<void>;
  onReassignTask?: (taskId: string, assigneeId: string) => Promise<void>;
  onSetTaskDue?: (taskId: string, dueAt: string) => Promise<void>;
  onEditTask?: (taskId: string, patch: { title: string; detail: string }) => Promise<void>;
  onTaskUpdated?: (task: Task) => void;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dueKey(iso?: string | null) {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

export function EventTasksPanel({
  closed,
  tasks,
  directory,
  currentUserId,
  taskForm,
  setTaskForm,
  onCreateTask,
  onSetTaskStatus,
  onReassignTask,
  onSetTaskDue,
  onEditTask,
  onTaskUpdated,
}: EventTasksPanelProps) {
  const [advanced, setAdvanced] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deliveryTask, setDeliveryTask] = useState<Task | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  /** Tarea abierta para corregir su texto, con el borrador en curso. */
  const [editingTask, setEditingTask] = useState<{
    id: string;
    title: string;
    detail: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  const { pending, done } = useMemo(() => {
    const list = tasks || [];
    const sorted = [...list].sort((a, b) => {
      const ad = dueKey(a.dueAt) || '9999-12-31';
      const bd = dueKey(b.dueAt) || '9999-12-31';
      return ad.localeCompare(bd);
    });
    return {
      pending: sorted.filter((t) => t.status !== 'DONE'),
      done: sorted.filter((t) => t.status === 'DONE'),
    };
  }, [tasks]);

  const overdue = pending.filter((t) => dueKey(t.dueAt) && dueKey(t.dueAt) < today).length;

  async function submit() {
    if (!taskForm.title.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateTask();
      titleRef.current?.focus();
    } finally {
      setCreating(false);
    }
  }

  function handleComplete(t: Task) {
    const isDone = t.status === 'DONE';
    if (isDone || t.status === 'PENDING_APPROVAL') {
      void onSetTaskStatus(t.id, 'OPEN');
      return;
    }
    if (taskNeedsApproval(t) && t.assigneeId === currentUserId) {
      setDeliveryTask(t);
      return;
    }
    void onSetTaskStatus(t.id, 'DONE');
  }

  /**
   * La misma fila, en modo corrección. Se edita donde está y no en un diálogo
   * aparte: la tarea sigue a la vista, con su responsable y su fecha, que es
   * el contexto que hace falta para saber qué se está corrigiendo.
   */
  function renderEditRow(t: Task) {
    const draft = editingTask!;
    const clean = draft.title.trim();

    async function save() {
      if (!clean || !onEditTask) return;
      setSavingEdit(true);
      try {
        await onEditTask(t.id, { title: clean, detail: draft.detail.trim() });
        setEditingTask(null);
      } finally {
        setSavingEdit(false);
      }
    }

    return (
      <li key={t.id} className="task-row-wrap">
        <div className="task-row task-row--editing">
          <div className="task-edit form">
            <label>
              Qué hay que hacer
              <input
                className="field"
                autoFocus
                value={draft.title}
                onChange={(e) => setEditingTask({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingTask(null);
                  if (e.key === 'Enter') void save();
                }}
              />
            </label>
            <label>
              Detalle <span className="muted">(opcional)</span>
              <textarea
                className="field"
                rows={2}
                value={draft.detail}
                onChange={(e) => setEditingTask({ ...draft, detail: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingTask(null);
                }}
                placeholder="Contexto, medidas, a quién buscar…"
              />
            </label>
            <div className="row row--tight">
              <button
                className="btn btn-sm"
                type="button"
                disabled={!clean || savingEdit}
                onClick={() => void save()}
              >
                {savingEdit ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                className="btn ghost btn-sm"
                type="button"
                onClick={() => setEditingTask(null)}
              >
                Cancelar
              </button>
              {!clean ? (
                <span className="muted kpi-sub">La tarea necesita decir qué hay que hacer.</span>
              ) : null}
            </div>
          </div>
        </div>
      </li>
    );
  }

  function renderRow(t: Task) {
    if (editingTask?.id === t.id) return renderEditRow(t);
    const isDone = t.status === 'DONE';
    const pendingApproval = t.status === 'PENDING_APPROVAL';
    const key = dueKey(t.dueAt);
    const late = !isDone && !pendingApproval && !!key && key < today;
    const needsDelivery = taskNeedsApproval(t) && t.assigneeId === currentUserId;
    const canReview =
      pendingApproval && t.createdById === currentUserId && t.createdById !== t.assigneeId;

    return (
      <li key={t.id} className="task-row-wrap">
        <div
          className={`task-row ${isDone ? 'task-row--done' : ''} ${late ? 'task-row--overdue' : ''} ${pendingApproval ? 'task-row--pending' : ''}`}
        >
          <button
            type="button"
            className={`task-row__check ${isDone || pendingApproval ? 'is-done' : ''}`}
            disabled={closed}
            aria-label={
              isDone || pendingApproval
                ? `Reabrir ${t.title}`
                : needsDelivery
                  ? `Entregar ${t.title}`
                  : `Marcar ${t.title} como hecha`
            }
            title={
              isDone || pendingApproval
                ? 'Reabrir'
                : needsDelivery
                  ? 'Entregar con evidencia'
                  : 'Marcar hecha'
            }
            onClick={() => handleComplete(t)}
          >
            {isDone || pendingApproval ? '✓' : needsDelivery ? '↑' : ''}
          </button>
          <div className="task-row__main">
            {onEditTask && !closed ? (
              <button
                type="button"
                className="task-row__title task-row__title--edit"
                title="Corregir el texto de la tarea"
                onClick={() => setEditingTask({ id: t.id, title: t.title, detail: t.detail || '' })}
              >
                {t.title}
              </button>
            ) : (
              <div className="task-row__title">{t.title}</div>
            )}
            <div className="task-row__meta muted kpi-sub">
              {t.module ? <span>{t.module}</span> : <span>Sin módulo</span>}
              {t.createdBy ? <span>· pidió {t.createdBy.fullName}</span> : null}
              {t.status === 'BLOCKED' ? <span className="badge danger">Bloqueada</span> : null}
              {pendingApproval ? (
                <span className="badge warn">{TASK_STATUS_LABEL.PENDING_APPROVAL}</span>
              ) : null}
              {isDone ? <span className="badge ok">{TASK_STATUS_LABEL.DONE}</span> : null}
            </div>
            {t.detail ? <div className="task-row__detail muted">{t.detail}</div> : null}
            {t.rejectionNote ? (
              <div className="task-row__detail" style={{ color: 'var(--danger)' }}>
                Corrección: {t.rejectionNote}
              </div>
            ) : null}
          </div>
          {onReassignTask && !closed ? (
            <AssigneeSelect
              value={t.assigneeId || ''}
              directory={directory}
              onChange={(id) => onReassignTask(t.id, id)}
              label={`Responsable de ${t.title}`}
            />
          ) : (
            <span className="task-row__who muted">{t.assignee?.fullName || 'Sin asignar'}</span>
          )}
          {onSetTaskDue && !closed ? (
            <input
              className={`field field--date ${late ? 'field--overdue' : ''}`}
              type="date"
              aria-label={`Vencimiento de ${t.title}`}
              value={key}
              onChange={(e) => onSetTaskDue(t.id, e.target.value)}
            />
          ) : (
            <span className="muted kpi-sub">{key || '—'}</span>
          )}
          <div className="task-row__actions row row--tight">
            {needsDelivery && !isDone && !pendingApproval && !closed ? (
              <button className="btn btn-sm" type="button" onClick={() => setDeliveryTask(t)}>
                Entregar
              </button>
            ) : null}
            {!isDone && !pendingApproval && !closed ? (
              <button
                className={`btn ghost btn-sm ${t.status === 'BLOCKED' ? '' : 'btn-danger'}`}
                type="button"
                onClick={() => onSetTaskStatus(t.id, t.status === 'BLOCKED' ? 'OPEN' : 'BLOCKED')}
              >
                {t.status === 'BLOCKED' ? 'Desbloquear' : 'Bloquear'}
              </button>
            ) : null}
          </div>
        </div>
        {(canReview || (t.activities?.length ?? 0) > 0) && (
          <div className="task-row__extras">
            {canReview && onTaskUpdated ? (
              <TaskApprovalActions task={t} onDone={onTaskUpdated} />
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
        )}
      </li>
    );
  }

  return (
    <div className="stack">
      {!closed ? (
        <div className="quick-add">
          <div className="quick-add__row">
            <input
              ref={titleRef}
              className="field quick-add__title"
              value={taskForm.title}
              placeholder="Nuevo pendiente del evento… (Enter para asignar)"
              aria-label="Título de la tarea"
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <AssigneeSelect
              value={taskForm.assigneeId}
              directory={directory}
              onChange={(id) => setTaskForm({ ...taskForm, assigneeId: id })}
              label="Asignar la nueva tarea a"
              className="field field--select quick-add__who"
              eager
            />
            <input
              className="field quick-add__due"
              type="date"
              aria-label="Fecha de vencimiento"
              value={taskForm.dueAt}
              onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })}
            />
            <button className="btn" type="button" disabled={creating} onClick={submit}>
              {creating ? 'Asignando…' : 'Asignar'}
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
              <FormGrid cols={1}>
                <label>
                  Módulo
                  <input
                    className="field"
                    value={taskForm.module}
                    onChange={(e) => setTaskForm({ ...taskForm, module: e.target.value })}
                    placeholder="producción / hospitality…"
                  />
                </label>
              </FormGrid>
              <label>
                Detalle
                <textarea
                  className="field"
                  rows={2}
                  value={taskForm.detail}
                  onChange={(e) => setTaskForm({ ...taskForm, detail: e.target.value })}
                  placeholder="Qué se necesita, contacto o referencia…"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Pendientes del evento</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              {pending.length} abierta{pending.length === 1 ? '' : 's'}
              {overdue ? ` · ${overdue} vencida${overdue === 1 ? '' : 's'}` : ''}
              {done.length ? ` · ${done.length} hecha${done.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          {done.length ? (
            <button
              className="btn ghost btn-sm"
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? 'Ocultar hechas' : `Ver hechas (${done.length})`}
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {!pending.length && !showDone ? (
            <EmptyState
              title={done.length ? 'Todo al corriente' : 'Sin tareas aún'}
              description={
                done.length
                  ? 'No queda nada abierto en este evento. Pulsa «Ver hechas» para revisar lo completado.'
                  : 'Escribe arriba el pendiente y elige a quién se lo pides.'
              }
            />
          ) : (
            <ul className="task-list">
              {pending.map(renderRow)}
              {showDone ? done.map(renderRow) : null}
            </ul>
          )}
        </div>
      </div>

      {deliveryTask && onTaskUpdated ? (
        <TaskDeliveryModal
          task={deliveryTask}
          onClose={() => setDeliveryTask(null)}
          onDone={(task) => {
            onTaskUpdated(task);
            setDeliveryTask(null);
          }}
        />
      ) : null}
    </div>
  );
}
