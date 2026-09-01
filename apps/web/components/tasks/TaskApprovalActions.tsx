'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { TaskRecord } from './task-types';

type Props = {
  task: TaskRecord;
  onDone: (task: TaskRecord) => void;
};

export function TaskApprovalActions({ task, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (task.status !== 'PENDING_APPROVAL') return null;

  async function approve() {
    setBusy(true);
    setError('');
    try {
      onDone(await api<TaskRecord>(`/tasks/${task.id}/approve`, { method: 'POST', body: '{}' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al aprobar');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!note.trim()) {
      setError('Escribe por qué no apruebas la entrega');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onDone(
        await api<TaskRecord>(`/tasks/${task.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ note: note.trim() }),
        }),
      );
      setRejectOpen(false);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al rechazar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-approval">
      {task.completionNote ? (
        <p className="task-approval__note">
          <span className="muted">Entrega:</span> {task.completionNote}
        </p>
      ) : null}
      {task.evidences?.length ? (
        <ul className="task-evidence-list">
          {task.evidences.map((ev) => (
            <li key={ev.id}>
              <a href={ev.fileUrl} target="_blank" rel="noreferrer">
                {ev.label || ev.fileUrl.split('/').pop()}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {!rejectOpen ? (
        <div className="row row--tight">
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => void approve()}>
            Aprobar entrega
          </button>
          <button
            className="btn ghost btn-sm btn-danger"
            type="button"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            Rechazar
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: '0.5rem' }}>
          <textarea
            className="field"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Qué falta o qué corregir…"
          />
          <div className="row row--tight">
            <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => void reject()}>
              Confirmar rechazo
            </button>
            <button className="btn ghost btn-sm" type="button" onClick={() => setRejectOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error ? <p className="muted kpi-sub" style={{ color: 'var(--danger)' }}>{error}</p> : null}
    </div>
  );
}
