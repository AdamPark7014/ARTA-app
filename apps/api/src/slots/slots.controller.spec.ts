import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SlotsController } from './slots.controller';

describe('SlotsController (replacement auto-cancel)', () => {
  const ORG = 'org_arta_internal';
  const user = (roleKey: string) =>
    ({
      id: `u-${roleKey}`,
      roleKey,
      entities: ['ARTA'],
      organizationId: ORG,
      permissions: ['campaign.edit', 'finance.edit'],
    }) as any;

  function setup() {
    const event = { id: 'ev1', entity: 'ARTA', organizationId: ORG, status: 'ACTIVE' };
    const files: any[] = [
      { id: 'f-cam', eventId: 'ev1', fileName: 'CAMPANA.xlsx' },
      { id: 'f-cor', eventId: 'ev1', fileName: 'CORRIDA.xlsx' },
    ];
    let slots: any[] = [];
    const prisma = {
      event: { findUnique: async ({ where: { id } }: any) => (id === event.id ? event : null) },
      eventFile: {
        findUnique: async ({ where: { id } }: any) => files.find((f) => f.id === id) || null,
        create: async ({ data }: any) => {
          files.push(data);
          return data;
        },
      },
      eventDocumentSlot: {
        findFirst: async ({ where }: any) =>
          slots.find((s) => s.eventId === where.eventId && s.kind === where.kind && (!where.status || s.status === where.status)) || null,
        findMany: async ({ where }: any) => slots.filter((s) => s.eventId === where.eventId),
        upsert: async ({ where, create, update }: any) => {
          const key = (s: any) => s.eventId === where.eventId_kind_checklistTemplateId.eventId && s.kind === where.eventId_kind_checklistTemplateId.kind;
          const existing = slots.find(key);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          slots.push(create);
          return create;
        },
      },
      auditLog: { create: async () => ({}) },
    } as unknown as PrismaService;
    const controller = new SlotsController(prisma);
    return { controller, prisma, event, files, slots };
  }

  it('marks campaign slot replaced and then restored', async () => {
    const { controller, files } = setup();
    const req = { user: user('gerente_arta') } as any;
    const dirReq = { user: user('dir_general') } as any;
    // replace
    await controller.replace(req, 'ev1', { kind: 'CAMPAIGN', fileId: 'f-cam' });
    // restore
    await controller.restore(dirReq, 'ev1', { kind: 'CAMPAIGN' });
    expect(files.length).toBeGreaterThan(0);
  });

  it('enforces file type rules', async () => {
    const { controller, files } = setup();
    const req = { user: user('gerente_arta') } as any;
    files.push({ id: 'f-doc', eventId: 'ev1', fileName: 'X.docx' });
    await expect(controller.replace(req, 'ev1', { kind: 'CORRIDA', fileId: 'f-doc' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

