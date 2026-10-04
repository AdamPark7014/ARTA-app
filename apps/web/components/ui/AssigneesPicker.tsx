'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export type DirectoryUser = { id: string; fullName: string; title?: string | null };

type Props = {
  /** Responsables elegidos, en orden: el primero es el principal. */
  value: string[];
  directory: DirectoryUser[];
  onChange: (ids: string[]) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  /**
   * En una fila ya guardada cada cambio es un PATCH con aviso: se manda una
   * sola vez al cerrar la lista, no por cada casilla.
   */
  commitOnClose?: boolean;
};

const POP_WIDTH = 280;

/**
 * Responsables de una tarea: 1 o más personas (correcciones 30-09-2026).
 *
 * Un botón con los nombres y, al abrirlo, la lista del equipo con casillas y
 * buscador. El orden en que se marcan es el orden de la tarea: la primera
 * persona queda como responsable principal.
 */
export function AssigneesPicker({
  value,
  directory,
  onChange,
  label,
  disabled,
  className = '',
  commitOnClose,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = open && commitOnClose ? draft : value;
  const byId = useMemo(() => new Map(directory.map((u) => [u.id, u])), [directory]);
  const names = value.map((id) => byId.get(id)?.fullName).filter(Boolean) as string[];

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 8));
    const below = rect.bottom + 4;
    const top = below + 320 > window.innerHeight && rect.top > 340 ? rect.top - 324 : below;
    setPos({ top, left });
  }

  function openList() {
    if (disabled) return;
    setDraft(value);
    setQ('');
    place();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    if (commitOnClose && draft.join('|') !== value.join('|')) onChange(draft);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        buttonRef.current?.focus();
      }
    }
    function onMove() {
      place();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // close/place leen el estado más reciente en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (commitOnClose) setDraft(next);
    else onChange(next);
  }

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const filtered = needle
      ? directory.filter((u) => `${u.fullName} ${u.title || ''}`.toLowerCase().includes(needle))
      : directory;
    // Lo elegido arriba, en su orden; luego el resto del equipo.
    const picked = chosen.map((id) => filtered.find((u) => u.id === id)).filter(Boolean) as DirectoryUser[];
    return [...picked, ...filtered.filter((u) => !chosen.includes(u.id))];
  }, [directory, needle, chosen]);

  const summary = !names.length
    ? 'Sin asignar'
    : names.length === 1
      ? names[0]
      : `${names[0]} +${names.length - 1}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`assignees ${className}`}
        aria-label={`${label}: ${names.join(', ') || 'sin asignar'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={names.join(', ') || 'Sin asignar'}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      >
        <span className={`assignees__text ${names.length ? '' : 'is-empty'}`}>{summary}</span>
        <span className="assignees__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && pos
        ? createPortal(
        <div
          ref={popRef}
          className="assignees-pop"
          style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
          role="dialog"
          aria-label={label}
        >
          <input
            className="assignees-pop__search"
            autoFocus
            value={q}
            placeholder="Buscar persona…"
            aria-label="Buscar persona"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && list[0]) {
                e.preventDefault();
                toggle(list[0].id);
                setQ('');
              }
            }}
          />
          <p className="assignees-pop__hint">
            {chosen.length > 1
              ? `${chosen.length} personas · la primera es la responsable principal`
              : 'Marca una o varias personas'}
          </p>
          <ul id={listId} className="assignees-pop__list" role="listbox" aria-multiselectable="true">
            {list.map((u) => {
              const index = chosen.indexOf(u.id);
              const on = index >= 0;
              return (
                <li key={u.id} role="option" aria-selected={on}>
                  <label className={`assignees-pop__item ${on ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(u.id)} />
                    <span className="assignees-pop__name">
                      {u.fullName}
                      {u.title ? <span className="assignees-pop__title"> · {u.title}</span> : null}
                    </span>
                    {on && chosen.length > 1 ? <span className="assignees-pop__order">{index + 1}</span> : null}
                  </label>
                </li>
              );
            })}
            {!list.length ? <li className="assignees-pop__empty">Nadie con ese nombre</li> : null}
          </ul>
          <div className="assignees-pop__foot">
            {chosen.length ? (
              <button
                type="button"
                className="btn-quiet"
                onClick={() => (commitOnClose ? setDraft([]) : onChange([]))}
              >
                Quitar a todos
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-sm" onClick={close}>
              Listo
            </button>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
