import { DocStatus } from '@prisma/client';
import { ChecklistsController } from './checklists.controller';

/**
 * Junta del 23-10-2026: en cuanto un formato se termina y se manda (firma de
 * entrega, «Mandar a revisión», aprobación o firma de autorización) se guarda
 * 100 % aunque no se haya palomeado todo. El porcentaje se GUARDA así para que
 * lista de formatos, resumen del evento, analítica y apps digan lo mismo.
 */
describe('ChecklistsController · avance de un formato mandado', () => {
  const ORG = 'org_arta_internal';
  const user = {
    id: 'u-ops',
    roleKey: 'dir_general',
    entities: ['ARTA'],
    fullName: 'Operación Arta',
    organizationId: ORG,
  };
  // 1 de 4 casillas: este evento no usa el resto del checklist.
  const dataJson = {
    sections: [
      {
        id: 'produccion',
        title: 'Producción',
        items: [
          { id: 'a', label: 'Audio', type: 'check', done: true },
          { id: 'b', label: 'Luces', type: 'check', done: false },
          { id: 'c', label: 'Pantallas', type: 'check', done: false },
          { id: 'd', label: 'Planta de luz', type: 'check', done: false },
        ],
      },
    ],
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const doc = {
      id: 'ck-1',
      eventId: 'ev-1',
      title: 'Checklist de producción',
      dataJson,
      progressPct: 25,
      status: DocStatus.DRAFT,
      revision: 3,
      deliveredAt: null,
      deliveredSignature: null,
      authorizedAt: null,
      authorizedSignature: null,
      submittedById: null,
      deliveredById: null,
      lastEditedById: null,
      event: { id: 'ev-1', name: 'Show', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG },
      ...overrides,
    };
    const update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...doc, ...args.data }));
    const prisma = {
      checklistInstance: {
        findUnique: jest.fn(async () => doc),
        findUniqueOrThrow: jest.fn(async () => doc),
        update,
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      checklistVersion: { findUnique: jest.fn(), create: jest.fn(async () => ({})) },
      digitalSignature: { create: jest.fn(async () => ({})) },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const pdfs = { regenerateInstance: jest.fn(async () => ({ id: doc.id })) };
    const revisions = { record: jest.fn(async () => undefined) };
    const controller = new ChecklistsController(prisma as never, pdfs as never, revisions as never);
    return { controller, prisma, update };
  }

  const req = { user, ip: '127.0.0.1', headers: { 'user-agent': 'jest' } };

  it('firmar la entrega guarda 100 % aunque falten casillas', async () => {
    const { controller, update } = setup();
    await controller.sign(req as never, 'ck-1', { kind: 'ENTREGADO', imageDataUrl: 'data:image/png;base64,AA' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressPct: 100, deliveredAt: expect.any(Date) }) }),
    );
  });

  it('firmar la autorización también', async () => {
    const { controller, update } = setup();
    await controller.sign(req as never, 'ck-1', { kind: 'AUTORIZADO', imageDataUrl: 'data:image/png;base64,AA' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressPct: 100, authorizedAt: expect.any(Date) }) }),
    );
  });

  it('«Mandar a revisión» guarda 100 %', async () => {
    const { controller, update } = setup();
    const out = await controller.changeStatus(req as never, 'ck-1', { status: DocStatus.REVIEW });
    expect(update.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: DocStatus.REVIEW, progressPct: 100 }));
    expect(out.progressPct).toBe(100);
  });

  it('volver a borrador sin firma regresa a lo capturado', async () => {
    const { controller, update } = setup({ status: DocStatus.REVIEW, progressPct: 100 });
    await controller.changeStatus(req as never, 'ck-1', { status: DocStatus.DRAFT });
    expect(update.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: DocStatus.DRAFT, progressPct: 25 }));
  });

  it('volver a borrador con la firma de entrega puesta se queda en 100 %', async () => {
    const { controller, update } = setup({ status: DocStatus.REVIEW, progressPct: 100, deliveredAt: new Date() });
    await controller.changeStatus(req as never, 'ck-1', { status: DocStatus.DRAFT });
    expect(update.mock.calls[0][0].data).toEqual(expect.objectContaining({ progressPct: 100 }));
  });

  it('corregir un formato en revisión no le baja el 100 %', async () => {
    const { controller, prisma } = setup({ status: DocStatus.REVIEW, progressPct: 100 });
    await controller.update(req as never, 'ck-1', { dataJson, draft: true });
    expect(prisma.checklistInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressPct: 100 }) }),
    );
  });

  it('un borrador sin mandar guarda lo capturado', async () => {
    const { controller, prisma } = setup();
    await controller.update(req as never, 'ck-1', { dataJson, draft: true });
    expect(prisma.checklistInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressPct: 25 }) }),
    );
  });
});
