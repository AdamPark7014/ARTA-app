'use client';

import type { ReviewStep } from '@/lib/review-flow';

/**
 * Los botones que mueven una campaña por Borrador → En revisión → Autorizada →
 * Pagada. Solo aparece lo que la persona puede hacer en el estado actual.
 */
export function ReviewActions({
  step,
  closed,
  canEdit,
  canApprove,
  canMarkPaid,
  canSubmit,
  busy,
  onMove,
}: {
  step: ReviewStep;
  closed: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
  /** Hay algo que mandar (al menos un concepto). */
  canSubmit: boolean;
  busy: boolean;
  onMove: (next: ReviewStep) => void;
}) {
  if (closed) return null;

  if (step === 'DRAFT') {
    return canEdit ? (
      <button className="btn btn-sm" type="button" disabled={busy || !canSubmit} onClick={() => onMove('REVIEW')}>
        Enviar a revisión
      </button>
    ) : null;
  }

  if (step === 'REVIEW') {
    if (canApprove) {
      return (
        <>
          <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => onMove('DRAFT')}>
            Regresar
          </button>
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => onMove('AUTHORIZED')}>
            Autorizar
          </button>
        </>
      );
    }
    return canEdit ? (
      <button className="btn-quiet" type="button" disabled={busy} onClick={() => onMove('DRAFT')}>
        Regresar a borrador
      </button>
    ) : null;
  }

  if (step === 'AUTHORIZED') {
    return (
      <>
        {canApprove ? (
          <button className="btn-quiet" type="button" disabled={busy} onClick={() => onMove('DRAFT')}>
            Reabrir
          </button>
        ) : null}
        {canApprove || canMarkPaid ? (
          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => onMove('PAID')}>
            Marcar pagada
          </button>
        ) : null}
      </>
    );
  }

  return canApprove ? (
    <button className="btn-quiet" type="button" disabled={busy} onClick={() => onMove('AUTHORIZED')}>
      Deshacer pago
    </button>
  ) : null;
}
