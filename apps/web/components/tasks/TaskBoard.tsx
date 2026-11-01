'use client';

import { useState, type DragEvent } from 'react';
import { TASK_STATUS_LABEL, taskAssigneeNames, type TaskRecord } from './task-types';

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'OPEN', label: 'Pendientes' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'BLOCKED', label: 'Bloqueadas' },
  { key: 'PENDING_APPROVAL', label: 'Por aprobar' },
  { key: 'DONE', label: 'Hechas' },
];

/** Lo terminado no se come la pantalla: las más recientes y el resto en la lista. */
const COLUMN_MAX = 30;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function dueText(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Tablero de tareas: una columna por estado, se arrastra de una a otra. Con el dedo o el
 * teclado, «Mover a» hace lo mismo. Quien decide qué significa soltarla es la pantalla:
 * hay movimientos que piden una entrega con evidencia.
 */
export function TaskBoard({
  tasks,
  today,
  onMove,
  onOpen,
}: {
  tasks: TaskRecord[];
  /** `YYYY-MM-DD` de hoy, para marcar lo vencido. */
  today: string;
  onMove: (task: TaskRecord, status: string) => void;
  onOpen: (task: TaskRecord) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const drop = (e: DragEvent, status: string) => {
    e.preventDefault();
    setOver(null);
    const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
    if (task) onMove(task, status);
  };

  return (
    <div className="board" role="list" aria-label="Tablero de tareas">
      {COLUMNS.map((col) => {
        const all = tasks.filter((t) => t.status === col.key);
        const shown = all.slice(0, COLUMN_MAX);
        return (
          <section
            key={col.key}
            role="listitem"
            aria-label={`${col.label}: ${all.length}`}
            className={`board-col ${over === col.key ? 'is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== col.key) setOver(col.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => drop(e, col.key)}
          >
            <header className="board-col__head">
              <h3>{col.label}</h3>
              <span className="board-col__count">{all.length}</span>
            </header>
            <div className="board-col__cards">
              {shown.map((t) => {
                const key = t.dueAt ? t.dueAt.slice(0, 10) : '';
                const late = !!key && key < today && t.status !== 'DONE';
                const names = taskAssigneeNames(t);
                return (
                  <article
                    key={t.id}
                    className={`board-card ${dragging === t.id ? 'is-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(t.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                  >
                    <button type="button" className="board-card__open" onClick={() => onOpen(t)}>
                      <span className="board-card__title">{t.title}</span>
                      {t.event ? <span className="board-card__event">{t.event.name}</span> : null}
                    </button>
                    <footer className="board-card__foot">
                      {names.length ? (
                        <span className="board-card__people" title={names.join(', ')}>
                          {names.slice(0, 3).map((name) => (
                            <span key={name} className="board-card__face" aria-hidden>
                              {initials(name)}
                            </span>
                          ))}
                          <span className="sr-only">{names.join(', ')}</span>
                        </span>
                      ) : (
                        <span className="board-card__nobody">Sin dueño</span>
                      )}
                      {t.dueAt ? (
                        <span className={`board-card__due ${late ? 'is-late' : ''}`}>{dueText(t.dueAt)}</span>
                      ) : null}
                      <select
                        className="board-card__move"
                        aria-label={`Mover ${t.title}`}
                        value={t.status}
                        onChange={(e) => onMove(t, e.target.value)}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {TASK_STATUS_LABEL[c.key] || c.label}
                          </option>
                        ))}
                      </select>
                    </footer>
                  </article>
                );
              })}
              {all.length > shown.length ? (
                <p className="board-col__more">Y {all.length - shown.length} más en la lista</p>
              ) : null}
              {!all.length ? <p className="board-col__empty">Nada aquí</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
