'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { FieldSearch } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Checklist } from './event-detail.types';

function signatureStatus(c: Checklist) {
  if (c.authorizedAt) return { label: 'Autorizado', tone: 'ok' as const };
  if (c.deliveredAt) return { label: 'Entregado', tone: 'warn' as const };
  if (c.progressPct >= 100) return { label: 'Completo', tone: 'ok' as const };
  return { label: 'En progreso', tone: 'raw' as const };
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
    return (
      <EmptyState
        title="Sin formatos en este evento"
        description="Las plantillas se crean al dar de alta el show. Si falta alguna, revisa plantillas en el panel."
      />
    );
  }

  return (
    <div className={`checklist-picker ${compact ? 'checklist-picker--compact' : ''}`}>
      {!compact ? (
        <p className="muted checklist-picker__hint">
          Elige un formato para completar ítems, generar PDF y firmar.
        </p>
      ) : null}
      {checklists.length > 5 ? (
        <FieldSearch
          value={q}
          onChange={setQ}
          placeholder="Buscar formato…"
          label="Buscar checklist"
          maxWidth={9999}
        />
      ) : null}
      <div className="checklist-picker__list" role="list">
        {filtered.map((c) => {
          const sig = signatureStatus(c);
          const active = activeId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="listitem"
              className={`format-card ${active ? 'format-card--active' : ''}`}
              onClick={() => onSelect(c)}
            >
              <div className="format-card__head">
                <span className="format-card__key">{c.template?.key || 'FMT'}</span>
                <StatusBadge value={sig.label} kind="raw" className={sig.tone} />
              </div>
              <strong className="format-card__title">{c.title}</strong>
              <div className="format-card__progress">
                <div className="progress">
                  <span style={{ width: `${c.progressPct}%` }} />
                </div>
                <span className="muted kpi-sub">{c.progressPct}%</span>
              </div>
              <div className="format-card__meta muted kpi-sub">
                {c.pdfUrl ? 'PDF listo' : 'Sin PDF'}
                {c.lastEditedBy ? ` · ${c.lastEditedBy.fullName.split(' ')[0]}` : ''}
              </div>
            </button>
          );
        })}
        {!filtered.length ? (
          <p className="muted checklist-picker__empty">Sin resultados para “{q}”</p>
        ) : null}
      </div>
    </div>
  );
}
