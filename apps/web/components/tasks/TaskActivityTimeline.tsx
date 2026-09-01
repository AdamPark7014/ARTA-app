'use client';

import { TASK_ACTION_LABEL, type TaskRecord } from './task-types';

type Props = {
  task: TaskRecord;
  expanded?: boolean;
  onToggle?: () => void;
};

export function TaskActivityTimeline({ task, expanded, onToggle }: Props) {
  const items = task.activities || [];
  if (!items.length && !task.submittedAt && !task.approvedAt) return null;

  const summary = items.length
    ? `${items.length} movimiento${items.length === 1 ? '' : 's'}`
    : 'Sin historial';

  return (
    <div className="task-timeline">
      {onToggle ? (
        <button className="btn ghost btn-sm task-timeline__toggle" type="button" onClick={onToggle}>
          {expanded ? 'Ocultar historial' : `Ver historial · ${summary}`}
        </button>
      ) : null}
      {expanded !== false ? (
        <ol className="task-timeline__list">
          {items.map((a) => (
            <li key={a.id}>
              <div className="task-timeline__action">{TASK_ACTION_LABEL[a.action] || a.action}</div>
              <div className="muted kpi-sub">
                {a.actor?.fullName || 'Sistema'}
                {' · '}
                {new Date(a.createdAt).toLocaleString('es-MX')}
              </div>
              {a.detail ? <div className="task-timeline__detail">{a.detail}</div> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
