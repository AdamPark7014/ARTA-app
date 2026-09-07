/** Formas de pago de una OC. En efectivo no hay comprobante. */
export const PO_PAYMENT_METHODS = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA',
  'OTRO',
] as const;

export type PoPaymentMethod = (typeof PO_PAYMENT_METHODS)[number];

export const PO_PAYMENT_LABELS: Record<PoPaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  OTRO: 'Otro',
};

export function isPoPaymentMethod(v: unknown): v is PoPaymentMethod {
  return typeof v === 'string' && (PO_PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Solo transferencia / tarjeta / otro requieren comprobante. */
export function poNeedsProof(method?: string | null): boolean {
  return method !== 'EFECTIVO';
}

export function poPaymentLabel(method?: string | null): string {
  if (method && isPoPaymentMethod(method)) return PO_PAYMENT_LABELS[method];
  return 'Transferencia';
}
