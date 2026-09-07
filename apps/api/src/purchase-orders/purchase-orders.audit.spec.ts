import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';

/**
 * Órdenes de compra: la regla del comprobante y su rastro.
 *
 * Dos cosas se prueban aquí, y las dos nacen del mismo sitio.
 *
 * 1. **Efectivo no pide comprobante; lo demás sí.** Es lo que pidió Arta: en
 *    efectivo no hay papel que adjuntar, así que exigirlo sólo empujaba a
 *    subir una foto cualquiera para desbloquear el botón.
 *
 * 2. **Cambiar la forma de pago a «efectivo» en la misma petición que marca
 *    pagado apaga la exigencia del comprobante.** Es legítimo —el pago acabó
 *    siendo en efectivo y hay que poder registrarlo— pero es exactamente la
 *    forma del bug que ya costó caro en la corrida financiera, donde mandar
 *    `locked: false` junto con el contenido permitía editar algo sellado. Aquí
 *    no se prohíbe: se deja su propia línea de auditoría para que se vea.
 */
describe('PurchaseOrdersController · comprobante y auditoría', () => {
  type Audit = { action: string; resourceId?: string | null; metaJson?: Record<string, unknown> };

  let audits: Audit[];
  let updated: Record<string, unknown> | null;
  let order: Record<string, unknown>;
  let controller: PurchaseOrdersController;

  const ORG = 'org-arta';

  const user = (roleKey: string, entities: string[] = ['ARTA']) => ({
    id: `u-${roleKey}`,
    roleKey,
    permissions: [] as string[],
    entities,
    organizationId: ORG,
  });

  /** OC de transferencia, autorizada y sin comprobantes, salvo que se diga otra cosa. */
  function makeOrder(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'po-1',
      eventId: 'ev-1',
      rubro: 'audio',
      vendorName: 'Audio Puebla',
      amount: 18000,
      status: 'AUTHORIZED',
      paymentMethod: 'TRANSFERENCIA',
      proofs: [] as unknown[],
      event: { id: 'ev-1', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG },
      ...over,
    };
  }

  beforeEach(() => {
    audits = [];
    updated = null;
    order = makeOrder();
    const prisma = {
      purchaseOrder: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'po-new',
          proofs: [],
          lines: [],
          ...data,
        }),
        findUnique: async () => order,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updated = data;
          return { ...order, ...data };
        },
        delete: async () => order,
      },
      paymentProof: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'pf-1', ...data }),
      },
      auditLog: {
        create: async ({ data }: { data: Audit }) => {
          audits.push(data);
          return data;
        },
      },
      event: { findUnique: async () => order.event },
      organization: { findUnique: async () => ({ settingsJson: {} }) },
    };
    controller = new PurchaseOrdersController(prisma as never);
  });

  const pay = (roleKey: string, paymentMethod?: string) =>
    controller.setStatus({ user: user(roleKey) } as never, 'po-1', {
      status: 'PAID' as never,
      paymentMethod: paymentMethod as never,
    });

  const actions = () => audits.map((a) => a.action);
  const find = (action: string) => audits.find((a) => a.action === action);

  describe('la regla del comprobante', () => {
    it('transferencia sin comprobante NO se puede marcar pagada', async () => {
      await expect(pay('gerente_arta')).rejects.toThrow(BadRequestException);
      expect(updated).toBeNull();
    });

    it('transferencia con comprobante sí se paga', async () => {
      order = makeOrder({ proofs: [{ id: 'pf-0' }] });
      await pay('gerente_arta');
      expect(updated).toMatchObject({ status: 'PAID', paymentMethod: 'TRANSFERENCIA' });
    });

    it('en efectivo se paga sin comprobante — que es justo lo que se pidió', async () => {
      order = makeOrder({ paymentMethod: 'EFECTIVO' });
      await pay('gerente_arta');
      expect(updated).toMatchObject({ status: 'PAID', paymentMethod: 'EFECTIVO' });
    });

    it('en efectivo tampoco se adjuntan comprobantes', async () => {
      order = makeOrder({ paymentMethod: 'EFECTIVO' });
      await expect(
        controller.addProof({ user: user('gerente_arta') } as never, 'po-1', {
          fileUrl: '/uploads/x.pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('todo movimiento de dinero deja rastro', () => {
    it('autorizar queda registrado con monto y proveedor', async () => {
      order = makeOrder({ status: 'PENDING_AUTH' });
      await controller.setStatus({ user: user('gerente_arta') } as never, 'po-1', {
        status: 'AUTHORIZED' as never,
      });
      expect(find('po.authorize')?.metaJson).toMatchObject({
        amount: 18000,
        vendorName: 'Audio Puebla',
        paymentMethod: 'TRANSFERENCIA',
      });
    });

    it('pagar queda registrado con cuántos comprobantes había', async () => {
      order = makeOrder({ proofs: [{ id: 'pf-0' }] });
      await pay('gerente_arta');
      expect(find('po.pay')?.metaJson).toMatchObject({ amount: 18000, proofCount: 1 });
    });

    it('rechazar queda registrado con el estado del que viene', async () => {
      order = makeOrder({ status: 'PENDING_AUTH' });
      await controller.setStatus({ user: user('gerente_arta') } as never, 'po-1', {
        status: 'REJECTED' as never,
      });
      expect(find('po.status')?.metaJson).toMatchObject({
        from: 'PENDING_AUTH',
        to: 'REJECTED',
      });
    });

    it('adjuntar un comprobante queda registrado', async () => {
      await controller.addProof({ user: user('gerente_arta') } as never, 'po-1', {
        fileUrl: '/uploads/transferencia.pdf',
      });
      expect(find('po.proof.add')?.metaJson).toMatchObject({
        fileUrl: '/uploads/transferencia.pdf',
      });
    });
  });

  describe('cambiar a efectivo al pagar no pasa callado', () => {
    it('deja pagar sin comprobante, porque el pago sí fue en efectivo', async () => {
      await pay('gerente_arta', 'EFECTIVO');
      expect(updated).toMatchObject({ status: 'PAID', paymentMethod: 'EFECTIVO' });
    });

    it('pero deja su propia línea de auditoría, señalando que se saltó el comprobante', async () => {
      await pay('gerente_arta', 'EFECTIVO');
      expect(actions()).toContain('po.payment_method.cash_at_payment');
      expect(find('po.payment_method.cash_at_payment')?.metaJson).toMatchObject({
        from: 'TRANSFERENCIA',
        to: 'EFECTIVO',
        amount: 18000,
        skippedProof: true,
      });
    });

    it('si ya había comprobante no hay nada que señalar', async () => {
      order = makeOrder({ proofs: [{ id: 'pf-0' }] });
      await pay('gerente_arta', 'EFECTIVO');
      expect(actions()).not.toContain('po.payment_method.cash_at_payment');
    });

    it('una OC que ya era en efectivo tampoco levanta la bandera', async () => {
      order = makeOrder({ paymentMethod: 'EFECTIVO' });
      await pay('gerente_arta', 'EFECTIVO');
      expect(actions()).not.toContain('po.payment_method.cash_at_payment');
    });
  });

  describe('una OC tiene que valer algo', () => {
    // Dirección se salta la ventana horaria, así que la prueba mide la regla
    // del importe y no el reloj.
    const create = (lines: Array<{ concept: string; qty: number; unitPrice: number }>) =>
      controller.create({ user: user('dir_general') } as never, {
        eventId: 'ev-1',
        rubro: 'audio',
        lines,
      } as never);

    it('no deja crear una orden de cero pesos', async () => {
      await expect(create([{ concept: 'Audio', qty: 0, unitPrice: 0 }])).rejects.toThrow(
        /monto/,
      );
    });

    it('el formulario vacío tampoco cuela', async () => {
      await expect(
        controller.create({ user: user('dir_general') } as never, {
          eventId: 'ev-1',
          rubro: 'audio',
        } as never),
      ).rejects.toThrow(/monto/);
    });

    it('con partidas de verdad sí se crea, y queda registrado', async () => {
      await create([{ concept: 'Audio', qty: 2, unitPrice: 9000 }]);
      expect(find('po.create')?.metaJson).toMatchObject({ amount: 18000, rubro: 'audio' });
    });
  });

  describe('quién puede qué', () => {
    it('enlace de gobierno marca pagado pero NO autoriza', async () => {
      order = makeOrder({ status: 'PENDING_AUTH' });
      await expect(
        controller.setStatus({ user: user('enlace_gobierno') } as never, 'po-1', {
          status: 'AUTHORIZED' as never,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('logística no cambia el estatus de una OC', async () => {
      order = makeOrder({ status: 'PENDING_AUTH' });
      await expect(
        controller.setStatus({ user: user('logistica') } as never, 'po-1', {
          status: 'REJECTED' as never,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    // Con acceso a las dos entidades la barrera de entidad no salta, y se llega
    // a la regla propia de Arta: la gerencia firma lo suyo, no lo del Auditorio.
    it('la gerencia de Arta no autoriza OC del Auditorio', async () => {
      order = makeOrder({
        status: 'PENDING_AUTH',
        event: { id: 'ev-1', entity: 'EXPLANADA', status: 'ACTIVE', organizationId: ORG },
      });
      await expect(
        controller.setStatus(
          { user: user('gerente_arta', ['ARTA', 'EXPLANADA']) } as never,
          'po-1',
          { status: 'AUTHORIZED' as never },
        ),
      ).rejects.toThrow(/solo autoriza OC de Arta/);
    });
  });
});
