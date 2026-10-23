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

/* ── Estado preciso: qué le falta (junta 23-10-2026) ─────────────────────── */

/**
 * «Por pagar» no decía si faltaba el comprobante, el día de cobro o solo el
 * clic. El API manda `state` en cada orden (`po-state.ts`, el mismo texto que
 * ven las apps); aquí solo se elige el tono de la píldora y, si una respuesta
 * vieja no lo trae, se arma lo mínimo con el estatus.
 */
export type PoStateKey =
  | 'unauthorized'
  | 'no_proof'
  | 'unpaid'
  | 'off_pay_day'
  | 'paid_no_proof'
  | 'complete'
  | 'rejected'
  | 'cancelled';

export type PoStateView = {
  key: PoStateKey;
  /** «Autorizada · sin comprobante» */
  label: string;
  /** «Falta el comprobante»; `null` si no falta nada. */
  missing: string | null;
  /** Qué hacer y hasta cuándo. */
  hint: string;
  tone?: string;
  section: Exclude<PoSection, 'all'> | null;
};

export const PO_STATE_ORDER: PoStateKey[] = [
  'unauthorized',
  'no_proof',
  'unpaid',
  'off_pay_day',
  'paid_no_proof',
  'complete',
  'rejected',
  'cancelled',
];

export const PO_STATE_LABELS: Record<PoStateKey, string> = {
  unauthorized: 'Sin autorizar',
  no_proof: 'Autorizada · sin comprobante',
  unpaid: 'Autorizada · sin pagar',
  off_pay_day: 'Fuera de día de cobro',
  paid_no_proof: 'Pagada · sin comprobante',
  complete: 'Pagada · completa',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

/** Tono de `Pill`: lleno solo lo que espera autorización (con botón al lado pasa a contorno). */
const PO_STATE_TONES: Record<PoStateKey, string> = {
  unauthorized: 'review',
  no_proof: 'info',
  unpaid: 'info',
  off_pay_day: 'info',
  paid_no_proof: 'warn',
  complete: 'paid',
  rejected: 'danger',
  cancelled: 'danger',
};

export function isPoStateKey(v: unknown): v is PoStateKey {
  return typeof v === 'string' && (PO_STATE_ORDER as string[]).includes(v);
}

type PoStateSource = {
  status: string;
  paymentMethod?: string | null;
  proofCount?: number;
  proofs?: unknown[] | null;
  state?: PoStateView | null;
};

/** El estado que mandó el API o, si no vino, uno mínimo armado con el estatus (sin días de cobro). */
export function poStateView(po: PoStateSource): PoStateView {
  if (po.state && isPoStateKey(po.state.key)) return po.state;
  const proofs = po.proofCount ?? po.proofs?.length ?? 0;
  const needsProof = poNeedsProof(po.paymentMethod || 'TRANSFERENCIA');
  const make = (key: PoStateKey, missing: string | null, hint: string): PoStateView => ({
    key,
    label: PO_STATE_LABELS[key],
    missing,
    hint,
    section: poSectionOf(po.status),
  });
  switch (po.status) {
    case 'PENDING_AUTH':
    case 'DRAFT':
      return make('unauthorized', 'Falta autorizar', 'Falta autorizar: hasta entonces no se puede pagar.');
    case 'AUTHORIZED':
      return needsProof && proofs === 0
        ? make('no_proof', 'Falta el comprobante', 'Falta el comprobante: súbelo y con eso ya se puede marcar pagada.')
        : make('unpaid', 'Falta pagar', 'Lista para pagar: márcala pagada en día de cobro.');
    case 'PAID':
      return needsProof && proofs === 0
        ? make('paid_no_proof', 'Falta el comprobante', 'Se marcó pagada sin comprobante: súbelo para cerrarla.')
        : make('complete', null, 'Pagada. No falta nada.');
    case 'REJECTED':
      return make('rejected', null, 'No se autorizó.');
    case 'CANCELLED':
      return make('cancelled', null, 'Se dio de baja.');
    default:
      return { key: 'unauthorized', label: poStatusPill(po.status).label, missing: null, hint: '', section: null };
  }
}


/** Píldora del estado preciso; con acción en la fila, el lleno pasa a contorno (un relleno por fila). */
export function poStatePill(state: PoStateView): { label: string; tone: string } {
  return { label: state.label, tone: PO_STATE_TONES[state.key] ?? 'draft' };
}

/** Chips de filtro: estados presentes en la lista, con cuántas órdenes hay en cada uno. */
export function poStateChips(states: PoStateView[]): Array<{ key: PoStateKey; label: string; count: number }> {
  const counts = new Map<PoStateKey, number>();
  for (const s of states) counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
  return PO_STATE_ORDER.filter((k) => counts.has(k)).map((key) => ({
    key,
    label: PO_STATE_LABELS[key],
    count: counts.get(key) ?? 0,
  }));
}

/** Sección de la torre donde vive un estado (para abrir `?estado=` en su pestaña). */
export function poSectionOfState(key: PoStateKey): PoSection {
  if (key === 'unauthorized') return 'auth';
  if (key === 'no_proof' || key === 'unpaid' || key === 'off_pay_day') return 'pay';
  if (key === 'paid_no_proof' || key === 'complete') return 'paid';
  return 'all';
}
