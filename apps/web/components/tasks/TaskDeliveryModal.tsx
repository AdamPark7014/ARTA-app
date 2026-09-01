'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import type { TaskRecord } from './task-types';

type Props = {
  task: TaskRecord;
  onClose: () => void;
  onDone: (task: TaskRecord) => void;
};

export function TaskDeliveryModal({ task, onClose, onDone }: Props) {
  const [note, setNote] = useState(task.completionNote || '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (!note.trim() && !files.length && !(task.evidences?.length)) {
      setError('Agrega una nota o al menos un archivo de evidencia');
      setBusy(false);
      return;
    }
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await api(`/tasks/${task.id}/evidence`, { method: 'POST', body: fd });
      }
      const updated = await api<TaskRecord>(`/tasks/${task.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ completionNote: note }),
      });
      onDone(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entregar la tarea');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal panel"
        role="dialog"
        aria-labelledby="task-delivery-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2 id="task-delivery-title">Entregar tarea</h2>
          <button className="btn ghost btn-sm" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="panel-body">
          <p className="muted kpi-sub" style={{ marginTop: 0 }}>
            <strong>{task.title}</strong>
            {task.createdBy ? ` · pidió ${task.createdBy.fullName}` : null}
          </p>
          <form className="form" onSubmit={onSubmit}>
            <label>
              ¿Qué hiciste? (evidencia escrita)
              <textarea
                className="field"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe lo realizado, referencias, números, contactos…"
              />
            </label>
            <label>
              Archivos (foto, PDF, Excel…)
              <input
                className="field"
                type="file"
                multiple
                accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </label>
            {task.evidences?.length ? (
              <p className="muted kpi-sub">
                Ya hay {task.evidences.length} archivo(s) adjunto(s) en esta tarea.
              </p>
            ) : null}
            {task.rejectionNote ? (
              <div className="flash flash--warn" style={{ marginBottom: '0.75rem' }}>
                Corrección pedida: {task.rejectionNote}
              </div>
            ) : null}
            {error ? (
              <div className="flash flash--error" style={{ marginBottom: '0.75rem' }}>
                {error}
              </div>
            ) : null}
            <div className="row row--tight">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar entrega'}
              </button>
              <button className="btn ghost" type="button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
