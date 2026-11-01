'use client';

import { plainText } from '@/components/chat/chat-model';
import { RefBacklinks } from '@/components/chat/RefCard';
import { TaskComments } from './TaskComments';
import { TASK_ACTION_LABEL, type TaskRecord } from './task-types';

type Props = {
  task: TaskRecord;
  expanded?: boolean;
  onToggle?: () => void;
  /** Con esto se puede comentar la tarea desde el historial. */
  onUpdated?: (task: TaskRecord) => void;
};

export function TaskActivityTimeline({ task, expanded, onToggle, onUpdated }: Props) {
  const items = task.activities || [];
  if (!items.length && !task.submittedAt && !task.approvedAt) return null;

  const summary = items.length
    ? `${items.length} movimiento${items.length === 1 ? '' : 's'}`
    : 'Sin historial';

  return (
    <div className="task-timeline">
      {onToggle ? (
        <button className="btn ghost btn-sm task-timeline__toggle" type="button" onClick={onToggle}>
          {expanded ? 'Ocultar historial' : `Comentarios e historial · ${summary}`}
        </button>
      ) : null}
      {expanded !== false && onUpdated ? <TaskComments task={task} onUpdated={onUpdated} /> : null}
      {expanded !== false ? (
        <ol className="task-timeline__list">
          {items.map((a) => (
            <li key={a.id} className={a.action === 'comment' ? 'is-comment' : undefined}>
              <div className="task-timeline__action">{TASK_ACTION_LABEL[a.action] || a.action}</div>
              <div className="muted kpi-sub">
                {a.actor?.fullName || 'Sistema'}
                {' · '}
                {new Date(a.createdAt).toLocaleString('es-MX')}
              </div>
              {a.detail ? (
                <div className="task-timeline__detail">{a.action === 'comment' ? plainText(a.detail) : a.detail}</div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {expanded !== false ? <RefBacklinks kind="task" id={task.id} /> : null}
    </div>
  );
}
