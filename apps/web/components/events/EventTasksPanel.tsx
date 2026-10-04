'use client';

import { useMemo, useRef, useState } from 'react';
import { EmptyLite, Pill, SectionHead, Seg } from '@/components/ui/Lite';
import { AssigneesPicker } from '@/components/ui/AssigneesPicker';
import { TaskApprovalActions } from '@/components/tasks/TaskApprovalActions';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { TaskDeliveryModal } from '@/components/tasks/TaskDeliveryModal';
import { isTaskAssignee, taskAssigneeIds, taskAssigneeNames, taskNeedsApproval } from '@/components/tasks/task-types';
import type { DirUser, Task } from '@/components/events/event-detail.types';

type TaskForm = { title: string; module: string; assigneeIds: string[]; dueAt: string; detail: string };

type EventTasksPanelProps = {
  closed: boolean;
  tasks: Task[];
  directory: DirUser[];
  currentUserId?: string;
  taskForm: TaskForm;
  setTaskForm: (form: TaskForm) => void;
  onCreateTask: () => Promise<void>;
  onSetTaskStatus: (taskId: string, status: string) => Promise<void>;
  /** Responsables de la tarea: 1 o más personas, la primera es la principal. */
  onReassignTask?: (taskId: string, assigneeIds: string[]) => Promise<void>;
  onSetTaskDue?: (taskId: string, dueAt: string) => Promise<void>;
  onEditTask?: (taskId: string, patch: { title: string; detail: string }) => Promise<void>;
  onTaskUpdated?: (task: Task) => void;
};

