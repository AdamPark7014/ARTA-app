'use client';

import { useMemo, useState } from 'react';
import { EmptyLite, Pill } from '@/components/ui/Lite';
import type { Checklist } from './event-detail.types';

/** Grupo del formato para filtrar la lista: falta trabajo, en revisión o listo. */
export type ChecklistBucket = 'todo' | 'review' | 'ready';

export function checklistBucket(c: Checklist, eventDone = false): ChecklistBucket {
  if (c.status === 'SEALED' || c.status === 'APPROVED' || c.authorizedAt) return 'ready';
  if (c.status === 'REVIEW' || c.deliveredAt) return 'review';
  // Evento cerrado o pasado: ya no queda nada «por completar» (Adam, 07-11-2026).
  return eventDone ? 'ready' : 'todo';
}

/** Una sola píldora por formato: el estado que importa ahora mismo. */
export function checklistState(c: Checklist): { label: string; tone: string } {
  if (c.status === 'SEALED') return { label: 'Sellado', tone: 'paid' };
  if (c.status === 'APPROVED') return { label: 'Aprobado', tone: 'ok' };
  if (c.authorizedAt) return { label: 'Autorizado', tone: 'ok' };
  if (c.status === 'REVIEW') return { label: 'En revisión', tone: 'review' };
  if (c.deliveredAt) return { label: 'Por autorizar', tone: 'review' };
  if (c.progressPct >= 100) return { label: 'Completo', tone: 'info' };
  if (c.progressPct > 0) return { label: 'En progreso', tone: 'draft' };
  return { label: 'Sin empezar', tone: 'draft' };
}

function shortDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export type AssignPerson = { id: string; fullName: string };
export type AssignPatch = { ownerId?: string | null; dueAt?: string | null };

type Props = {
  checklists: Checklist[];
  activeId?: string | null;
  onSelect: (c: Checklist) => void;
  compact?: boolean;
  /** Con esto cada formato enseña su responsable y deja cambiarlo (quien dirige el evento). */
  assign?: { people: AssignPerson[]; onAssign: (c: Checklist, patch: AssignPatch) => Promise<void> };
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** «vence 4 dic», «vence hoy», «venció 2 dic»: solo importa mientras el formato no esté listo. */
export function dueLabel(c: Pick<Checklist, 'dueAt'>): { text: string; late: boolean } | null {
  if (!c.dueAt) return null;
  const d = new Date(c.dueAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - startOfToday()) / 86400000);
  if (diff === 0) return { text: 'vence hoy', late: false };
  if (diff === 1) return { text: 'vence mañana', late: false };
  return { text: `${diff < 0 ? 'venció' : 'vence'} ${shortDate(c.dueAt)}`, late: diff < 0 };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** `2026-12-04` para `<input type="date">`, en hora local. */
function dateInputValue(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ChecklistPicker({ checklists, activeId, onSelect, compact, assign }: Props) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function save(c: Checklist, patch: AssignPatch) {
    if (!assign) return;
    setBusy(c.id);
    setError('');
    try {
      await assign.onAssign(c, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(null);
    }
  }

  const sorted = useMemo(() => {
    const list = [...checklists];
    list.sort((a, b) => a.progressPct - b.progressPct || a.title.localeCompare(b.title, 'es'));
    return list;
  }, [checklists]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(n) ||
        (c.template?.key || '').toLowerCase().includes(n),
    );
  }, [sorted, q]);

  if (!checklists.length) {
    return <EmptyLite icon="✓" title="Sin formatos" text={compact ? undefined : 'Se crean al dar de alta el show.'} />;
  }

  return (
    <div className={`fmt-picker ${compact ? 'fmt-picker--compact' : ''}`}>
      {!compact && checklists.length > 8 ? (
        <input
          className="hub-search"
          type="search"
          placeholder="Buscar formato…"
          aria-label="Buscar formato"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      ) : null}

      <div className="fmt-list">
        {filtered.map((c) => {
          const state = checklistState(c);
          const active = activeId === c.id;
          const pct = Math.max(0, Math.min(100, Math.round(c.progressPct || 0)));
          const editor = c.lastEditedBy?.fullName.split(' ')[0];
          const edited = editor
            ? `Editado por ${editor}${c.lastEditedAt ? ` · ${shortDate(c.lastEditedAt)}` : ''}`
            : '';
          const done = checklistBucket(c) !== 'todo';
          const due = done ? null : dueLabel(c);
          const row = (
            <button
              key={c.id}
              type="button"
              className={`fmt-row ${active ? 'is-active' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(c)}
            >
              <span className="fmt-row__main">
                <span className="fmt-row__name">{c.title}</span>
                {!compact && edited ? <span className="fmt-row__meta">{edited}</span> : null}
              </span>
              <span className="fmt-row__progress" aria-label={`${pct}% completo`}>
                <span className={`hub-bar ${pct >= 100 ? 'is-done' : ''}`} aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="fmt-row__pct" aria-hidden>
                  {pct}%
                </span>
              </span>
              <Pill tone={state.tone}>{state.label}</Pill>
            </button>
          );
          // Un formato ya entregado o listo sin responsable no necesita la línea: no hay nada que deberle.
          if (compact || (done && !c.owner)) return row;
          const open = editing === c.id;
          return (
            <div key={c.id} className={`fmt-item ${due?.late ? 'is-late' : ''}`}>
              {row}
              <div className="fmt-owner">
                {c.owner ? (
                  <span className="fmt-owner__who">
                    <span className="fmt-owner__face" aria-hidden>
                      {initials(c.owner.fullName)}
                    </span>
                    <span className="fmt-owner__name">{c.owner.fullName}</span>
                  </span>
                ) : (
                  <span className="fmt-owner__who fmt-owner__who--none">Sin responsable</span>
                )}
                {due ? <span className={`fmt-owner__due ${due.late ? 'is-late' : ''}`}>{due.text}</span> : null}
                {assign ? (
                  <button
                    type="button"
                    className="btn-quiet fmt-owner__edit"
                    aria-expanded={open}
                    aria-label={`${c.owner ? 'Cambiar' : 'Asignar'} responsable de ${c.title}`}
                    onClick={() => {
                      setError('');
                      setEditing(open ? null : c.id);
                    }}
                  >
                    {open ? 'Listo' : c.owner ? 'Cambiar' : 'Asignar'}
                  </button>
                ) : null}
              </div>
              {open && assign ? (
                <div className="fmt-assign">
                  <label>
                    <span>Responsable</span>
                    <select
                      value={c.ownerId ?? c.owner?.id ?? ''}
                      disabled={busy === c.id}
                      onChange={(e) => void save(c, { ownerId: e.target.value || null })}
                    >
                      <option value="">Sin responsable</option>
                      {assign.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Fecha límite</span>
                    <input
                      type="date"
                      value={dateInputValue(c.dueAt)}
                      disabled={busy === c.id}
                      onChange={(e) =>
                        // A las 18:00 locales: «vence el 4» no debe volverse el 3 por la zona horaria.
                        void save(c, { dueAt: e.target.value ? new Date(`${e.target.value}T18:00:00`).toISOString() : null })
                      }
                    />
                  </label>
                  {error ? (
                    <p className="fx-problem" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!filtered.length ? <p className="t-muted t-small">Sin resultados para «{q}»</p> : null}
    </div>
  );
}
