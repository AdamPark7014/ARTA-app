/**
 * Qué le falta a una orden de compra, dicho con precisión.
 *
 * Junta con el cliente (23-10-2026): «órdenes de compra más específicas, como
 * sin pagar, sin tal, ser más puntuales». «Por pagar» no decía si faltaba el
 * comprobante, el día de cobro o solo el clic; «Pagada» no avisaba cuando el
 * comprobante nunca llegó. Este helper es la única fuente del texto: lo usan la
 * lista de la torre, el detalle, la pestaña OC del evento, el inicio y las apps.
 *
 * Solo lee: no cambia permisos ni reglas de pago (las sigue imponiendo el
 * controlador). El modelo no tiene facturas, así que no hay «sin factura».
 */
import { evaluatePoWindow, readPoWindow, type PoWindowState } from './po-window';

export type PoStateKey =
  | 'unauthorized'
  | 'no_proof'
  | 'unpaid'
  | 'off_pay_day'
  | 'paid_no_proof'
  | 'complete'
  | 'rejected'
  | 'cancelled';

/** `action`: a alguien le toca moverla · `waiting`: lista, pero hoy no se puede · `warning`: cerrada con un hueco. */
export type PoStateTone = 'action' | 'waiting' | 'warning' | 'done' | 'stopped';

export type PoSectionKey = 'auth' | 'pay' | 'paid';

export type PoState = {
  key: PoStateKey;
  /** Píldora: «Autorizada · sin comprobante». */
  label: string;
  /** Qué falta, corto: «Falta el comprobante». `null` si no falta nada. */
  missing: string | null;
  /** Qué hacer y hasta cuándo, en una frase. */
  hint: string;
  tone: PoStateTone;
  /** Sección de la torre (Por autorizar / Por pagar / Pagadas); rechazadas y canceladas solo en «Todas». */
  section: PoSectionKey | null;
};

/** Orden de los filtros: el recorrido de la orden, de lo que falta a lo cerrado. */
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

const METHOD_WORD: Record<string, string> = {
  EFECTIVO: 'efectivo',
  TRANSFERENCIA: 'transferencia',
  CHEQUE: 'cheque',
  TARJETA: 'tarjeta',
  OTRO: 'otro medio',
};

const CLOSED_EVENT = new Set(['CLOSED', 'CANCELLED']);

export type PoStateInput = {
  status: string;
  paymentMethod?: string | null;
  /** Comprobantes adjuntos; si no viene, se cuentan `proofs`. */
  proofCount?: number | null;
  proofs?: unknown[] | null;
  /** Estado del evento: cerrado o cancelado ya no deja mover la orden. */
  eventStatus?: string | null;
};

/** Días de cobro ya evaluados para hoy (o `null` si no se conocen). */
export type PoPayDayContext = Pick<PoWindowState, 'open' | 'nextOpenLabel' | 'scheduleLabel'> & {
  config: { enabled: boolean };
};

function nextPayDay(win: PoPayDayContext | null | undefined): string | null {
  if (!win?.nextOpenLabel) return null;
  // «mañana (miércoles)» → «mañana»; «el lunes» se queda.
  return win.nextOpenLabel.startsWith('mañana') ? 'mañana' : win.nextOpenLabel;
}

/** Para los avisos: si hoy se paga y, si no, cuándo. `null` si la regla está apagada. */
export function payDayOf(win: PoPayDayContext | null | undefined): { open: boolean; next: string | null } | null {
  if (!win || !win.config.enabled) return null;
  return { open: win.open, next: nextPayDay(win) };
}

