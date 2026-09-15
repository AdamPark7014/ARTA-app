/** Formas de pago de una OC. En efectivo no hay comprobante. */
export const PO_PAYMENT_METHODS = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'CHEQUE',
  'TARJETA',
  'OTRO',
] as const;

export type PoPaymentMethod = (typeof PO_PAYMENT_METHODS)[number];

/**
 * Las que ofrece el machote del cliente. TARJETA y OTRO quedan para órdenes
 * viejas: se siguen mostrando y conservando, pero ya no se ofrecen.
 */
export const PO_PAYMENT_CHOICES = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE'] as const;

export const PO_PAYMENT_LABELS: Record<PoPaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
  OTRO: 'Otro',
};

export function isPoPaymentMethod(v: unknown): v is PoPaymentMethod {
  return typeof v === 'string' && (PO_PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Todo lo que no sea efectivo pide comprobante (cheque incluido). */
export function poNeedsProof(method?: string | null): boolean {
  return method !== 'EFECTIVO';
}

export function poPaymentLabel(method?: string | null, paymentOther?: string | null): string {
  if (method === 'OTRO' && paymentOther?.trim()) return paymentOther.trim();
  if (method && isPoPaymentMethod(method)) return PO_PAYMENT_LABELS[method];
  return 'Transferencia';
}

/** Nota libre cuando el método es OTRO, guardada al inicio de description. */
const PAY_NOTE_RE = /^Forma de pago:\s*(.+?)(?:\n|$)/i;

export function splitPoDescription(desc?: string | null): {
  paymentOther: string;
  description: string;
} {
  if (!desc) return { paymentOther: '', description: '' };
  const m = desc.match(PAY_NOTE_RE);
  if (!m) return { paymentOther: '', description: desc };
  return {
    paymentOther: m[1].trim(),
    description: desc.slice(m[0].length).replace(/^\n/, '').trim(),
  };
}

export function joinPoDescription(
  method: string,
  paymentOther: string,
  description: string,
): string | undefined {
  const parts: string[] = [];
  if (method === 'OTRO' && paymentOther.trim()) {
    parts.push(`Forma de pago: ${paymentOther.trim()}`);
  }
  if (description.trim()) parts.push(description.trim());
  return parts.length ? parts.join('\n') : undefined;
}

/* ── Machote: beneficiario e IVA ─────────────────────────────────────────── */

export const PO_PAYEE_TYPES = ['PROVEEDOR', 'OTRO'] as const;
export type PoPayeeType = (typeof PO_PAYEE_TYPES)[number];
export const PO_PAYEE_LABELS: Record<PoPayeeType, string> = {
  PROVEEDOR: 'Proveedor',
  OTRO: 'Otro',
};

export const PO_IVA_RATE = 0.16;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type LineLike = { qty?: number | string | null; unitPrice?: number | string | null };

function numOrNullish(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Cantidad × precio; `null` si falta alguno (se pinta «—», nunca «0»). */
export function poLineTotal(line: LineLike): number | null {
  const q = numOrNullish(line.qty);
  const p = numOrNullish(line.unitPrice);
  if (q === null || p === null) return null;
  return round2(q * p);
}

/** Subtotal, IVA y total de unas partidas en captura. */
export function poTotals(lines: LineLike[], withIva: boolean) {
  const subtotal = round2(lines.reduce((s, l) => s + (poLineTotal(l) ?? 0), 0));
  const iva = withIva ? round2(subtotal * PO_IVA_RATE) : 0;
  return { subtotal, iva, total: round2(subtotal + iva) };
}

/** Lo mismo para una orden guardada: el total es el que fijó el API. */
export function poSavedTotals(po: {
  amount: number | string;
  withIva?: boolean | null;
  lines?: LineLike[] | null;
}) {
  const total = round2(Number(po.amount || 0));
  const withIva = !!po.withIva;
  const subtotal = po.lines?.length
    ? round2(po.lines.reduce((s, l) => s + (poLineTotal(l) ?? 0), 0))
    : withIva
      ? round2(total / (1 + PO_IVA_RATE))
      : total;
  return { subtotal, iva: withIva ? round2(total - subtotal) : 0, total };
}

/** «2», «1.5» — sin ceros de relleno. */
export function poQtyLabel(qty?: number | string | null): string {
  const n = numOrNullish(qty);
  if (n === null) return '';
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

/* ── Secciones y estados ─────────────────────────────────────────────────── */

/** Revisión 11-09-2026: «POR AUTORIZAR, POR PAGAR, PAGADAS Y TODAS». */
export type PoSection = 'auth' | 'pay' | 'paid' | 'all';

export const PO_SECTION_LABELS: Record<PoSection, string> = {
  auth: 'Por autorizar',
  pay: 'Por pagar',
  paid: 'Pagadas',
  all: 'Todas',
};

export function poIsPending(status: string): boolean {
  return status === 'PENDING_AUTH' || status === 'DRAFT';
}

/** Rechazadas y canceladas solo viven en «Todas». */
export function poSectionOf(status: string): Exclude<PoSection, 'all'> | null {
  if (poIsPending(status)) return 'auth';
  if (status === 'AUTHORIZED') return 'pay';
  if (status === 'PAID') return 'paid';
  return null;
}

export function poInSection(status: string, section: PoSection): boolean {
  return section === 'all' || poSectionOf(status) === section;
}

export type PoSectionStats = Record<PoSection, { count: number; amount: number }>;

export function poSectionStats(
  list: Array<{ status: string; amount: number | string }>,
): PoSectionStats {
  const out: PoSectionStats = {
    auth: { count: 0, amount: 0 },
    pay: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    all: { count: 0, amount: 0 },
  };
  for (const po of list) {
    const amount = Number(po.amount || 0);
    out.all.count += 1;
    out.all.amount += amount;
    const s = poSectionOf(po.status);
    if (s) {
      out[s].count += 1;
      out[s].amount += amount;
    }
  }
  return out;
}

export function poSectionOptions(stats: PoSectionStats) {
  return (['auth', 'pay', 'paid', 'all'] as const).map((key) => ({
    key,
    label: PO_SECTION_LABELS[key],
    count: stats[key].count,
  }));
}

/** Etiqueta y tono de la píldora (tonos de `Pill`). */
export function poStatusPill(status: string): { label: string; tone: string } {
  switch (status) {
    case 'PENDING_AUTH':
    case 'DRAFT':
      return { label: 'Por autorizar', tone: 'review' };
    case 'AUTHORIZED':
      return { label: 'Por pagar', tone: 'info' };
    case 'PAID':
      return { label: 'Pagada', tone: 'paid' };
    case 'REJECTED':
      return { label: 'Rechazada', tone: 'danger' };
    case 'CANCELLED':
      return { label: 'Cancelada', tone: 'danger' };
    default:
      return { label: status, tone: 'draft' };
  }
}

/** «12 sept» (o «12 sept 2025» si no es de este año). */
export function poDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/* ── Qué sigue (se conserva para quien lo use) ───────────────────────────── */

export type PoNextStepTone = 'wait' | 'todo' | 'ready' | 'done' | 'stop';

export type PoNextStep = {
  /** Etiqueta corta para la píldora de la tabla. */
  label: string;
  /** Frase que dice qué hacer, en el idioma del equipo, no del sistema. */
  hint: string;
  tone: PoNextStepTone;
};

/** Qué le toca ahora a esta orden. */
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
      ? 'Ya tiene comprobante. Márcala pagada en día de cobro.'
      : 'En efectivo no se pide comprobante. Márcala pagada en día de cobro.',
    tone: 'ready',
  };
}
