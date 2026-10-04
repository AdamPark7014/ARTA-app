import { DocStatus } from '@prisma/client';
import { ChecklistsController } from './checklists.controller';

/** Avisos de formatos: revisión, aprobación y firmas llegan a quien le toca actuar o enterarse. */
describe('ChecklistsController · avisos', () => {
  const ORG = 'org-arta';
  const doc = {
    id: 'ck-1',
    title: 'Rider técnico',
    eventId: 'ev-1',
    submittedById: 'u-pide',
    deliveredById: 'u-entrega',
    authorizedAt: null,
    event: { name: 'Concierto', entity: 'ARTA', organizationId: ORG },
  };
  const actor = { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], fullName: 'Gerencia Arta' } as any;
  const link = '/events/ev-1?tab=checklists&checklist=ck-1';

  function setup() {
    const prisma = {
      user: {
        findMany: jest.fn(async () => [
          { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'] },
          { id: 'u-dir', roleKey: 'dir_general', entities: ['ARTA', 'EXPLANADA'] },
          { id: 'u-auditorio', roleKey: 'dir_auditorio', entities: ['EXPLANADA'] },
          { id: 'u-log', roleKey: 'logistica', entities: ['ARTA'] },
        ]),
      },
    };
    const notifications = {
      notify: jest.fn(async (_input: unknown) => null),
      notifyMany: jest.fn(async (_items: any[]) => []),
      notifyUsers: jest.fn(async (_ids: unknown[], _input: unknown) => []),
      whoCan: jest.fn(async (_opts: unknown) => ['u-dir']),
    };
    const controller = new ChecklistsController(prisma as never, {} as never, {} as never, notifications as never);
    return { controller: controller as any, notifications };
  }

  it('mandar a revisión avisa a quien aprueba en la entidad, no al que lo mandó', async () => {
    const { controller, notifications } = setup();
    await controller.notifyStatusChange(actor, doc, DocStatus.DRAFT, DocStatus.REVIEW, false);
    const items = notifications.notifyMany.mock.calls[0][0];
    expect(items.map((i: any) => i.userId)).toEqual(['u-dir']);
    expect(items[0]).toEqual(expect.objectContaining({ type: 'checklist.submitted', linkUrl: link }));
  });

  it('aprobar avisa a quien lo mandó a revisión', async () => {
    const { controller, notifications } = setup();
    await controller.notifyStatusChange(actor, doc, DocStatus.REVIEW, DocStatus.APPROVED, false);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-pide', type: 'checklist.approved', linkUrl: link, actorId: 'u-gerente' }),
    );
  });

  it('firma de entrega pide la firma de autorización a gerencia/dirección', async () => {
    const { controller, notifications } = setup();
    await controller.notifySignature({ ...actor, id: 'u-entrega' }, doc, 'ENTREGADO');
    expect(notifications.whoCan).toHaveBeenCalledWith({ organizationId: ORG, entity: 'ARTA', exclude: 'u-entrega' });
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u-dir'],
      expect.objectContaining({ type: 'checklist.signature_needed', linkUrl: link }),
    );
  });

  it('firma de autorización avisa a quien entregó y a quien lo mandó a revisión', async () => {
    const { controller, notifications } = setup();
    await controller.notifySignature(actor, doc, 'AUTORIZADO');
    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      ['u-entrega', 'u-pide'],
      expect.objectContaining({ type: 'checklist.signed' }),
    );
  });
});