export function poStateOf(po: PoStateInput, win?: PoPayDayContext | null): PoState {
  const method = po.paymentMethod || 'TRANSFERENCIA';
  const needsProof = method !== 'EFECTIVO';
  const proofs = po.proofCount ?? po.proofs?.length ?? 0;
  const closed = !!po.eventStatus && CLOSED_EVENT.has(po.eventStatus);
  const word = METHOD_WORD[method] || 'transferencia';
  const make = (
    key: PoStateKey,
    tone: PoStateTone,
    section: PoSectionKey | null,
    missing: string | null,
    hint: string,
  ): PoState => ({ key, label: PO_STATE_LABELS[key], missing, hint, tone, section });

  switch (po.status) {
    case 'PENDING_AUTH':
    case 'DRAFT':
      return make(
        'unauthorized',
        'action',
        'auth',
        'Falta autorizar',
        closed
          ? 'El evento ya se cerró: esta orden se quedó sin autorizar.'
          : po.status === 'DRAFT'
            ? 'Falta autorizar: la regresaron a borrador; hasta que la autoricen no se puede pagar.'
            : 'Falta autorizar: espera el visto bueno de dirección; hasta entonces no se puede pagar.',
      );
    case 'AUTHORIZED': {
      if (closed) {
        const noProof = needsProof && proofs === 0;
        return make(
          noProof ? 'no_proof' : 'unpaid',
          'action',
          'pay',
          noProof ? 'Falta el comprobante' : 'Falta pagar',
          'El evento ya se cerró: esta orden se quedó autorizada sin pagar.',
        );
      }
      if (needsProof && proofs === 0) {
        return make(
          'no_proof',
          'action',
          'pay',
          'Falta el comprobante',
          `Falta el comprobante: pago por ${word}; súbelo y con eso ya se puede marcar pagada.`,
        );
      }
      const ready = needsProof ? 'Ya tiene comprobante' : 'En efectivo no se pide comprobante';
      if (win && win.config.enabled && !win.open) {
        const next = nextPayDay(win);
        return make(
          'off_pay_day',
          'waiting',
          'pay',
          next ? `Se paga ${next}` : 'Falta el día de cobro',
          `Lista para pagar. ${ready}; hoy no es día de cobro${next ? `: se marca pagada ${next}` : ''} (${win.scheduleLabel}).`,
        );
      }
      return make(
        'unpaid',
        'action',
        'pay',
        'Falta pagar',
        `Lista para pagar. ${ready}: márcala pagada${win?.config.enabled ? ' hoy, que es día de cobro' : ''}.`,
      );
    }
    case 'PAID':
      if (needsProof && proofs === 0) {
        return make(
          'paid_no_proof',
          'warning',
          'paid',
          'Falta el comprobante',
          `Se marcó pagada por ${word} sin comprobante: súbelo para cerrarla.`,
        );
      }
      return make(
        'complete',
        'done',
        'paid',
        null,
        needsProof ? 'Pagada y con comprobante. No falta nada.' : 'Pagada en efectivo. No falta nada.',
      );
    case 'REJECTED':
      return make('rejected', 'stopped', null, null, 'No se autorizó. Si sigue haciendo falta, crea otra.');
    case 'CANCELLED':
      return make('cancelled', 'stopped', null, null, 'Se dio de baja. No se pagará.');
    default:
      return {
        key: 'unauthorized',
        label: po.status,
        missing: null,
        hint: '',
        tone: 'action',
        section: null,
      };
  }
}

/** Conteo y monto por estado preciso, en el orden de `PO_STATE_ORDER`. */
export function poStateCounts(
  rows: Array<{ state: Pick<PoState, 'key'>; amount: unknown }>,
): Array<{ key: PoStateKey; label: string; count: number; amount: number }> {
  const acc = new Map<PoStateKey, { count: number; amount: number }>();
  for (const r of rows) {
    const cur = acc.get(r.state.key) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(r.amount || 0);
    acc.set(r.state.key, cur);
  }
  return PO_STATE_ORDER.filter((k) => acc.has(k)).map((key) => ({
    key,
    label: PO_STATE_LABELS[key],
    count: acc.get(key)!.count,
    amount: Math.round(acc.get(key)!.amount * 100) / 100,
  }));
}

type OrgReader = {
  organization: {
    findUnique: (args: { where: { id: string }; select: { settingsJson: true } }) => Promise<{ settingsJson: unknown } | null>;
  };
};

/** Días de cobro de la organización, evaluados para hoy. Nunca lanza: sin datos, los de Arta. */
export async function payWindowFor(
  prisma: OrgReader,
  organizationId: string | null | undefined,
  now: Date = new Date(),
): Promise<PoWindowState> {
  let settings: unknown = null;
  if (organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settingsJson: true },
      });
      settings = org?.settingsJson ?? null;
    } catch {
      settings = null;
    }
  }
  return evaluatePoWindow(readPoWindow(settings), now);
}

/** Pega `state` a una orden (lista, detalle, respuestas de cambios). */
export function withPoState<T extends PoStateInput>(
  po: T,
  win?: PoPayDayContext | null,
  eventStatus?: string | null,
): T & { state: PoState } {
  return { ...po, state: poStateOf(eventStatus ? { ...po, eventStatus } : po, win) };
}
