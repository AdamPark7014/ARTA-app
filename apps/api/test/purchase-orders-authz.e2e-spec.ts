import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PurchaseOrdersController } from '../src/purchase-orders/purchase-orders.controller';

/**
 * Proves purchase-orders authorization end-to-end against a real DB:
 * - cross-org access is blocked on every mutating endpoint (addProof, setStatus, remove),
 *   not just the ones that already had assertSameTenant before this pass;
 * - setStatus's fallthrough branch (any status other than AUTHORIZED/PAID) now requires
 *   PO_AUTHORIZE — previously it had no permission check at all.
 */
describe('PurchaseOrdersController authorization (e2e, real DB)', () => {
  const prisma = new PrismaClient();
  let controller: PurchaseOrdersController;

  let orgA: { id: string };
  let orgB: { id: string };
  let eventA: { id: string };
  let eventB: { id: string };
  let poA: { id: string };
  let poB: { id: string };
  let realUserId: string;

  const userInOrgA = (roleKey = 'gerente_arta', permissions: string[] = []) => ({
    id: realUserId,
    roleKey,
    entities: ['ARTA'],
    permissions,
    organizationId: orgA.id,
  });

  beforeAll(async () => {
    controller = new PurchaseOrdersController(prisma as never);
    const suffix = Date.now().toString(36);

    orgA = await prisma.organization.create({ data: { slug: `poa-${suffix}`, name: 'PO Org A' } });
    orgB = await prisma.organization.create({ data: { slug: `pob-${suffix}`, name: 'PO Org B' } });

    // Real row so FK-constrained writes (uploadedById, authorizedById…) succeed.
    const user = await prisma.user.create({
      data: {
        email: `po-tester-${suffix}@example.com`,
        passwordHash: 'x',
        fullName: 'PO Tester',
        roleKey: 'gerente_arta',
        entities: ['ARTA'],
        organizationId: orgA.id,
      },
    });
    realUserId = user.id;

    eventA = await prisma.event.create({
      data: { organizationId: orgA.id, entity: 'ARTA', name: `PO Event A ${suffix}`, status: 'ACTIVE' },
    });
    eventB = await prisma.event.create({
      data: { organizationId: orgB.id, entity: 'ARTA', name: `PO Event B ${suffix}`, status: 'ACTIVE' },
    });

    poA = await prisma.purchaseOrder.create({
      data: { eventId: eventA.id, rubro: 'audio', amount: 1000, status: 'PENDING_AUTH' },
    });
    poB = await prisma.purchaseOrder.create({
      data: { eventId: eventB.id, rubro: 'audio', amount: 1000, status: 'PENDING_AUTH' },
    });
  });

  afterAll(async () => {
    await prisma.paymentProof.deleteMany({ where: { purchaseOrderId: { in: [poA.id, poB.id] } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: [poA.id, poB.id] } } }).catch(() => undefined);
    await prisma.event.deleteMany({ where: { id: { in: [eventA.id, eventB.id] } } });
    await prisma.user.delete({ where: { id: realUserId } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await prisma.$disconnect();
  });

  describe('addProof', () => {
    it('blocks uploading a payment proof to another org PO', async () => {
      await expect(
        controller.addProof({ user: userInOrgA() }, poB.id, { fileUrl: '/uploads/fake.pdf' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows uploading a proof to a PO in the caller own org', async () => {
      const proof = await controller.addProof({ user: userInOrgA() }, poA.id, {
        fileUrl: '/uploads/real.pdf',
      });
      expect(proof.purchaseOrderId).toBe(poA.id);
    });
  });

  describe('setStatus', () => {
    it('blocks changing status on another org PO even with PO_AUTHORIZE permission', async () => {
      await expect(
        controller.setStatus(
          { user: userInOrgA('gerente_arta', ['po.authorize']) },
          poB.id,
          { status: 'AUTHORIZED' as never },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks the fallthrough branch (non-AUTHORIZED/PAID) without PO_AUTHORIZE — previously unguarded', async () => {
      // logistica has neither PO_AUTHORIZE nor PO_MARK_PAID in its role table.
      await expect(
        controller.setStatus({ user: userInOrgA('logistica', []) }, poA.id, {
          status: 'CANCELLED' as never,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the fallthrough branch for a role that does hold PO_AUTHORIZE', async () => {
      const updated = await controller.setStatus(
        { user: userInOrgA('gerente_arta', []) },
        poA.id,
        { status: 'PENDING_AUTH' as never },
      );
      expect(updated.status).toBe('PENDING_AUTH');
    });
  });

  describe('remove', () => {
    it('blocks deleting a PO that belongs to another org', async () => {
      await expect(controller.remove({ user: userInOrgA() }, poB.id)).rejects.toThrow(
        ForbiddenException,
      );
      // Confirm it genuinely was not deleted.
      const stillThere = await prisma.purchaseOrder.findUnique({ where: { id: poB.id } });
      expect(stillThere).not.toBeNull();
    });
  });
});
