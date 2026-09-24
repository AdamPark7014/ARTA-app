import { PrismaClient } from '@prisma/client';
import { ChecklistsController } from '../src/checklists/checklists.controller';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';
import { RevisionService } from '../src/common/revisions/revision.service';

describe('Checklist templates — create/import endpoints (smoke)', () => {
  const prisma = new PrismaClient();
  const dir = {
    user: {
      id: 'u-dir',
      roleKey: 'dir_general',
      entities: ['ARTA', 'EXPLANADA'],
      permissions: [],
      fullName: 'Dir',
      organizationId: null,
    },
  };

  let controller: ChecklistsController;

  beforeAll(async () => {
    // Ensure req.user.id exists to satisfy FK-constrained audit logs
    const exists = await prisma.user.findUnique({ where: { id: dir.user.id } });
    if (!exists) {
      await prisma.user.create({
        data: {
          id: dir.user.id,
          email: `dir-${Date.now()}@e2e.test`,
          passwordHash: 'x',
          fullName: dir.user.fullName,
          roleKey: dir.user.roleKey,
          entities: ['ARTA', 'EXPLANADA'] as any,
          organizationId: null,
        },
      });
    }
    controller = new ChecklistsController(
      prisma as never,
      new ChecklistPdfService(prisma as never),
      new RevisionService(prisma as never),
    );
  });

  afterAll(async () => {
    await prisma.checklistTemplate.deleteMany({ where: { name: { contains: 'Formato sin título' } } });
    await prisma.$disconnect();
  });

  it('creates a blank template (CUSTOM) and lists it', async () => {
    const created = await controller.createTemplate(dir as never, {
      name: 'Formato sin título',
      schemaJson: { sections: [] },
    });
    expect(created).toBeTruthy();
    expect(created.key).toBe('CUSTOM');
    const list = await controller.templates(dir as never, '1');
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((t) => t.id === created.id)).toBe(true);
  });
});

