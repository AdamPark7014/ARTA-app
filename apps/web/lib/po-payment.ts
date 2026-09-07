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

export type PoNextStepTone = 'wait' | 'todo' | 'ready' | 'done' | 'stop';

export type PoNextStep = {
  /** Etiqueta corta para la píldora de la tabla. */
  label: string;
  /** Frase que dice qué hacer, en el idioma del equipo, no del sistema. */
  hint: string;
  tone: PoNextStepTone;
};

/**
 * Qué le toca ahora a esta orden.
 *
 * Existe porque el panel enseñaba un botón «Marcar pagado» apagado con la
 * explicación metida en un `title`: en un botón deshabilitado el navegador ni
 * siquiera lo enseña, así que la persona veía un botón muerto y ningún motivo.
 * Aquí el motivo es texto visible, y lo comparten la torre de OC y la pestaña
 * del evento para que no digan cosas distintas de la misma orden.
 */
export function poNextStep(po: {
  status: string;
  paymentMethod?: string | null;
  proofCount?: number;
}): PoNextStep {
  const proofs = po.proofCount ?? 0;
  if (po.status === 'PAID') {
    return { label: 'Pagada', hint: 'Cerrada. No queda nada por hacer.', tone: 'done' };
  }
  if (po.status === 'REJECTED') {
    return { label: 'Rechazada', hint: 'No se autorizó. Crea otra si sigue haciendo falta.', tone: 'stop' };
  }
  if (po.status === 'CANCELLED') {
    return { label: 'Cancelada', hint: 'Se dio de baja.', tone: 'stop' };
  }
  if (po.status !== 'AUTHORIZED') {
    return {
      label: 'Falta autorizar',
      hint: 'Esperando la autorización de dirección. Hasta entonces no se puede pagar.',
      tone: 'wait',
    };
  }
  if (poNeedsProof(po.paymentMethod) && proofs === 0) {
    return {
      label: 'Falta el comprobante',
      hint: `Pago por ${poPaymentLabel(po.paymentMethod).toLowerCase()}: sube el comprobante y con eso ya se puede marcar pagada.`,
      tone: 'todo',
    };
  }
  return {
    label: 'Lista para pagar',
    hint: poNeedsProof(po.paymentMethod)
      ? 'Ya tiene comprobante. Márcala pagada cuando salga el dinero.'
      : 'En efectivo no se pide comprobante. Márcala pagada cuando salga el dinero.',
    tone: 'ready',
  };
}
