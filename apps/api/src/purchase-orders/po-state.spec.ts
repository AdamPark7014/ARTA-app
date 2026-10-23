import { evaluatePoWindow, DEFAULT_PO_WINDOW } from './po-window';
import { payDayOf, payWindowFor, poStateCounts, poStateOf, withPoState } from './po-state';

/** Lunes 14-sep-2026 (día de cobro) y martes 15 (no lo es), a mediodía en Puebla. */
const MONDAY = new Date('2026-09-14T18:00:00.000Z');
const TUESDAY = new Date('2026-09-15T18:00:00.000Z');
const payDay = evaluatePoWindow(DEFAULT_PO_WINDOW, MONDAY);
const offDay = evaluatePoWindow(DEFAULT_PO_WINDOW, TUESDAY);

describe('poStateOf · qué le falta a la orden', () => {
  it('por autorizar (y borrador) → «Sin autorizar»', () => {
    const s = poStateOf({ status: 'PENDING_AUTH' }, payDay);
    expect(s).toEqual(expect.objectContaining({ key: 'unauthorized', label: 'Sin autorizar', missing: 'Falta autorizar', section: 'auth' }));
    expect(poStateOf({ status: 'DRAFT' }, payDay).key).toBe('unauthorized');
    expect(poStateOf({ status: 'DRAFT' }, payDay).hint).toContain('borrador');
  });

  it('autorizada por transferencia sin comprobante → «Autorizada · sin comprobante»', () => {
    const s = poStateOf({ status: 'AUTHORIZED', paymentMethod: 'TRANSFERENCIA', proofs: [] }, payDay);
    expect(s.key).toBe('no_proof');
    expect(s.label).toBe('Autorizada · sin comprobante');
    expect(s.missing).toBe('Falta el comprobante');
    expect(s.hint).toContain('pago por transferencia');
    expect(s.section).toBe('pay');
  });

  it('el comprobante falta aunque hoy no sea día de cobro: se puede subir cualquier día', () => {
    expect(poStateOf({ status: 'AUTHORIZED', paymentMethod: 'CHEQUE', proofCount: 0 }, offDay).key).toBe('no_proof');
  });

  it('con comprobante (o en efectivo) y en día de cobro → «Autorizada · sin pagar»', () => {
    const withProof = poStateOf({ status: 'AUTHORIZED', paymentMethod: 'TRANSFERENCIA', proofCount: 1 }, payDay);
    expect(withProof.key).toBe('unpaid');
    expect(withProof.label).toBe('Autorizada · sin pagar');
    expect(withProof.hint).toContain('Lista para pagar');
    const cash = poStateOf({ status: 'AUTHORIZED', paymentMethod: 'EFECTIVO' }, payDay);
    expect(cash.key).toBe('unpaid');
    expect(cash.hint).toContain('En efectivo no se pide comprobante');
  });

  it('lista pero hoy no es día de cobro → «Fuera de día de cobro» con el siguiente día', () => {
    const s = poStateOf({ status: 'AUTHORIZED', paymentMethod: 'EFECTIVO' }, offDay);
    expect(s.key).toBe('off_pay_day');
    expect(s.label).toBe('Fuera de día de cobro');
    expect(s.missing).toBe('Se paga mañana');
    expect(s.hint).toContain('lunes, miércoles y viernes');
    expect(s.tone).toBe('waiting');
  });

  it('sin regla de días de cobro, nunca está fuera de ventana', () => {
    const off = evaluatePoWindow({ ...DEFAULT_PO_WINDOW, enabled: false }, TUESDAY);
    expect(poStateOf({ status: 'AUTHORIZED', paymentMethod: 'EFECTIVO' }, off).key).toBe('unpaid');
    expect(poStateOf({ status: 'AUTHORIZED', paymentMethod: 'EFECTIVO' }).key).toBe('unpaid');
  });

  it('pagada sin comprobante (datos viejos) → «Pagada · sin comprobante»; con él o en efectivo → completa', () => {
    expect(poStateOf({ status: 'PAID', paymentMethod: 'TRANSFERENCIA', proofs: [] }).label).toBe('Pagada · sin comprobante');
    expect(poStateOf({ status: 'PAID', paymentMethod: 'TRANSFERENCIA', proofs: [{}] }).label).toBe('Pagada · completa');
    expect(poStateOf({ status: 'PAID', paymentMethod: 'EFECTIVO' })).toEqual(
      expect.objectContaining({ key: 'complete', missing: null, tone: 'done', section: 'paid' }),
    );
  });

  it('rechazada y cancelada no están en ninguna sección', () => {
    expect(poStateOf({ status: 'REJECTED' })).toEqual(expect.objectContaining({ label: 'Rechazada', section: null }));
    expect(poStateOf({ status: 'CANCELLED' })).toEqual(expect.objectContaining({ label: 'Cancelada', section: null }));
  });

  it('evento cerrado: lo dice en vez de pedir algo que ya no se puede', () => {
    const s = withPoState({ status: 'PENDING_AUTH' }, payDay, 'CLOSED').state;
    expect(s.hint).toContain('El evento ya se cerró');
  });
});

describe('poStateCounts y días de cobro', () => {
  it('cuenta y suma por estado, en el orden del recorrido', () => {
    const rows = [
      { status: 'PAID', paymentMethod: 'EFECTIVO', amount: 100 },
      { status: 'PENDING_AUTH', amount: 50 },
      { status: 'PENDING_AUTH', amount: 25.5 },
      { status: 'AUTHORIZED', paymentMethod: 'TRANSFERENCIA', proofCount: 0, amount: 10 },
    ].map((r) => ({ ...r, state: poStateOf(r, payDay) }));
    expect(poStateCounts(rows)).toEqual([
      { key: 'unauthorized', label: 'Sin autorizar', count: 2, amount: 75.5 },
      { key: 'no_proof', label: 'Autorizada · sin comprobante', count: 1, amount: 10 },
      { key: 'complete', label: 'Pagada · completa', count: 1, amount: 100 },
    ]);
  });

  it('payDayOf: hoy o el siguiente; nada si la regla está apagada', () => {
    expect(payDayOf(payDay)).toEqual({ open: true, next: null });
    expect(payDayOf(offDay)).toEqual({ open: false, next: 'mañana' });
    expect(payDayOf(evaluatePoWindow({ ...DEFAULT_PO_WINDOW, enabled: false }, TUESDAY))).toBeNull();
  });

  it('payWindowFor nunca lanza: sin organización o con error, los días de Arta', async () => {
    const broken = { organization: { findUnique: async () => Promise.reject(new Error('db')) } };
    expect((await payWindowFor(broken, 'org-1', TUESDAY)).open).toBe(false);
    expect((await payWindowFor({} as never, null, MONDAY)).open).toBe(true);
  });
});