type Section = 'open' | 'approval' | 'done';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dueKey(iso?: string | null) {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

function dueLabel(key: string) {
  if (!key) return '';
  const d = new Date(`${key}T00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Tareas del evento.
 *
 * Una línea para pedir algo, tres secciones y filas que se leen de corrido.
 * Lo que antes eran cinco columnas siempre visibles (módulo, quién pidió,
 * badges, responsable, fecha, dos botones) ahora vive en la fila abierta.
 */
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
  const [section, setSection] = useState<Section>('open');
  const [more, setMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveryTask, setDeliveryTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; detail: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  const groups = useMemo(() => {
    const sorted = [...(tasks || [])].sort((a, b) => {
      const ad = dueKey(a.dueAt) || '9999-12-31';
      const bd = dueKey(b.dueAt) || '9999-12-31';
      return ad.localeCompare(bd);
    });
    return {
      open: sorted.filter((t) => t.status !== 'DONE' && t.status !== 'PENDING_APPROVAL'),
      approval: sorted.filter((t) => t.status === 'PENDING_APPROVAL'),
      done: sorted.filter((t) => t.status === 'DONE'),
    };
  }, [tasks]);

  const overdue = groups.open.filter((t) => dueKey(t.dueAt) && dueKey(t.dueAt) < today).length;
  const list = groups[section];

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

  function complete(t: Task) {
    if (t.status === 'DONE' || t.status === 'PENDING_APPROVAL') {
      void onSetTaskStatus(t.id, 'OPEN');
      return;
    }
    if (taskNeedsApproval(t) && isTaskAssignee(t, currentUserId)) {
      setDeliveryTask(t);
      return;
    }
    void onSetTaskStatus(t.id, 'DONE');
  }

  async function saveEdit() {
    if (!editing || !onEditTask) return;
    const title = editing.title.trim();
    if (!title) return;
    setSavingEdit(true);
    try {
      await onEditTask(editing.id, { title, detail: editing.detail.trim() });
      setEditing(null);
    } finally {
      setSavingEdit(false);
    }
  }

  const sub = `${groups.open.length} abierta${groups.open.length === 1 ? '' : 's'}${
    overdue ? ` · ${overdue} vencida${overdue === 1 ? '' : 's'}` : ''
  }${groups.approval.length ? ` · ${groups.approval.length} por aprobar` : ''}`;

  return (
    <div className="sx-stack tasks">
      <SectionHead title="Tareas" sub={tasks?.length ? sub : undefined} />

      {!closed ? (
        <div className="surface task-add">
          <div className="task-add__row">
            <input
              ref={titleRef}
              className="task-add__title"
              value={taskForm.title}
              placeholder="¿Qué hay que hacer?"
              aria-label="Qué hay que hacer"
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <AssigneesPicker
              value={taskForm.assigneeIds}
              directory={directory}
              onChange={(ids) => setTaskForm({ ...taskForm, assigneeIds: ids })}
              label="Responsables"
              className="task-add__who"
            />
            <input
              className="task-add__due"
              type="date"
              aria-label="Para cuándo"
              value={taskForm.dueAt}
              onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })}
            />
            <button className="btn-quiet" type="button" aria-pressed={more} onClick={() => setMore((v) => !v)}>
              {more ? 'Menos' : 'Más'}
            </button>
            <button className="btn btn-sm" type="button" disabled={creating || !taskForm.title.trim()} onClick={submit}>
              {creating ? 'Asignando…' : 'Agregar'}
            </button>
          </div>
          {more ? (
            <div className="task-add__more fx">
              <div className="fx-grid">
                <label>
                  Módulo
                  <input
                    value={taskForm.module}
                    onChange={(e) => setTaskForm({ ...taskForm, module: e.target.value })}
                    placeholder="producción, hospitality…"
                  />
                </label>
                <label className="fx-span">
                  Detalle
                  <textarea
                    rows={2}
                    value={taskForm.detail}
                    onChange={(e) => setTaskForm({ ...taskForm, detail: e.target.value })}
                    placeholder="Contexto, contacto o referencia…"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tasks?.length ? (
        <Seg
          label="Secciones de tareas"
          value={section}
          onChange={setSection}
          options={[
            { key: 'open', label: 'Abiertas', count: groups.open.length },
            { key: 'approval', label: 'Por aprobar', count: groups.approval.length },
            { key: 'done', label: 'Hechas', count: groups.done.length },
          ]}
        />
      ) : null}

      {!list.length ? (
        <div className="surface">
          <EmptyLite
            icon="✓"
            title={
              section === 'open'
                ? tasks?.length
                  ? 'Nada abierto'
                  : 'Sin tareas todavía'
                : section === 'approval'
                  ? 'Nada por aprobar'
                  : 'Nada terminado aún'
            }
            text={!tasks?.length && !closed ? 'Escribe arriba el pendiente y elige a quién se lo pides.' : undefined}
          />
        </div>
      ) : (
        <ul className="task-list2">
          {list.map((t) => {
            const key = dueKey(t.dueAt);
            const late = section === 'open' && !!key && key < today;
            const open = openId === t.id;
            const needsDelivery = taskNeedsApproval(t) && isTaskAssignee(t, currentUserId);
            const canReview =
              t.status === 'PENDING_APPROVAL' && t.createdById === currentUserId && !isTaskAssignee(t, t.createdById);
            const isEditing = editing?.id === t.id;

            return (
              <li key={t.id} className={`task2 ${open ? 'is-open' : ''} ${t.status === 'DONE' ? 'is-done' : ''}`}>
                <div className="task2__row">
                  <button
                    type="button"
                    className={`task2__check ${t.status === 'DONE' || t.status === 'PENDING_APPROVAL' ? 'is-done' : ''}`}
                    disabled={closed}
                    aria-label={
                      t.status === 'DONE' || t.status === 'PENDING_APPROVAL'
                        ? `Reabrir ${t.title}`
                        : needsDelivery
                          ? `Entregar ${t.title}`
                          : `Marcar ${t.title} como hecha`
                    }
                    onClick={() => complete(t)}
                  />
                  <button type="button" className="task2__main" onClick={() => setOpenId(open ? null : t.id)}>
                    <span className="task2__title">{t.title}</span>
                    <span className="task2__meta">
                      {taskAssigneeNames(t).join(', ') || 'Sin asignar'}
                      {t.module ? ` · ${t.module}` : ''}
                    </span>
                  </button>
                  {key ? <span className={`task2__due ${late ? 'is-late' : ''}`}>{dueLabel(key)}</span> : null}
                  {t.status === 'BLOCKED' ? <Pill tone="danger">Bloqueada</Pill> : null}
                  {t.status === 'PENDING_APPROVAL' ? <Pill tone="review">Por aprobar</Pill> : null}
                </div>

                {open ? (
                  <div className="task2__detail">
                    {isEditing ? (
                      <div className="fx">
                        <label>
                          Qué hay que hacer
                          <input
                            autoFocus
                            value={editing.title}
                            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditing(null);
                              if (e.key === 'Enter') void saveEdit();
                            }}
                          />
                        </label>
                        <label>
                          Detalle
                          <textarea
                            rows={2}
                            value={editing.detail}
                            onChange={(e) => setEditing({ ...editing, detail: e.target.value })}
                            placeholder="Contexto, medidas, a quién buscar…"
                          />
                        </label>
                        <div className="fx-actions">
                          <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(null)}>
                            Cancelar
                          </button>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={savingEdit || !editing.title.trim()}
                            onClick={() => void saveEdit()}
                          >
                            {savingEdit ? 'Guardando…' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {t.detail ? <p className="task2__text">{t.detail}</p> : null}
                        {t.rejectionNote ? (
                          <p className="task2__text task2__text--warn">Corrección: {t.rejectionNote}</p>
                        ) : null}
                        <div className="task2__controls">
                          {onReassignTask && !closed ? (
                            <div className="task2__control">
                              Responsables
                              <AssigneesPicker
                                value={taskAssigneeIds(t)}
                                directory={directory}
                                onChange={(ids) => void onReassignTask(t.id, ids)}
                                label={`Responsables de ${t.title}`}
                                commitOnClose
                              />
                            </div>
                          ) : null}
                          {onSetTaskDue && !closed ? (
                            <label className="task2__control">
                              Para cuándo
                              <input type="date" value={key} onChange={(e) => onSetTaskDue(t.id, e.target.value)} />
                            </label>
                          ) : null}
                        </div>
                        <div className="sx-actions">
                          {needsDelivery && t.status !== 'DONE' && t.status !== 'PENDING_APPROVAL' && !closed ? (
                            <button className="btn btn-sm" type="button" onClick={() => setDeliveryTask(t)}>
                              Entregar
                            </button>
                          ) : null}
                          {onEditTask && !closed ? (
                            <button
                              className="btn-quiet"
                              type="button"
                              onClick={() => setEditing({ id: t.id, title: t.title, detail: t.detail || '' })}
                            >
                              Editar
                            </button>
                          ) : null}
                          {t.status !== 'DONE' && t.status !== 'PENDING_APPROVAL' && !closed ? (
                            <button
                              className="btn-quiet"
                              type="button"
                              onClick={() => onSetTaskStatus(t.id, t.status === 'BLOCKED' ? 'OPEN' : 'BLOCKED')}
                            >
                              {t.status === 'BLOCKED' ? 'Desbloquear' : 'Bloquear'}
                            </button>
                          ) : null}
                          {t.createdBy ? <span className="t-muted t-small">Lo pidió {t.createdBy.fullName}</span> : null}
                        </div>
                        {canReview && onTaskUpdated ? <TaskApprovalActions task={t} onDone={onTaskUpdated} /> : null}
                        {(t.activities?.length ?? 0) > 0 ? (
                          <TaskActivityTimeline task={t} expanded onToggle={() => setOpenId(null)} />
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

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
