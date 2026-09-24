import { ForbiddenException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';

describe('DocumentsController · PDF → editable solo dirección', () => {
  const ORG = 'org_arta_internal';
  const event = { id: 'ev1', name: 'Show', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const user = (roleKey: string) => ({
    id: `u-${roleKey}`,
    roleKey,
    entities: ['ARTA'],
    fullName: 'Tester',
    permissions: [] as string[],
    organizationId: ORG,
  });

  function setup() {
    const prisma = {
      event: { findUnique: async () => event },
      eventDocument: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'd1', ...data, version: 1 }),
      },
    };
    const pdfs = { generate: async () => ({ url: '/uploads/x.pdf' }) };
    const revisions = { record: async () => ({}) };
    const controller = new DocumentsController(prisma as never, pdfs as never, revisions as never);
    return { controller };
  }

  it('bloquea a no-dirección cuando viene sourceFileId', async () => {
    const { controller } = setup();
    await expect(
      controller.create(
        { user: user('logistica') } as never,
        { eventId: 'ev1', title: 'Doc', sourceFileId: 'f1', blocks: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite a dirección volverlo editable', async () => {
    const { controller } = setup();
    const created = await controller.create(
      { user: user('dir_general') } as never,
      { eventId: 'ev1', title: 'Doc', sourceFileId: 'f1', blocks: [] },
    );
    expect(created).toHaveProperty('id');
    expect(created).toHaveProperty('title', 'Doc');
  });
});

