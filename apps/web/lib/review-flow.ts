/**
 * Borrador → En revisión → Autorizada → Pagada.
 *
 * Lo comparten la campaña publicitaria y la campaña de convenios (junta
 * 11-09-2026: «enviar a revisión» y «mostrar el estatus de Pagada»).
 */
export const REVIEW_STEPS = ['DRAFT', 'REVIEW', 'AUTHORIZED', 'PAID'] as const;

export type ReviewStep = (typeof REVIEW_STEPS)[number];

export const REVIEW_LABELS: Record<ReviewStep, string> = {
  DRAFT: 'Borrador',
  REVIEW: 'En revisión',
  AUTHORIZED: 'Autorizada',
  PAID: 'Pagada',
};

/** Tono de la píldora (`.pill--*`). */
export const REVIEW_TONES: Record<ReviewStep, string> = {
  DRAFT: 'draft',
  REVIEW: 'review',
  AUTHORIZED: 'ok',
  PAID: 'paid',
};

export function reviewStep(value?: string | null, authorized?: boolean): ReviewStep {
  if (value && (REVIEW_STEPS as readonly string[]).includes(value)) return value as ReviewStep;
  return authorized ? 'AUTHORIZED' : 'DRAFT';
}

/** Solo en borrador se editan los conceptos: lo que está en revisión no se mueve. */
export function reviewEditable(step: ReviewStep): boolean {
  return step === 'DRAFT';
}

/** Quién autoriza campaña (regla del API): gerencia de Arta y dirección. */
export const REVIEW_APPROVER_ROLES = new Set(['gerente_arta', 'dir_general', 'dir_adjunta', 'super_admin']);
