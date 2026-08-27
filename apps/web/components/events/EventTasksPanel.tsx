'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { DirUser, Task } from '@/components/events/event-detail.types';

type TaskForm = { title: string; module: string; assigneeId: string; dueAt: string };

type EventTasksPanelProps = {
  closed: boolean;
  tasks: Task[];
  directory: DirUser[];
  taskForm: TaskForm;
  setTaskForm: (form: TaskForm) => void;
  onCreateTask: () => Promise<void>;
  onSetTaskStatus: (taskId: string, status: string) => Promise<void>;
};

export function EventTasksPanel({
  closed,
  tasks,
  directory,
  taskForm,
  setTaskForm,
  onCreateTask,
  onSetTaskStatus,
}: EventTasksPanelProps) {
  return (
    <div className="stack">
      {!closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Asignar tarea</h2>
          </div>
          <div className="panel-body">
            <div className="form panel--narrow">
              <label>
                Título
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Ej. Confirmar hospedaje artista"
                />
              </label>
              <FormGrid cols={3}>
                <label>
                  Módulo
                  <input
                    value={taskForm.module}
                    onChange={(e) => setTaskForm({ ...taskForm, module: e.target.value })}
                    placeholder="producción / hospitality…"
                  />
                </label>
                <label>
                  Asignado a
                  <select
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {directory.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vence
                  <input
                    type="date"
                    value={taskForm.dueAt}
                    onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })}
                  />
                </label>
              </FormGrid>
              <button className="btn" type="button" onClick={onCreateTask}>
                Crear tarea
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-head">
          <h2>Tareas del evento</h2>
          <span className="badge">{tasks?.length || 0}</span>
        </div>
        <div className="panel-body">
          {!tasks?.length ? (
            <EmptyState
              title="Sin tareas aún"
              description="Asigna pendientes por módulo para dar seguimiento al equipo."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Módulo</th>
                    <th>Asignado</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td className="muted">{t.module || '—'}</td>
                      <td>{t.assignee?.fullName || '—'}</td>
                      <td>
                        <StatusBadge
                          value={t.status === 'DONE' ? 'Hecha' : 'Abierta'}
                          kind="raw"
                          className={t.status === 'DONE' ? 'ok' : 'warn'}
                        />
                      </td>
                      <td>
                        {t.status !== 'DONE' ? (
                          <button
                            className="btn ghost btn-sm"
                            type="button"
                            onClick={() => onSetTaskStatus(t.id, 'DONE')}
                          >
                            Hecha
                          </button>
                        ) : (
                          <button
                            className="btn ghost btn-sm"
                            type="button"
                            onClick={() => onSetTaskStatus(t.id, 'OPEN')}
                          >
                            Reabrir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
