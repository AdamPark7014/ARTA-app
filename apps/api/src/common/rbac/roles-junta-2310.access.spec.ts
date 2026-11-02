import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchaseOrdersController } from '../../purchase-orders/purchase-orders.controller';
import { FinanceController } from '../../finance/finance.controller';
import { SponsorsController } from '../../sponsors/sponsors.controller';
import { EventsController } from '../../events/events.controller';
import { SlotsController, canReplaceSlot } from '../../slots/slots.controller';
import { CalendarController } from '../../calendar/calendar.controller';
import { FoldersController } from '../../folders/folders.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { UsersController } from '../../users/users.controller';
import { PracticantesController } from '../../practicantes/practicantes.controller';
import { ChatService, type ChatUser } from '../../chat/chat.service';
import { CampaignsController } from '../../campaigns/campaigns.controller';
import { NEW_TEAM_MEMBERS } from '../../../prisma/new-team-members';
import { isInsideRepo } from '../../../scripts/alta-paula-contabilidad-2310';
import * as path from 'path';

/**
 * Junta 23-10-2026: los dos roles nuevos, probados contra los controladores reales.
 *
 *  - `contabilidad` (Paula Farfán): paga OC y anticipos, sube comprobantes, lleva campaña, convenios y
 *    boletera. Desde el 01-11-2026 no ve ni edita la corrida. NO autoriza OC ni anticipos, no edita
 *    formatos ni el evento, no toca usuarios y no entra sola a los canales de chat de los eventos.
 *  - `practicante` (practicantes de Montse): Studio y calendario en solo lectura; nada más.
 */
const ORG = 'org_arta_internal';
const BOTH = ['ARTA', 'EXPLANADA'];
const paula = { id: 'u-paula', roleKey: 'contabilidad', entities: BOTH, permissions: [] as string[], organizationId: ORG, fullName: 'Paula Farfán' };
const practicante = { id: 'u-prac', roleKey: 'practicante', entities: ['ARTA'], permissions: [] as string[], organizationId: ORG, fullName: 'Practicante' };
const event = { id: 'ev-1', name: 'Concierto', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };

describe('contabilidad · órdenes de compra', () => {
  /** Lunes 14-09-2026, 12:00 en CDMX — día de cobro. */
  const MONDAY = new Date('2026-09-14T18:00:00.000Z');
  let order: Record<string, any>;
  let updated: Record<string, unknown> | null;
  let proofCreated: Record<string, unknown> | null;
  let controller: PurchaseOrdersController;

  beforeEach(() => {
    jest.useFakeTimers({ now: MONDAY, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    updated = null;
    proofCreated = null;
    order = {
      id: 'po-1',
      eventId: 'ev-1',
      rubro: 'audio',
      amount: 18000,
      status: 'PENDING_AUTH',
      paymentMethod: 'TRANSFERENCIA',
      payeeType: 'PROVEEDOR',
      withIva: false,
      proofs: [] as unknown[],
      lines: [],
      createdById: 'u-otro',
      event,
    };
    const prisma = {
      purchaseOrder: {
        findUnique: async () => order,
        findMany: async () => [order],
        update: async ({ data }: any) => {
          updated = data;
          return { ...order, ...data };
        },
        create: async () => {
          throw new Error('no debería crear');
        },
        delete: async () => order,
      },
      paymentProof: {
        create: async ({ data }: any) => {
          proofCreated = data;
          return { id: 'pf-1', ...data };
        },
      },
      auditLog: { create: async ({ data }: any) => data },
      event: { findUnique: async () => event },
      organization: { findUnique: async () => ({ settingsJson: {} }) },
      user: { findMany: async () => [] },
    };
    const notifications = { notify: async () => null, notifyMany: async () => [], notifyUsers: async () => [] };
    controller = new PurchaseOrdersController(prisma as never, notifications as never);
  });

  afterEach(() => jest.useRealTimers());

  it('ve las OC del evento (Arta y Auditorio)', async () => {
    const rows = await controller.list({ user: paula } as never, 'ev-1');
    expect(rows).toHaveLength(1);
  });

  it('no autoriza ni rechaza OC', async () => {
    await expect(
      controller.setStatus({ user: paula } as never, 'po-1', { status: 'AUTHORIZED' as never }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.setStatus({ user: paula } as never, 'po-1', { status: 'REJECTED' as never }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updated).toBeNull();
  });

  it('no crea, edita ni borra OC (eso es de compras)', async () => {
    await expect(
      controller.create({ user: paula } as never, { eventId: 'ev-1', rubro: 'audio', amount: 10 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update({ user: paula } as never, 'po-1', { rubro: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.remove({ user: paula } as never, 'po-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sube el comprobante (o la factura) y marca pagada una OC autorizada', async () => {
    order.status = 'AUTHORIZED';
    await controller.addProof({ user: paula } as never, 'po-1', { fileUrl: '/uploads/factura.pdf', label: 'Factura' });
    expect(proofCreated).toMatchObject({ purchaseOrderId: 'po-1', fileUrl: '/uploads/factura.pdf', uploadedById: 'u-paula' });

    order.proofs = [{ id: 'pf-1' }];
    await controller.setStatus({ user: paula } as never, 'po-1', { status: 'PAID' as never });
    expect(updated).toMatchObject({ status: 'PAID' });
  });
});

describe('contabilidad · anticipos y corrida', () => {
  let proofs: Array<Record<string, any>>;
  let runUpdated: Record<string, unknown> | null;
  let controller: FinanceController;
  const run = { id: 'run-1', eventId: 'ev-1', locked: false, dataJson: {}, event: { status: 'ACTIVE' } };

  beforeEach(() => {
    runUpdated = null;
    proofs = [
      { id: 'adv-p', purchaseOrderId: null, eventId: 'ev-1', label: 'Hotel', amount: 5000, uploadedById: 'u-pide', advanceStatus: 'PENDING' },
      { id: 'adv-a', purchaseOrderId: null, eventId: 'ev-1', label: 'Camerino', amount: 900, uploadedById: 'u-pide', advanceStatus: 'APPROVED' },
    ];
    const prisma = {
      event: { findUnique: async () => event, findMany: async () => [event] },
      paymentProof: {
        findUnique: async ({ where }: any) => proofs.find((p) => p.id === where.id) ?? null,
        findMany: async () => proofs,
        create: async () => {
          throw new Error('no debería solicitar');
        },
        updateMany: async ({ where, data }: any) => {
          const row = proofs.find((p) => p.id === where.id && p.advanceStatus === where.advanceStatus);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      financeRun: {
        findMany: async () => [run],
        findUnique: async () => run,
        update: async ({ data }: any) => {
          runUpdated = data;
          return { ...run, ...data };
        },
      },
      checklistInstance: { findFirst: async () => null, findMany: async () => [] },
      auditLog: { create: async ({ data }: any) => data },
      user: { findMany: async () => [], findUnique: async () => null },
    };
    const revisions = { record: async () => undefined, recordRevision: async () => undefined };
    controller = new FinanceController(prisma as never, revisions as never, { notifyMany: async () => [], notifyEventTeam: async () => [] } as never);
  });

  it('ve los anticipos del evento; la corrida, no (01-11-2026)', async () => {
    await expect(controller.advances({ user: paula } as never, 'ev-1')).resolves.toHaveLength(2);
    await expect(controller.list({ user: paula } as never, 'ev-1')).rejects.toThrow('La corrida no está a tu alcance');
    await expect(controller.revisionHistory({ user: paula } as never, 'run-1')).rejects.toThrow(
      'La corrida no está a tu alcance',
    );
  });

  it('la corrida la ven dirección general, Leida y Sol', async () => {
    const chacho = { ...paula, id: 'u-chacho', roleKey: 'dir_general' };
    const leida = { ...paula, id: 'u-leida', roleKey: 'dir_adjunta', entities: ['ARTA'] };
    await expect(controller.list({ user: chacho } as never, 'ev-1')).resolves.toHaveLength(1);
    await expect(controller.list({ user: leida } as never, 'ev-1')).resolves.toHaveLength(1);
  });

  it('no aprueba ni rechaza anticipos', async () => {
    await expect(controller.approveAdvance({ user: paula } as never, 'adv-p')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.rejectAdvance({ user: paula } as never, 'adv-p', { reason: 'no procede' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(proofs[0].advanceStatus).toBe('PENDING');
  });

  it('no solicita anticipos (eso es de producción)', async () => {
    await expect(
      controller.createAdvance({ user: paula } as never, { eventId: 'ev-1', amount: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marca pagado un anticipo aprobado, con su comprobante', async () => {
    await controller.markAdvancePaid({ user: paula } as never, 'adv-a', { proofUrl: '/uploads/pago.pdf' });
    expect(proofs[1]).toMatchObject({ advanceStatus: 'PAID', paidById: 'u-paula', paidProofUrl: '/uploads/pago.pdf' });
  });

  it('en «por resolver» le salen los aprobados que paga, no los pendientes de aprobar', async () => {
    const rows = await controller.pendingAdvances({ user: paula } as never);
    expect(rows.map((r: any) => r.id)).toEqual(['adv-a']);
  });

  it('no edita la corrida ni la reabre (eso es de dirección general)', async () => {
    await expect(
      controller.unlock({ user: paula } as never, 'run-1', { reason: 'ajuste' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update({ user: paula } as never, 'run-1', { title: 'Corrida Concierto' })).rejects.toThrow(
      'La corrida solo la modifican Chacho o Arturo',
    );
    expect(runUpdated).toBeNull();
  });

  it('Leida y Sol ven la corrida, pero tampoco la modifican ni la reabren', async () => {
    const sol = { ...paula, id: 'u-sol', roleKey: 'dir_adjunta', entities: ['ARTA'] };
    await expect(controller.update({ user: sol } as never, 'run-1', { title: 'Corrida Concierto' })).rejects.toThrow(
      'La corrida solo la modifican Chacho o Arturo',
    );
    await expect(
      controller.unlock({ user: sol } as never, 'run-1', { reason: 'ajuste de cierre' } as never),
    ).rejects.toThrow('Solo dirección general puede quitar el sello de una corrida');
    expect(runUpdated).toBeNull();
  });

  it('dirección general es quien la modifica', async () => {
    // El formato espejo de la corrida no es lo que se prueba aquí.
    jest.spyOn(controller as any, 'syncCorridaChecklist').mockResolvedValue(undefined);
    const arturo = { ...paula, id: 'u-arturo', roleKey: 'dir_general' };
    await controller.update({ user: arturo } as never, 'run-1', { title: 'Corrida Concierto' });
    expect(runUpdated).toMatchObject({ title: 'Corrida Concierto', lastEditedById: 'u-arturo' });
  });
});

describe('contabilidad · campaña, convenios, evento y documentos', () => {
  it('manda la campaña a revisión y la marca pagada, pero no la autoriza', async () => {
    let campaign: Record<string, any> = { id: 'c-1', eventId: 'ev-1', status: 'DRAFT', convenioStatus: 'DRAFT', authorized: false };
    const prisma = {
      event: { findUnique: async () => event },
      campaign: {
        findUnique: async () => campaign,
        update: async ({ data }: any) => (campaign = { ...campaign, ...data }),
      },
      auditLog: { create: async () => ({}), findFirst: async () => null },
      user: { findMany: async () => [] },
    };
    const controller = new CampaignsController(prisma as never, { notifyMany: async () => [], notify: async () => null } as never);
    await controller.setStatus({ user: paula } as never, 'ev-1', { status: 'REVIEW' });
    expect(campaign.status).toBe('REVIEW');
    await expect(controller.setStatus({ user: paula } as never, 'ev-1', { status: 'AUTHORIZED' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    campaign.status = 'AUTHORIZED';
    await controller.setStatus({ user: paula } as never, 'ev-1', { status: 'PAID' });
    expect(campaign.status).toBe('PAID');
  });

  it('edita los montos de un convenio (patrocinio)', async () => {
    let saved: Record<string, unknown> | null = null;
    const prisma = {
      sponsor: {
        findUnique: async () => ({ id: 's-1', name: 'Cerveza', status: 'PROPOSED', event }),
        update: async ({ data }: any) => (saved = data),
      },
    };
    const controller = new SponsorsController(prisma as never);
    await controller.update({ user: paula } as never, 's-1', { amount: 150000, paymentTerms: '50 % al firmar' });
    expect(saved).toMatchObject({ amount: 150000, paymentTerms: '50 % al firmar' });
  });

  it('no edita los datos del show', async () => {
    const prisma = { event: { findUnique: async () => event, update: jest.fn() } };
    const controller = new EventsController(prisma as never, {} as never, {} as never);
    await expect(controller.update({ user: paula } as never, 'ev-1', { name: 'Otro' } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('reemplaza campaña o boletera por un documento externo; corrida, formato y OC no', () => {
    expect(canReplaceSlot(paula, 'CAMPAIGN')).toBe(true);
    expect(canReplaceSlot(paula, 'BOLETERA')).toBe(true);
    expect(canReplaceSlot(paula, 'CORRIDA')).toBe(false);
    expect(canReplaceSlot(paula, 'CHECKLIST')).toBe(false);
    expect(canReplaceSlot(paula, 'PENDONES')).toBe(false);
    expect(canReplaceSlot(paula, 'OC')).toBe(false);
    // Los roles operativos siguen reemplazando lo suyo (traen checklist.edit)...
    expect(canReplaceSlot({ roleKey: 'convenios', permissions: [] }, 'CAMPAIGN')).toBe(true);
    expect(canReplaceSlot({ roleKey: 'logistica', permissions: [] }, 'CHECKLIST')).toBe(true);
    // ...pero la corrida y la OC ya no se reemplazan por poder editar formatos.
    for (const roleKey of ['convenios', 'logistica', 'enlace_gobierno', 'produccion']) {
      expect(canReplaceSlot({ roleKey, permissions: [] }, 'CORRIDA')).toBe(false);
      expect(canReplaceSlot({ roleKey, permissions: [] }, 'OC')).toBe(false);
    }
    // La corrida, quien la modifica: Leida y Sol la suben, reemplazarla ya sería modificarla. La OC, compras.
    expect(canReplaceSlot({ roleKey: 'dir_adjunta', permissions: [] }, 'CORRIDA')).toBe(false);
    expect(canReplaceSlot({ roleKey: 'dir_general', permissions: [] }, 'CORRIDA')).toBe(true);
    expect(canReplaceSlot({ roleKey: 'compras', permissions: [] }, 'OC')).toBe(true);
    expect(canReplaceSlot({ roleKey: 'dir_general', permissions: [] }, 'OC')).toBe(false);
    expect(canReplaceSlot({ roleKey: 'dir_general', permissions: ['po.edit'] }, 'OC')).toBe(true);
  });

  it('el endpoint de reemplazo rechaza un formato antes de tocar nada', async () => {
    const prisma = { event: { findUnique: jest.fn() }, eventDocumentSlot: { upsert: jest.fn() } };
    const controller = new SlotsController(prisma as never, {} as never);
    await expect(
      controller.replace({ user: paula } as never, 'ev-1', { kind: 'CHECKLIST', fileId: 'f-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventDocumentSlot.upsert).not.toHaveBeenCalled();
  });
});

describe('canales de chat de los eventos', () => {
  function chat(channelRow: Record<string, unknown> | null, existing: { id: string } | null = null) {
    const prisma = {
      chatChannel: {
        findFirst: jest.fn().mockResolvedValue(channelRow),
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'c-def' }),
      },
      chatChannelMember: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'ev-1', name: 'Concierto', artist: null, entity: 'ARTA' }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new ChatService(prisma as never, { notifyMany: jest.fn() } as never, { emitToChannel: jest.fn(), emitToUsers: jest.fn(), emitToUser: jest.fn() } as never);
    return { service, prisma };
  }
  const eventChannel = (members: unknown[] = []) => ({
    id: 'c-ev',
    organizationId: ORG,
    kind: 'PUBLIC',
    slug: 'evento-concierto',
    name: 'Concierto',
    isArchived: false,
    eventId: 'ev-1',
    entity: 'ARTA',
    postingRestricted: false,
    members,
  });

  it('contabilidad no se une sola al canal de un evento', async () => {
    const { service, prisma } = chat(eventChannel());
    await expect(service.getChannel(paula as ChatUser, 'c-ev')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatChannelMember.upsert).not.toHaveBeenCalled();
  });

  it('si alguien la agregó al canal, sí entra', async () => {
    const { service } = chat(eventChannel([{ id: 'm-1', userId: 'u-paula', role: 'member', mutedUntil: null, lastReadAt: null }]));
    await expect(service.getChannel(paula as ChatUser, 'c-ev')).resolves.toBeTruthy();
  });

  it('ni contabilidad ni practicante abren un canal de evento nuevo', async () => {
    const { service, prisma } = chat(null, null);
    await expect(service.openEventChannel(paula as ChatUser, 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.openEventChannel(practicante as ChatUser, 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatChannel.create).not.toHaveBeenCalled();
  });

  it('la lista de canales les oculta los públicos de eventos', async () => {
    const { service, prisma } = chat(null);
    await service.listChannels(paula as ChatUser);
    const where = prisma.chatChannel.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"eventId":null');

    const prod = chat(null);
    await prod.service.listChannels({ ...paula, roleKey: 'logistica' } as ChatUser);
    expect(JSON.stringify(prod.prisma.chatChannel.findMany.mock.calls[0][0].where)).not.toContain('"eventId":null');
  });
});

describe('practicante · calendario en solo lectura', () => {
  function calendar() {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ev-1', name: 'Concierto', startsAt: new Date() }]),
      },
      calendarNote: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'n-1', organizationId: ORG, entity: 'ARTA', createdById: 'u-x' }),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return { controller: new CalendarController(prisma as never), prisma };
  }

  it('ve los shows de su entidad, solo con lo que pinta el calendario', async () => {
    const { controller, prisma } = calendar();
    await expect(controller.events({ user: practicante } as never, 'ARTA' as never)).resolves.toHaveLength(1);
    const args = prisma.event.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ organizationId: ORG, entity: 'ARTA' });
    expect(Object.keys(args.select).sort()).toEqual(['artist', 'city', 'endsAt', 'id', 'name', 'startsAt', 'status', 'venue']);
  });

  it('no ve Auditorio si no lo tiene asignado', async () => {
    const { controller } = calendar();
    await expect(controller.events({ user: practicante } as never, 'EXPLANADA' as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lee las notas, pero no escribe, edita ni borra', async () => {
    const { controller, prisma } = calendar();
    await expect(controller.list({ user: practicante } as never, 'ARTA' as never)).resolves.toEqual([]);
    await expect(
      controller.create({ user: practicante } as never, { entity: 'ARTA' as never, date: '2026-10-30', text: 'hola' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update({ user: practicante } as never, 'n-1', { text: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.remove({ user: practicante } as never, 'n-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.calendarNote.create).not.toHaveBeenCalled();
    expect(prisma.calendarNote.delete).not.toHaveBeenCalled();
  });

  it('entidad inválida: 400', async () => {
    const { controller } = calendar();
    await expect(controller.events({ user: practicante } as never, 'OTRA' as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('practicante · nada fuera del sitio', () => {
  it('no ve los eventos ni sus OC, corrida o boletera', async () => {
    const events = new EventsController({ event: { findMany: jest.fn() } } as never, {} as never, {} as never);
    await expect(events.list({ user: practicante } as never)).resolves.toEqual([]);

    const po = new PurchaseOrdersController(
      { event: { findUnique: async () => event } } as never,
      {} as never,
    );
    await expect(po.list({ user: practicante } as never, 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);

    const finance = new FinanceController({ event: { findUnique: async () => event } } as never, {} as never, {} as never);
    await expect(finance.list({ user: practicante } as never, 'ev-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('solo ve las carpetas que dirección comparte con su rol', async () => {
    const folders = [
      { id: 'f-gral', name: 'General', entity: 'ARTA', organizationId: ORG, allowedRoles: [] },
      { id: 'f-redes', name: 'Material para redes', entity: 'ARTA', organizationId: ORG, allowedRoles: ['practicante'] },
    ];
    const prisma = {
      sharedFolder: {
        findMany: async () => folders,
        findUnique: async ({ where }: any) => ({ ...folders.find((f) => f.id === where.id), files: [] }),
      },
    };
    const controller = new FoldersController(prisma as never);
    const list = await controller.list({ user: practicante } as never, 'ARTA' as never);
    expect(list.map((f: any) => f.id)).toEqual(['f-redes']);
    await expect(controller.one({ user: practicante } as never, 'f-gral')).rejects.toBeInstanceOf(ForbiddenException);
    // Contabilidad sí ve las generales.
    const forPaula = await controller.list({ user: paula } as never, 'ARTA' as never);
    expect(forPaula.map((f: any) => f.id)).toEqual(['f-gral']);
  });

  it('no crea tareas', async () => {
    const prisma = { taskAssignment: { create: jest.fn() } };
    const controller = new TasksController(prisma as never, {} as never);
    await expect(controller.create({ user: practicante } as never, { title: 'x' } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.taskAssignment.create).not.toHaveBeenCalled();
  });
});

/**
 * Hasta el 01-11-2026 dirección adjunta daba de alta gente. Ahora los usuarios y los perfiles de
 * practicante son de dirección general; `users.create` queda solo como permiso extra.
 */
describe('Altas de usuarios y practicantes: dirección general', () => {
  const leida = { id: 'u-leida', roleKey: 'dir_adjunta', entities: ['ARTA'], permissions: [] as string[], organizationId: ORG };
  const chacho = { id: 'u-chacho', roleKey: 'dir_general', entities: BOTH, permissions: [] as string[], organizationId: ORG };
  /** Quien solo trae el extra `users.create`: da de alta, pero dentro de sus límites. */
  const soloAltas = { ...leida, id: 'u-altas', permissions: ['users.create'] };

  function users() {
    const created: Array<Record<string, any>> = [];
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => (where.id ? { organizationId: ORG } : null)),
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return { id: 'u-new', ...data };
        }),
        count: jest.fn(async () => 3),
      },
      organization: { findUnique: async () => ({ id: ORG, active: true, plan: 'OPS' }) },
      orgInvite: { count: async () => 0 },
    };
    return { controller: new UsersController(prisma as never), created, prisma };
  }

  it('dirección adjunta ya no ve usuarios, roles ni el catálogo de permisos', async () => {
    const { controller } = users();
    expect(() => controller.roles({ user: leida } as never)).toThrow('No puedes dar de alta usuarios');
    expect(() => controller.permissionsCatalog({ user: leida } as never)).toThrow('No puedes dar de alta usuarios');
    await expect(controller.list({ user: leida } as never)).rejects.toThrow('No puedes dar de alta usuarios');
  });

  it('dirección adjunta ya no da de alta a nadie', async () => {
    const { controller, created, prisma } = users();
    await expect(
      controller.create({ user: leida } as never, {
        email: 'practicante1@artaproducciones.com',
        fullName: 'Practicante Uno',
        roleKey: 'practicante',
        entities: ['ARTA'] as never,
        password: 'Una-clave-larga-1',
      }),
    ).rejects.toThrow('No puedes dar de alta usuarios');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('dirección general ve todos los roles, menos el de plataforma', () => {
    const { controller } = users();
    const keys = controller.roles({ user: chacho } as never).map((r: any) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['practicante', 'contabilidad', 'compras', 'dir_general']));
    expect(keys).not.toContain('super_admin');
  });

  it('el rol practicante sale en la lista de quien solo da de alta, sin dirección general ni plataforma', () => {
    const { controller } = users();
    const keys = controller.roles({ user: soloAltas } as never).map((r: any) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['practicante', 'contabilidad']));
    expect(keys).not.toContain('dir_general');
    expect(keys).not.toContain('super_admin');
  });

  it('crea un practicante en Arta; los permisos extra solo del catálogo asignable', async () => {
    const { controller, created } = users();
    await controller.create({ user: chacho } as never, {
      email: 'practicante1@artaproducciones.com',
      fullName: 'Practicante Uno',
      roleKey: 'practicante',
      entities: ['ARTA'] as never,
      password: 'Una-clave-larga-1',
      permissions: ['users.create', 'users.manage', 'everything', 'studio.edit'],
    });
    expect(created[0]).toMatchObject({ roleKey: 'practicante', entities: ['ARTA'], permissions: ['studio.edit'] });
  });

  it('el practicante no da de alta a nadie', async () => {
    const { controller } = users();
    await expect(
      controller.create({ user: practicante } as never, {
        email: 'x@artaproducciones.com',
        fullName: 'X',
        roleKey: 'practicante',
        entities: ['ARTA'] as never,
        password: 'Una-clave-larga-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('quien solo da de alta solo da entidades que tiene', async () => {
    const { controller, created } = users();
    await expect(
      controller.create({ user: soloAltas } as never, {
        email: 'y@artaproducciones.com',
        fullName: 'Y',
        roleKey: 'practicante',
        entities: ['EXPLANADA'] as never,
        password: 'Una-clave-larga-1',
      }),
    ).rejects.toThrow('Solo puedes dar acceso a tus entidades');
    expect(created).toEqual([]);
  });

  it('quien solo da de alta no reparte dirección general', async () => {
    const { controller, created } = users();
    await expect(
      controller.create({ user: soloAltas } as never, {
        email: 'z@artaproducciones.com',
        fullName: 'Z',
        roleKey: 'dir_general',
        entities: ['ARTA'] as never,
        password: 'Una-clave-larga-1',
      }),
    ).rejects.toThrow('Solo dirección general da ese rol');
    expect(created).toEqual([]);
  });

  describe('perfiles de practicante por temporada', () => {
    function perfiles() {
      const create = jest.fn(async ({ data }: any) => ({ id: 'u-new', sessions: [], ...data }));
      const prisma = {
        user: { findUnique: jest.fn(async () => null), create },
        auditLog: { create: jest.fn(async ({ data }: any) => data) },
      };
      return { controller: new PracticantesController(prisma as never), create };
    }
    const dto = { fullName: 'Practicante Uno', expiresAt: '2099-12-31' };

    it('dirección adjunta no los genera', async () => {
      const { controller, create } = perfiles();
      await expect(controller.create({ user: leida } as never, dto)).rejects.toThrow(
        'Los perfiles de practicante los generan Chacho o Arturo',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('dirección general los genera, y publicar viaja como permiso extra del perfil', async () => {
      const { controller, create } = perfiles();
      const con = await controller.create({ user: chacho } as never, dto);
      expect(create.mock.calls[0][0].data).toMatchObject({
        roleKey: 'practicante',
        permissions: ['studio.publish'],
        entities: ['ARTA', 'EXPLANADA'],
      });
      expect(con.canPublish).toBe(true);
    });

    it('sin ese permiso, el perfil solo deja borradores', async () => {
      const { controller, create } = perfiles();
      const sin = await controller.create({ user: chacho } as never, { ...dto, canPublish: false });
      expect(create.mock.calls[0][0].data.permissions).toEqual([]);
      expect(sin.canPublish).toBe(false);
    });
  });
});

describe('contabilidad · fuera de su alcance', () => {
  it('no ve ni da de alta usuarios', async () => {
    const controller = new UsersController({ user: { findMany: jest.fn() } } as never);
    await expect(controller.list({ user: paula } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(() => controller.roles({ user: paula } as never)).toThrow(ForbiddenException);
  });

  it('un evento que no existe sigue siendo 404 (no se confunde con permisos)', async () => {
    const po = new PurchaseOrdersController({ event: { findUnique: async () => null } } as never, {} as never);
    await expect(po.list({ user: paula } as never, 'nada')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('alta de Paula Farfán', () => {
  it('está en las altas del seed como contabilidad en las dos entidades, sin contraseña conocida', () => {
    const p = NEW_TEAM_MEMBERS.find((m) => m.email === 'paula@artaproducciones.com');
    expect(p).toMatchObject({
      fullName: 'Paula Farfán',
      title: 'Contabilidad y comercial',
      roleKey: 'contabilidad',
      entities: ['ARTA', 'EXPLANADA'],
      passAlias: 'PAULA',
      randomPasswordUnlessEnv: true,
    });
  });

  it('el script nunca escribe la contraseña dentro del repo', () => {
    const repo = path.resolve(__dirname, '..', '..', '..', '..', '..');
    expect(isInsideRepo(path.join(repo, 'paula.txt'), repo)).toBe(true);
    expect(isInsideRepo(path.join(repo, 'apps', 'api', 'x.txt'), repo)).toBe(true);
    expect(isInsideRepo(repo, repo)).toBe(true);
    expect(isInsideRepo(path.join(path.dirname(repo), 'fuera', 'paula.txt'), repo)).toBe(false);
    expect(isInsideRepo(path.join(repo + '-otro', 'paula.txt'), repo)).toBe(false);
  });
});
