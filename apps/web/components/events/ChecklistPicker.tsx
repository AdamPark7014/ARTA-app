'use client';

import { useMemo, useState } from 'react';
import { EmptyLite, Pill } from '@/components/ui/Lite';
import type { Checklist } from './event-detail.types';

/** Grupo del formato para filtrar la lista: falta trabajo, en revisión o listo. */
export type ChecklistBucket = 'todo' | 'review' | 'ready';

export function checklistBucket(c: Checklist): ChecklistBucket {
  if (c.status === 'SEALED' || c.status === 'APPROVED' || c.authorizedAt) return 'ready';
  if (c.status === 'REVIEW' || c.deliveredAt) return 'review';
  return 'todo';
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

type Props = {
  checklists: Checklist[];
  activeId?: string | null;
  onSelect: (c: Checklist) => void;
  compact?: boolean;
};

export function ChecklistPicker({ checklists, activeId, onSelect, compact }: Props) {
  const [q, setQ] = useState('');

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
          return (
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
        })}
      </div>

      {!filtered.length ? <p className="t-muted t-small">Sin resultados para «{q}»</p> : null}
    </div>
  );
}
