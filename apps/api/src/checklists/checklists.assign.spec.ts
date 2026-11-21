import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';

/** Responsable y fecha límite por formato (21-11-2026): quién debe qué. */
describe('ChecklistsController · responsable del formato', () => {
  const ORG = 'org-arta';
  const gerente = { id: 'u-gerente', roleKey: 'gerente_arta', entities: ['ARTA'], fullName: 'Gerencia Arta', organizationId: ORG };

  function setup(overrides: { status?: string; ownerId?: string | null; ownerFound?: boolean } = {}) {
    const doc = {
      id: 'ck-1',
      title: 'Rueda de prensa',
      eventId: 'ev-1',
      ownerId: overrides.ownerId ?? null,
      event: { id: 'ev-1', name: 'Concierto', entity: 'ARTA', organizationId: ORG, status: overrides.status ?? 'ACTIVE' },
    };
    const update = jest.fn(async ({ data }: any) => ({
      id: 'ck-1',
      ownerId: data.ownerId === undefined ? doc.ownerId : data.ownerId,
      dueAt: data.dueAt === undefined ? null : data.dueAt,
      owner: data.ownerId ? { id: data.ownerId, fullName: 'Mariela Fuentes' } : null,
    }));
    const prisma = {
      checklistInstance: { findUnique: jest.fn(async () => doc), update },
      user: { findFirst: jest.fn(async () => (overrides.ownerFound === false ? null : { id: 'u-mariela' })) },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const notifications = { notify: jest.fn(async (_input: unknown) => null) };
    const controller = new ChecklistsController(prisma as never, {} as never, {} as never, notifications as never);
    return { controller, prisma, notifications, update };
  }

  it('asigna responsable y fecha, lo deja en bitácora y le avisa', async () => {
    const { controller, prisma, notifications, update } = setup();
    const out = await controller.assign({ user: gerente } as never, 'ck-1', { ownerId: 'u-mariela', dueAt: '2026-12-04T18:00:00.000Z' });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-mariela', active: true, organizationId: ORG } }),
    );
    expect(update.mock.calls[0][0].data).toEqual({ ownerId: 'u-mariela', dueAt: new Date('2026-12-04T18:00:00.000Z') });
    expect(out.owner).toEqual({ id: 'u-mariela', fullName: 'Mariela Fuentes' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'checklist.assign', resourceId: 'ck-1' }) }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-mariela',
        type: 'checklist.assigned',
        title: 'Gerencia A. te asignó el formato: Rueda de prensa',
        linkUrl: '/events/ev-1?tab=checklists&checklist=ck-1',
      }),
    );
  });

  it('mover solo la fecha no vuelve a avisar', async () => {
    const { controller, notifications, update } = setup({ ownerId: 'u-mariela' });
    await controller.assign({ user: gerente } as never, 'ck-1', { dueAt: '2026-12-10T18:00:00.000Z' });
    expect(update.mock.calls[0][0].data).toEqual({ dueAt: new Date('2026-12-10T18:00:00.000Z') });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('`null` quita al responsable sin avisar a nadie', async () => {
    const { controller, notifications, update } = setup({ ownerId: 'u-mariela' });
    await controller.assign({ user: gerente } as never, 'ck-1', { ownerId: null });
    expect(update.mock.calls[0][0].data).toEqual({ ownerId: null });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('no acepta a alguien de fuera o inactivo, ni una fecha rota, ni un cuerpo vacío', async () => {
    await expect(
      setup({ ownerFound: false }).controller.assign({ user: gerente } as never, 'ck-1', { ownerId: 'u-otro' }),
    ).rejects.toThrow(/no está activa/);
    await expect(setup().controller.assign({ user: gerente } as never, 'ck-1', { dueAt: 'mañana' })).rejects.toThrow(/Fecha/);
    await expect(setup().controller.assign({ user: gerente } as never, 'ck-1', {})).rejects.toThrow(BadRequestException);
  });

  it('con el evento cerrado, o desde otra entidad, no se asigna', async () => {
    await expect(
      setup({ status: 'CLOSED' }).controller.assign({ user: gerente } as never, 'ck-1', { ownerId: 'u-mariela' }),
    ).rejects.toThrow();
    const auditorio = { ...gerente, roleKey: 'dir_auditorio', entities: ['EXPLANADA'] };
    await expect(
      setup().controller.assign({ user: auditorio } as never, 'ck-1', { ownerId: 'u-mariela' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
