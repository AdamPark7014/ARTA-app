import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CalendarController } from './calendar.controller';

/**
 * Notas del calendario: cualquiera con acceso operativo a la entidad puede
 * escribir, editar o borrar; nunca fuera de su organización ni en una entidad
 * a la que no llega (p. ej. `solo_carpetas`, o Auditorio desde dirección de
 * Arta — ver `canAccessEventOps`).
 */
describe('CalendarController', () => {
  const ORG = 'org_arta_internal';
  const user = (roleKey: string, entities: string[] = ['ARTA', 'EXPLANADA'], organizationId = ORG) =>
    ({ id: `u-${roleKey}`, roleKey, entities, organizationId }) as any;

  function setup() {
    let notes: any[] = [];
    let seq = 0;
    const users: Record<string, { id: string; fullName: string }> = {
      'u-gerente_arta': { id: 'u-gerente_arta', fullName: 'Gerencia Arta' },
    'u-dir_general': { id: 'u-dir_general', fullName: 'Dirección General' },
    };
    const prisma = {
      calendarNote: {
        create: async ({ data }: any) => {
          seq += 1;
          const row = { id: `note-${seq}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          notes.push(row);
          return { ...row, createdBy: users[row.createdById] ?? null, updatedBy: users[row.updatedById] ?? null };
        },
        findMany: async ({ where }: any) => {
          const matches = notes.filter((n) => {
            if (n.organizationId !== where.organizationId || n.entity !== where.entity) return false;
            if (where.date?.gte && n.date < where.date.gte) return false;
            if (where.date?.lte && n.date > where.date.lte) return false;
            return true;
          });
          return matches
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((n) => ({ ...n, createdBy: users[n.createdById] ?? null, updatedBy: users[n.updatedById] ?? null }));
        },
        findUnique: async ({ where: { id } }: any) => notes.find((n) => n.id === id) || null,
        update: async ({ where: { id }, data }: any) => {
          const row = notes.find((n) => n.id === id);
          Object.assign(row, data, { updatedAt: new Date() });
          return { ...row, createdBy: users[row.createdById] ?? null, updatedBy: users[row.updatedById] ?? null };
        },
        delete: async ({ where: { id } }: any) => {
          notes = notes.filter((n) => n.id !== id);
          return {};
        },
      },
    } as unknown as PrismaService;
    return { controller: new CalendarController(prisma), prisma, notesRef: () => notes };
  }

  it('crea una nota y la lista de vuelta con el autor', async () => {
    const { controller } = setup();
    const req = { user: user('gerente_arta') } as any;
    const created = await controller.create(req, { entity: 'ARTA' as any, date: '2026-10-01', text: '  Confirmar catering  ' });
    expect(created.text).toBe('Confirmar catering'); // se recorta
    expect(created.createdBy?.fullName).toBe('Gerencia Arta');

    const list = await controller.list(req, 'ARTA' as any);
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe('2026-10-01');
  });

  it('rechaza texto vacío o solo espacios', async () => {
    const { controller } = setup();
    const req = { user: user('gerente_arta') } as any;
    await expect(controller.create(req, { entity: 'ARTA' as any, date: '2026-10-01', text: '   ' })).rejects.toThrow(BadRequestException);
  });

  it('valida el formato de fecha', async () => {
    const { controller } = setup();
    const req = { user: user('gerente_arta') } as any;
    await expect(controller.create(req, { entity: 'ARTA' as any, date: '1-10-2026', text: 'ok' })).rejects.toThrow(BadRequestException);
  });

  it('filtra por rango de fechas', async () => {
    const { controller } = setup();
    const req = { user: user('gerente_arta') } as any;
    await controller.create(req, { entity: 'ARTA' as any, date: '2026-09-30', text: 'antes' });
    await controller.create(req, { entity: 'ARTA' as any, date: '2026-10-15', text: 'dentro' });
    await controller.create(req, { entity: 'ARTA' as any, date: '2026-11-01', text: 'después' });
    const list = await controller.list(req, 'ARTA' as any, '2026-10-01', '2026-10-31');
    expect(list.map((n) => n.text)).toEqual(['dentro']);
  });

  it('un rol solo_carpetas no puede escribir ni leer notas', async () => {
    const { controller } = setup();
    const req = { user: user('solo_carpetas') } as any;
    await expect(controller.create(req, { entity: 'ARTA' as any, date: '2026-10-01', text: 'no debería' })).rejects.toThrow(ForbiddenException);
    await expect(controller.list(req, 'ARTA' as any)).rejects.toThrow(ForbiddenException);
  });

  it('dirección de Auditorio no puede escribir en Arta', async () => {
    const { controller } = setup();
    const req = { user: user('dir_auditorio', ['EXPLANADA']) } as any;
    await expect(controller.create(req, { entity: 'ARTA' as any, date: '2026-10-01', text: 'no debería' })).rejects.toThrow(ForbiddenException);
  });

  it('cualquiera con acceso puede editar o borrar la nota de otra persona (es del equipo, no personal)', async () => {
    const { controller } = setup();
    const author = { user: user('gerente_arta') } as any;
    const teammate = { user: user('dir_general', ['ARTA', 'EXPLANADA']) } as any;
    const created = await controller.create(author, { entity: 'ARTA' as any, date: '2026-10-01', text: 'original' });

    const updated = await controller.update(teammate, created.id, { text: 'corregida' });
    expect(updated.text).toBe('corregida');
    expect(updated.updatedBy?.fullName).toBe('Dirección General');

    await controller.remove(teammate, created.id);
    await expect(controller.update(teammate, created.id, { text: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('no se puede tocar una nota de otra organización', async () => {
    const { controller } = setup();
    const owner = { user: user('gerente_arta', ['ARTA'], ORG) } as any;
    const outsider = { user: user('gerente_arta', ['ARTA'], 'otra-org') } as any;
    const created = await controller.create(owner, { entity: 'ARTA' as any, date: '2026-10-01', text: 'privado de mi org' });
    await expect(controller.update(outsider, created.id, { text: 'hackeada' })).rejects.toThrow(ForbiddenException);
  });
});
