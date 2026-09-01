'use client';

import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AssigneeSelect } from '@/components/ui/AssigneeSelect';
import { FormGrid } from '@/components/ui/PageChrome';
import type { DirUser, Task } from '@/components/events/event-detail.types';

type TaskForm = { title: string; module: string; assigneeId: string; dueAt: string; detail: string };

type EventTasksPanelProps = {
  closed: boolean;
  tasks: Task[];
  directory: DirUser[];
  taskForm: TaskForm;
  setTaskForm: (form: TaskForm) => void;
  onCreateTask: () => Promise<void>;
  onSetTaskStatus: (taskId: string, status: string) => Promise<void>;
  /** Reasignar sin salir del evento (junta 2026-08-28) */
  onReassignTask?: (taskId: string, assigneeId: string) => Promise<void>;
  /** Cambiar el vencimiento desde la propia lista */
  onSetTaskDue?: (taskId: string, dueAt: string) => Promise<void>;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Las fechas viajan como medianoche UTC: se compara la parte YYYY-MM-DD. */
function dueKey(iso?: string | null) {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

export function EventTasksPanel({
  closed,
  tasks,
  directory,
  taskForm,
  setTaskForm,
  onCreateTask,
  onSetTaskStatus,
  onReassignTask,
  onSetTaskDue,
}: EventTasksPanelProps) {
  const [advanced, setAdvanced] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
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

  function renderRow(t: Task) {
    const isDone = t.status === 'DONE';
    const key = dueKey(t.dueAt);
    const late = !isDone && !!key && key < today;
    return (
      <li
        key={t.id}
        className={`task-row ${isDone ? 'task-row--done' : ''} ${late ? 'task-row--overdue' : ''}`}
      >
        <button
          type="button"
          className={`task-row__check ${isDone ? 'is-done' : ''}`}
          disabled={closed}
          aria-label={isDone ? `Reabrir ${t.title}` : `Marcar ${t.title} como hecha`}
          title={isDone ? 'Reabrir' : 'Marcar hecha'}
          onClick={() => onSetTaskStatus(t.id, isDone ? 'OPEN' : 'DONE')}
        >
          {isDone ? '✓' : ''}
        </button>
        <div className="task-row__main">
          <div className="task-row__title">{t.title}</div>
          <div className="task-row__meta muted kpi-sub">
            {t.module ? <span>{t.module}</span> : <span>Sin módulo</span>}
            {t.createdBy ? <span>· pidió {t.createdBy.fullName}</span> : null}
            {t.status === 'BLOCKED' ? <span className="badge danger">Bloqueada</span> : null}
            {isDone ? <span className="badge ok">Hecha</span> : null}
          </div>
          {t.detail ? <div className="task-row__detail muted">{t.detail}</div> : null}
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
          {!isDone && !closed ? (
            <button
              className={`btn ghost btn-sm ${t.status === 'BLOCKED' ? '' : 'btn-danger'}`}
              type="button"
              onClick={() => onSetTaskStatus(t.id, t.status === 'BLOCKED' ? 'OPEN' : 'BLOCKED')}
            >
              {t.status === 'BLOCKED' ? 'Desbloquear' : 'Bloquear'}
            </button>
          ) : null}
        </div>
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
    </div>
  );
}
