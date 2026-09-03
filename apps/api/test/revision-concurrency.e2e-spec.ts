import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ChecklistsController } from '../src/checklists/checklists.controller';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';
import { RevisionService } from '../src/common/revisions/revision.service';

/**
 * El problema que esto blinda: hasta ahora dos personas editando el mismo
 * formato se pisaban en silencio. El autoguardado manda el documento completo
 * cada 1.8 s y el servidor hacía `update({ data: { dataJson } })` — el último
 * en escribir ganaba y el otro perdía su trabajo sin ver un solo error.
 *
 * Se prueba contra Postgres de verdad porque lo que hay que demostrar es la
 * atomicidad del UPDATE, no que un mock devuelva lo que le dijimos.
 */
describe('Bloqueo optimista de revisiones (e2e, base real)', () => {
  const prisma = new PrismaClient();
  let controller: ChecklistsController;
  let org: { id: string };
  let event: { id: string };
  let template: { id: string };
  let checklistId: string;

  const editor = (id = 'user-karla', fullName = 'Karla') => ({
    id,
    roleKey: 'gerente_arta',
    entities: ['ARTA'],
    permissions: ['checklist.edit'],
    fullName,
    organizationId: org.id,
  });

  /** Formato con un solo campo, para que el diff sea inequívoco. */
  const data = (aforo: string) => ({
    sections: [
      {
        id: 'datos',
        title: 'Datos del show',
        items: [{ id: 'aforo', label: 'Aforo autorizado', type: 'text', value: aforo }],
      },
    ],
  });

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    controller = new ChecklistsController(
      prisma as never,
      new ChecklistPdfService(prisma as never),
      new RevisionService(prisma as never),
    );

    org = await prisma.organization.create({
      data: { slug: `rev-${suffix}`, name: 'Revisiones test' },
    });
    await prisma.user.createMany({
      data: [
        { id: 'user-karla', email: `karla-${suffix}@test.mx`, fullName: 'Karla', passwordHash: 'x', roleKey: 'gerente_arta', entities: ['ARTA'], organizationId: org.id },
        { id: 'user-jl', email: `jl-${suffix}@test.mx`, fullName: 'José Luis', passwordHash: 'x', roleKey: 'dir_general', entities: ['ARTA'], organizationId: org.id },
      ],
      skipDuplicates: true,
    });
    event = await prisma.event.create({
      data: { organizationId: org.id, entity: 'ARTA', name: `Show ${suffix}`, status: 'ACTIVE' },
    });
    template = await prisma.checklistTemplate.create({
      data: { key: 'CUSTOM', name: `Plantilla ${suffix}`, schemaJson: data(''), entities: ['ARTA'] },
    });
  });

  beforeEach(async () => {
    const instance = await prisma.checklistInstance.create({
      data: {
        eventId: event.id,
        templateId: template.id,
        title: 'Formato de prueba',
        dataJson: data('4200'),
        revision: 0,
      },
    });
    checklistId = instance.id;
  });

  afterAll(async () => {
    await prisma.docRevision.deleteMany({ where: { eventId: event.id } });
    await prisma.checklistInstance.deleteMany({ where: { eventId: event.id } });
    await prisma.checklistTemplate.delete({ where: { id: template.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ['user-karla', 'user-jl'] } } });
    await prisma.user.deleteMany({ where: { id: { in: ['user-karla', 'user-jl'] } } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  });

  it('un guardado normal sube la revisión y deja historial con diff', async () => {
    await controller.update(
      { user: editor() } as never,
      checklistId,
      { dataJson: data('3800'), baseRevision: 0, regeneratePdf: false },
    );

    const saved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: checklistId } });
    expect(saved.revision).toBe(1);

    const revisions = await prisma.docRevision.findMany({ where: { docType: 'CHECKLIST', docId: checklistId } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revision).toBe(1);
    expect(revisions[0].authorId).toBe('user-karla');
    expect(revisions[0].organizationId).toBe(org.id);
    expect(revisions[0].eventId).toBe(event.id);

    const diff = revisions[0].diffJson as unknown as { changes: Array<Record<string, unknown>> };
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      label: 'Aforo autorizado',
      before: '4200',
      after: '3800',
      kind: 'changed',
    });
  });

  it('el segundo en guardar sobre la MISMA revisión recibe 409 y no pisa nada', async () => {
    // Karla guarda primero, sobre la revisión 0.
    await controller.update(
      { user: editor('user-karla', 'Karla') } as never,
      checklistId,
      { dataJson: data('3800'), baseRevision: 0, regeneratePdf: false },
    );

    // José Luis venía editando desde la misma revisión 0 y guarda después.
    const conflicto = controller.update(
      { user: editor('user-jl', 'José Luis') } as never,
      checklistId,
      { dataJson: data('5000'), baseRevision: 0, regeneratePdf: false },
    );

    await expect(conflicto).rejects.toBeInstanceOf(ConflictException);

    // Lo de Karla sigue en pie: el conflicto no escribió nada.
    const saved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: checklistId } });
    expect(saved.revision).toBe(1);
    expect((saved.dataJson as never as ReturnType<typeof data>).sections[0].items[0].value).toBe('3800');
  });

  it('el 409 explica quién guardó y qué cambió, para no perder lo tecleado', async () => {
    await controller.update(
      { user: editor('user-karla', 'Karla') } as never,
      checklistId,
      { dataJson: data('3800'), baseRevision: 0, regeneratePdf: false },
    );

    try {
      await controller.update(
        { user: editor('user-jl', 'José Luis') } as never,
        checklistId,
        { dataJson: data('5000'), baseRevision: 0, regeneratePdf: false },
      );
      throw new Error('debería haber lanzado conflicto');
    } catch (e) {
      const body = (e as ConflictException).getResponse() as {
        code: string;
        currentRevision: number;
        message: string;
        diff: { changes: Array<{ before: string; after: string }> };
      };
      expect(body.code).toBe('REVISION_CONFLICT');
      expect(body.currentRevision).toBe(1);
      expect(body.message).toContain('Karla');
      // El diff va de lo mío hacia lo suyo: 5000 (lo que yo tenía) → 3800.
      expect(body.diff.changes[0]).toMatchObject({ before: '5000', after: '3800' });
    }
  });

  it('dos guardados SIMULTÁNEOS: uno gana, el otro recibe conflicto', async () => {
    const [a, b] = await Promise.allSettled([
      controller.update({ user: editor('user-karla') } as never, checklistId, {
        dataJson: data('1111'),
        baseRevision: 0,
        regeneratePdf: false,
      }),
      controller.update({ user: editor('user-jl') } as never, checklistId, {
        dataJson: data('2222'),
        baseRevision: 0,
        regeneratePdf: false,
      }),
    ]);

    const ok = [a, b].filter((r) => r.status === 'fulfilled');
    const ko = [a, b].filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);

    const saved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: checklistId } });
    expect(saved.revision).toBe(1);
  });

  it('sin `baseRevision` se mantiene el comportamiento anterior (compatibilidad)', async () => {
    await controller.update({ user: editor() } as never, checklistId, {
      dataJson: data('3800'),
      regeneratePdf: false,
    });
    await controller.update({ user: editor('user-jl') } as never, checklistId, {
      dataJson: data('5000'),
      regeneratePdf: false,
    });

    const saved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: checklistId } });
    expect(saved.revision).toBe(2);
  });

  it('el autoguardado sube la revisión pero NO deja historial', async () => {
    await controller.update({ user: editor() } as never, checklistId, {
      dataJson: data('3900'),
      baseRevision: 0,
      draft: true,
    });

    const saved = await prisma.checklistInstance.findUniqueOrThrow({ where: { id: checklistId } });
    expect(saved.revision).toBe(1);

    const revisions = await prisma.docRevision.count({ where: { docType: 'CHECKLIST', docId: checklistId } });
    expect(revisions).toBe(0);
  });
});
