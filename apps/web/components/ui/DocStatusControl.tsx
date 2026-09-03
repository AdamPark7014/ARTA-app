'use client';

import { useState } from 'react';
import type { DocStatus } from '@/components/events/event-detail.types';

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  DRAFT: 'Borrador',
  REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  SEALED: 'Sellado',
};

const TONE: Record<DocStatus, string> = {
  DRAFT: 'muted-tone',
  REVIEW: 'warn',
  APPROVED: 'ok',
  SEALED: 'arta',
};

/** Píldora de estado. Se ve en todas partes, aunque no se pueda cambiar. */
export function DocStatusBadge({ status }: { status?: DocStatus | null }) {
  if (!status) return null;
  return <span className={`badge ${TONE[status]}`}>{DOC_STATUS_LABEL[status]}</span>;
}

/** Roles que pueden aprobar y sellar — misma regla que el API. */
const APPROVERS = new Set(['dir_general', 'super_admin', 'gerente_arta', 'dir_auditorio']);
const UNSEALERS = new Set(['dir_general', 'super_admin']);

type Props = {
  status: DocStatus;
  roleKey: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: DocStatus, reason?: string) => Promise<void> | void;
};

/**
 * Botones de transición del documento.
 *
 * Reglas de la casa, para que el flujo no estorbe:
 * - **Pedir revisión es autoservicio**: nadie tiene que pedir permiso para
 *   pedir que le revisen. Y `REVIEW` no bloquea la edición: es una bandera.
 * - Aprobar y sellar solo los ve quien puede hacerlo, así que no aparecen
 *   botones que van a dar 403.
 * - Reabrir algo sellado pide motivo por escrito, porque queda en el historial.
 */
export function DocStatusControl({ status, roleKey, disabled, busy, onChange }: Props) {
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const canApprove = APPROVERS.has(roleKey);
  const canUnseal = UNSEALERS.has(roleKey);

  async function go(next: DocStatus, why?: string) {
    await onChange(next, why);
    setReopening(false);
    setReason('');
  }

  if (status === 'SEALED') {
    if (!canUnseal) {
      return (
        <span className="muted kpi-sub">Sellado — solo dirección puede reabrirlo</span>
      );
    }
    return reopening ? (
      <div className="status-reopen">
        <input
          className="field"
          placeholder="¿Por qué se reabre? (queda en el historial)"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy || reason.trim().length < 5}
          onClick={() => go('DRAFT', reason.trim())}
        >
          Reabrir
        </button>
        <button className="btn ghost btn-sm" type="button" onClick={() => setReopening(false)}>
          Cancelar
        </button>
      </div>
    ) : (
      <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => setReopening(true)}>
        Reabrir con motivo
      </button>
    );
  }

  return (
    <div className="row row--tight">
      {status === 'DRAFT' ? (
        <button className="btn ghost btn-sm" type="button" disabled={disabled || busy} onClick={() => go('REVIEW')}>
          Mandar a revisión
        </button>
      ) : null}

      {status === 'REVIEW' ? (
        <button className="btn ghost btn-sm" type="button" disabled={disabled || busy} onClick={() => go('DRAFT')}>
          Volver a borrador
        </button>
      ) : null}

      {canApprove && (status === 'DRAFT' || status === 'REVIEW') ? (
        <button className="btn btn-sm" type="button" disabled={disabled || busy} onClick={() => go('APPROVED')}>
          Aprobar
        </button>
      ) : null}

      {status === 'APPROVED' ? (
        <>
          {canApprove ? (
            <button className="btn btn-sm" type="button" disabled={busy} onClick={() => go('SEALED')}>
              Sellar
            </button>
          ) : null}
          {canApprove ? (
            <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => go('DRAFT')}>
              Devolver a borrador
            </button>
          ) : (
            <span className="muted kpi-sub">Aprobado — pide a dirección devolverlo a borrador</span>
          )}
        </>
      ) : null}
    </div>
  );
}
