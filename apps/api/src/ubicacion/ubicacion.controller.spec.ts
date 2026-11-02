import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UbicacionController } from './ubicacion.controller';
import { enHorario } from './horario';

const ORG = 'org-1';
const person = (roleKey: string, id = `u-${roleKey}`) => ({ user: { id, roleKey, organizationId: ORG } });

function build() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ locationConsentAt: new Date() }),
    },
    locationPoint: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, controller: new UbicacionController(prisma as never) };
}

/** Un instante reciente dentro del horario, para que la prueba no dependa de la hora en que corre. */
function recentInWindow() {
  const t = new Date();
  for (let i = 0; i < 48; i += 1) {
    const candidate = new Date(t.getTime() - i * 30 * 60_000);
    if (enHorario(candidate)) return candidate;
  }
  throw new Error('sin hora en horario');
}

describe('UbicacionController', () => {
  describe('quién se mide', () => {
    it.each(['dir_general', 'super_admin'])('a %s no se le mide: ni acepta ni manda puntos', async (role) => {
      const { controller, prisma } = build();
      await expect(controller.consentimiento(person(role))).rejects.toThrow(ForbiddenException);
      await expect(controller.puntos(person(role), { points: [] })).rejects.toThrow(ForbiddenException);
      await expect(controller.guardarEstado(person(role), { state: 'ok' })).rejects.toThrow(ForbiddenException);
      expect(prisma.locationPoint.createMany).not.toHaveBeenCalled();
    });

    it.each(['dir_adjunta', 'compras', 'produccion', 'dir_auditorio', 'contenido', 'catering', 'contabilidad', 'practicante'])(
      'a %s sí',
      async (role) => {
        const { controller, prisma } = build();
        prisma.user.findUnique.mockResolvedValue({ locationConsentAt: null });
        await expect(controller.estado(person(role))).resolves.toMatchObject({ tracked: true, startHour: 10, endHour: 18 });
      },
    );

    it('la app de Chacho se entera de que no le toca', async () => {
      const { controller, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ locationConsentAt: null });
      await expect(controller.estado(person('dir_general'))).resolves.toMatchObject({ tracked: false });
    });
  });

  describe('puntos', () => {
    it('guarda con la hora del teléfono y marca que el GPS funciona', async () => {
      const { controller, prisma } = build();
      const at = recentInWindow();
      const res = await controller.puntos(person('compras'), {
        platform: 'android',
        points: [{ lat: 19.04, lng: -98.2, accuracyM: 12, capturedAt: at.toISOString() }],
      });
      expect(res).toEqual({ saved: 1, ignored: 0 });
      expect(prisma.locationPoint.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ userId: 'u-compras', lat: 19.04, capturedAt: at, platform: 'android' })],
      });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ locationState: 'ok' }) }));
    });

    it('fuera del horario no guarda nada aunque la app lo mande', async () => {
      const { controller, prisma } = build();
      const res = await controller.puntos(person('compras'), {
        points: [{ lat: 19, lng: -98, capturedAt: '2026-11-03T08:00:00.000-06:00' }],
      });
      expect(res.saved).toBe(0);
      expect(prisma.locationPoint.createMany).not.toHaveBeenCalled();
    });
  });

  describe('quién la ve', () => {
    it.each(['dir_adjunta', 'compras', 'contabilidad', 'logistica', 'practicante'])('%s no ve al equipo', async (role) => {
      const { controller } = build();
      await expect(controller.equipo(person(role))).rejects.toThrow(ForbiddenException);
      await expect(controller.persona(person(role), 'x')).rejects.toThrow(ForbiddenException);
    });

    it('un permiso extra no la abre', async () => {
      const { controller } = build();
      const user = { user: { id: 'u', roleKey: 'dir_adjunta', organizationId: ORG, permissions: ['everything'] } };
      await expect(controller.equipo(user)).rejects.toThrow(ForbiddenException);
    });

    it('la lista deja fuera a los exentos y es de la propia organización', async () => {
      const { controller, prisma } = build();
      await controller.equipo(person('dir_general'), '2026-11-03');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ORG,
            active: true,
            roleKey: { notIn: ['dir_general', 'super_admin'] },
          }),
        }),
      );
    });

    it('abrir el recorrido de alguien queda en la auditoría', async () => {
      const { controller, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', fullName: 'Ana', title: null, roleKey: 'compras', organizationId: ORG });
      await controller.persona(person('dir_general'), 'u-1', '2026-11-03');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ubicacion.view', resourceId: 'u-1', userId: 'u-dir_general' }),
      });
    });

    it('no abre a alguien de otra organización ni a un exento', async () => {
      const { controller, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', fullName: 'Ana', roleKey: 'compras', organizationId: 'otra' });
      await expect(controller.persona(person('dir_general'), 'u-1')).rejects.toThrow(NotFoundException);
      prisma.user.findUnique.mockResolvedValue({ id: 'u-2', fullName: 'Arturo', roleKey: 'dir_general', organizationId: ORG });
      await expect(controller.persona(person('dir_general'), 'u-2')).rejects.toThrow(NotFoundException);
    });
  });
});
