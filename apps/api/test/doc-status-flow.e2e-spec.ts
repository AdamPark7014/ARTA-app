import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ChecklistsController } from '../src/checklists/checklists.controller';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';
import { RevisionService } from '../src/common/revisions/revision.service';

/**
 * Flujo de aprobación: Borrador → Revisión → Aprobado → Sellado.
 *
 * Lo que blinda: hasta ahora firmar un formato NO congelaba nada — cualquiera
 * con `checklist.edit` seguía editando y el PDF se reimprimía con la firma
 * pegada sobre el contenido nuevo, así que el documento parecía autorizado sin
 * serlo.
 */
describe('Estados del documento (e2e, base real)', () => {
  const prisma = new PrismaClient();
  let controller: ChecklistsController;
  let org: { id: string };
  let event: { id: string };
  let template: { id: string };
  let checklistId: string;

  const user = (roleKey: string, id = `u-${roleKey}`) => ({
    id,
    roleKey,
    entities: ['ARTA'],
    permissions: ['checklist.edit'],
    fullName: roleKey,
    organizationId: org.id,
  });

  const data = (aforo: string) => ({
    sections: [
      { id: 'datos', title: 'Datos', items: [{ id: 'aforo', label: 'Aforo', type: 'text', value: aforo }] },
    ],
  });

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    controller = new ChecklistsController(
      prisma as never,
      new ChecklistPdfService(prisma as never),
      new RevisionService(prisma as never),
    );
    org = await prisma.organization.create({ data: { slug: `st-${suffix}`, name: 'Estados' } });
    await prisma.user.createMany({
      data: ['logistica', 'gerente_arta', 'dir_general'].map((r) => ({
        id: `u-${r}`,
        email: `${r}-${suffix}@test.mx`,
        fullName: r,
        passwordHash: 'x',
        roleKey: r,
        entities: ['ARTA' as const],
        organizationId: org.id,
      })),
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
        title: 'Formato',
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
    await prisma.auditLog.deleteMany({ where: { userId: { startsWith: 'u-' } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: 'u-' } } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  });

  const status = (u: ReturnType<typeof user>, next: string, reason?: string) =>
    controller.changeStatus({ user: u } as never, checklistId, { status: next as never, reason });

  const edit = (u: ReturnType<typeof user>, aforo: string) =>
    controller.update({ user: u } as never, checklistId, {
      dataJson: data(aforo),
      regeneratePdf: false,
    });

  it('pedir revisión es autoservicio: logística puede hacerlo', async () => {
    const updated = await status(user('logistica'), 'REVIEW');
    expect(updated.status).toBe('REVIEW');
    expect(updated.submittedById).toBe('u-logistica');
  });

  it('en REVISIÓN se sigue pudiendo editar — es una bandera, no un candado', async () => {
    await status(user('logistica'), 'REVIEW');
    await expect(edit(user('logistica'), '3900')).resolves.toBeTruthy();
  });

  it('logística NO puede aprobar', async () => {
    await expect(status(user('logistica'), 'APPROVED')).rejects.toThrow(/aprobar/);
  });

  it('gerencia aprueba, y a partir de ahí el formato NO se edita', async () => {
    const approved = await status(user('gerente_arta'), 'APPROVED');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedById).toBe('u-gerente_arta');

    await expect(edit(user('gerente_arta'), '3000')).rejects.toThrow(/aprobado/i);
  });

  it('un aprobado se puede devolver a borrador y entonces sí se edita', async () => {
    await status(user('gerente_arta'), 'APPROVED');
    await status(user('gerente_arta'), 'DRAFT');
    await expect(edit(user('gerente_arta'), '3000')).resolves.toBeTruthy();
  });

  it('sellar deja el formato en solo lectura de verdad', async () => {
    await status(user('gerente_arta'), 'APPROVED');
    const sealed = await status(user('gerente_arta'), 'SEALED');
    expect(sealed.status).toBe('SEALED');
    expect(sealed.sealedById).toBe('u-gerente_arta');

    await expect(edit(user('dir_general'), '1')).rejects.toThrow(/sellado/i);
  });

  it('no se puede saltar de borrador a sellado', async () => {
    await expect(status(user('dir_general'), 'SEALED')).rejects.toThrow(/No se puede pasar/);
  });

  it('solo dirección reabre un sellado, y con motivo', async () => {
    await status(user('gerente_arta'), 'APPROVED');
    await status(user('gerente_arta'), 'SEALED');

    await expect(status(user('gerente_arta'), 'DRAFT', 'me equivoqué')).rejects.toThrow(
      /dirección general/,
    );
    await expect(status(user('dir_general'), 'DRAFT')).rejects.toThrow(/motivo/);
    await expect(status(user('dir_general'), 'DRAFT', 'ok')).rejects.toThrow(/motivo/);

    const reopened = await status(user('dir_general'), 'DRAFT', 'Faltó el aforo real del recinto');
    expect(reopened.status).toBe('DRAFT');
    expect(reopened.reopenReason).toBe('Faltó el aforo real del recinto');
    expect(reopened.sealedAt).toBeNull();
  });

  it('cada transición deja su revisión, con el motivo de la reapertura', async () => {
    await status(user('logistica'), 'REVIEW');
    await status(user('gerente_arta'), 'APPROVED');
    await status(user('gerente_arta'), 'SEALED');
    await status(user('dir_general'), 'DRAFT', 'Corrección de cifras acordada');

    const revisions = await prisma.docRevision.findMany({
      where: { docType: 'CHECKLIST', docId: checklistId },
      orderBy: { revision: 'asc' },
    });
    expect(revisions).toHaveLength(4);
    expect(revisions.map((r) => `${r.fromStatus}→${r.toStatus}`)).toEqual([
      'DRAFT→REVIEW',
      'REVIEW→APPROVED',
      'APPROVED→SEALED',
      'SEALED→DRAFT',
    ]);
    expect(revisions[3].note).toContain('Corrección de cifras acordada');
    expect(revisions[3].authorId).toBe('u-dir_general');
  });

  it('un evento cerrado manda sobre el estado del documento', async () => {
    await prisma.event.update({ where: { id: event.id }, data: { status: 'CLOSED' } });
    try {
      await expect(edit(user('dir_general'), '1')).rejects.toThrow(ForbiddenException);
    } finally {
      await prisma.event.update({ where: { id: event.id }, data: { status: 'ACTIVE' } });
    }
  });
});
