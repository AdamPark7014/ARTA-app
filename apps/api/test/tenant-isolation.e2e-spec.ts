import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ChecklistsController } from '../src/checklists/checklists.controller';
import { ChecklistPdfService } from '../src/checklists/checklist-pdf.service';
import { CampaignsController } from '../src/campaigns/campaigns.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { RevisionService } from '../src/common/revisions/revision.service';
import { SponsorsController } from '../src/sponsors/sponsors.controller';
import { FoldersController } from '../src/folders/folders.controller';
import { DigestsController } from '../src/digests/digests.controller';
import { DigestsService } from '../src/digests/digests.service';
import { OrganizationsController } from '../src/organizations/organizations.controller';
import { OrgInvitesController } from '../src/organizations/org-invites.controller';

/**
 * Proves the cross-org isolation fix end-to-end against a real Postgres database
 * (arta_test — see test/setup-env.js). Two organizations, each with their own
 * ARTA-entity event, verify a user in org A can never read or write org B's
 * checklists/campaigns/tasks/sponsors even though both share the same `entity`
 * (the pre-existing ARTA/EXPLANADA dimension does not encode org boundaries).
 */
describe('Multi-org tenant isolation (e2e, real DB)', () => {
  const prisma = new PrismaClient();
  let orgA: { id: string };
  let orgB: { id: string };
  let eventA: { id: string; entity: string };
  let eventB: { id: string; entity: string };
  let checklistA: { id: string };
  let checklistB: { id: string };
  let folderA: { id: string };
  let folderB: { id: string };

  const userInOrgA = (overrides: Partial<{ roleKey: string; permissions: string[] }> = {}) => ({
    id: 'user-a',
    roleKey: overrides.roleKey || 'gerente_arta',
    entities: ['ARTA'],
    permissions: overrides.permissions || ['campaign.edit'],
    fullName: 'User A',
    organizationId: orgA.id,
  });

  const dirGeneralOrgA = () => ({
    id: 'user-dir-a',
    roleKey: 'dir_general',
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [],
    fullName: 'Dir A',
    organizationId: orgA.id,
  });

  const superAdmin = () => ({
    id: 'user-super',
    roleKey: 'super_admin',
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [],
    fullName: 'Super Admin',
    organizationId: orgA.id,
  });

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    orgA = await prisma.organization.create({
      data: { slug: `org-a-${suffix}`, name: 'Org A', plan: 'ENTERPRISE' },
    });
    orgB = await prisma.organization.create({
      data: { slug: `org-b-${suffix}`, name: 'Org B', plan: 'ENTERPRISE' },
    });

    eventA = await prisma.event.create({
      data: { organizationId: orgA.id, entity: 'ARTA', name: `Event A ${suffix}`, status: 'ACTIVE' },
    });
    eventB = await prisma.event.create({
      data: { organizationId: orgB.id, entity: 'ARTA', name: `Event B ${suffix}`, status: 'ACTIVE' },
    });

    const template = await prisma.checklistTemplate.create({
      data: {
        key: 'EVENTO_GENERAL',
        name: `Template ${suffix}`,
        entities: ['ARTA'],
        schemaJson: { sections: [] },
      },
    });

    checklistA = await prisma.checklistInstance.create({
      data: { eventId: eventA.id, templateId: template.id, title: 'Checklist A', dataJson: {} },
    });
    checklistB = await prisma.checklistInstance.create({
      data: { eventId: eventB.id, templateId: template.id, title: 'Checklist B', dataJson: {} },
    });

    folderA = await prisma.sharedFolder.create({
      data: {
        organizationId: orgA.id,
        entity: 'ARTA',
        name: `Folder A ${suffix}`,
        allowedRoles: [],
      },
    });
    folderB = await prisma.sharedFolder.create({
      data: {
        organizationId: orgB.id,
        entity: 'ARTA',
        name: `Folder B ${suffix}`,
        allowedRoles: [],
      },
    });

    await prisma.notificationOutbox.createMany({
      data: [
        {
          organizationId: orgA.id,
          channel: 'email',
          toAddr: 'a@example.com',
          subject: 'Invite A',
          bodyText: 'secret-a',
          status: 'sent',
          metaJson: { organizationId: orgA.id },
        },
        {
          organizationId: orgB.id,
          channel: 'email',
          toAddr: 'b@example.com',
          subject: 'Invite B',
          bodyText: 'secret-b',
          status: 'sent',
          metaJson: { organizationId: orgB.id },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await prisma.sharedFolder.deleteMany({ where: { id: { in: [folderA.id, folderB.id] } } });
    await prisma.checklistInstance.deleteMany({ where: { eventId: { in: [eventA.id, eventB.id] } } });
    await prisma.checklistTemplate.deleteMany({ where: { name: { contains: 'Template' } } });
    await prisma.event.deleteMany({ where: { id: { in: [eventA.id, eventB.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  });

  describe('ChecklistsController', () => {
    let controller: ChecklistsController;

    beforeAll(() => {
      // `ChecklistPdfService` exige PrismaService; sin argumento esto no
      // compilaba y el spec entero se apoyaba en un error de tipos.
      controller = new ChecklistsController(
        prisma as never,
        new ChecklistPdfService(prisma as never),
        new RevisionService(prisma as never),
      );
    });

    it('lets a user read a checklist that belongs to their own org', async () => {
      const result = await controller.get({ user: userInOrgA() }, checklistA.id);
      expect(result.id).toBe(checklistA.id);
    });

    it('blocks a user from reading a checklist in a different org (cross-tenant IDOR)', async () => {
      await expect(controller.get({ user: userInOrgA() }, checklistB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a user from listing another org event checklists by eventId', async () => {
      await expect(controller.byEvent({ user: userInOrgA() }, eventB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks writes (update) across org boundaries, not just reads', async () => {
      await expect(
        controller.update({ user: userInOrgA() }, checklistB.id, { dataJson: { sections: [] } }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('super_admin can still cross org boundaries by design', async () => {
      const result = await controller.get({ user: superAdmin() }, checklistB.id);
      expect(result.id).toBe(checklistB.id);
    });
  });

  describe('CampaignsController', () => {
    let controller: CampaignsController;

    beforeAll(() => {
      controller = new CampaignsController(prisma as never);
    });

    it('blocks reading another org event campaign', async () => {
      await expect(controller.byEvent({ user: userInOrgA() }, eventB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks creating/editing a campaign on another org event', async () => {
      await expect(
        controller.upsert({ user: userInOrgA() }, eventB.id, { notes: 'hijack attempt' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('TasksController', () => {
    let controller: TasksController;

    beforeAll(() => {
      // `TasksController` recibe NotificationsService desde el turno de
      // evidencia/aprobación de tareas.
      controller = new TasksController(prisma as never, new NotificationsService(prisma as never));
    });

    it('blocks listing tasks for another org event', async () => {
      await expect(controller.byEvent({ user: userInOrgA() }, eventB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks creating a task on another org event', async () => {
      await expect(
        controller.create({ user: userInOrgA() }, { eventId: eventB.id, title: 'hijack' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SponsorsController', () => {
    let controller: SponsorsController;

    beforeAll(() => {
      controller = new SponsorsController(prisma as never);
    });

    it('blocks listing sponsors for another org event', async () => {
      await expect(controller.list({ user: userInOrgA() }, eventB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks creating a sponsor on another org event', async () => {
      await expect(
        controller.create({ user: userInOrgA() }, { eventId: eventB.id, name: 'hijack sponsor' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('FoldersController (W7)', () => {
    let controller: FoldersController;

    beforeAll(() => {
      controller = new FoldersController(prisma as never);
    });

    it('lists only folders for the caller tenant', async () => {
      const rows = await controller.list(
        { user: userInOrgA({ permissions: ['folders.edit'] }) },
        'ARTA',
      );
      expect(rows.every((f) => f.organizationId === orgA.id)).toBe(true);
      expect(rows.some((f) => f.id === folderA.id)).toBe(true);
      expect(rows.some((f) => f.id === folderB.id)).toBe(false);
    });

    it('blocks reading another org folder by id', async () => {
      await expect(
        controller.one({ user: userInOrgA({ permissions: ['folders.edit'] }) }, folderB.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('DigestsController outbox (W7)', () => {
    let controller: DigestsController;

    beforeAll(() => {
      const service = new DigestsService(
        prisma as never,
        { dispatch: async () => ({ delivered: 0 }) } as never,
      );
      controller = new DigestsController(service);
    });

    it('hides other tenants invite emails from org-admin outbox', async () => {
      const rows = await controller.outbox({ user: dirGeneralOrgA() });
      expect(rows.every((r) => r.organizationId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.toAddr === 'b@example.com')).toBe(false);
    });

    it('lets platform admin see all tenants outbox', async () => {
      const rows = await controller.outbox({ user: superAdmin() });
      expect(rows.some((r) => r.organizationId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.organizationId === orgB.id)).toBe(true);
    });
  });

  describe('Org admin ACL (W7)', () => {
    let orgs: OrganizationsController;
    let invites: OrgInvitesController;

    beforeAll(() => {
      orgs = new OrganizationsController(prisma as never);
      invites = new OrgInvitesController(
        prisma as never,
        {} as never,
        { flushOutbox: async () => ({ sent: 0 }) } as never,
      );
    });

    it('blocks dir_general from patching another org plan/settings', async () => {
      await expect(
        orgs.patch({ user: dirGeneralOrgA() }, orgB.id, { name: 'Hijacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks dir_general from listing members of another org', async () => {
      await expect(invites.members({ user: dirGeneralOrgA() }, orgB.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks dir_general from creating orgs (platform-only)', async () => {
      await expect(
        orgs.create({ user: dirGeneralOrgA() }, { name: 'Evil', slug: `evil-${Date.now()}` }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
