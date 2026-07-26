import { BadRequestException } from '@nestjs/common';
import { OrgPlan } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';

/** Soft caps shown in Organizations UI. null = unlimited. Enforced on create; plan driven by Stripe (W9) or platform admin. */
export const PLAN_CAPS: Record<OrgPlan, { users: number | null; events: number | null }> = {
  TRIAL: { users: 10, events: 5 },
  OPS: { users: 50, events: 40 },
  ENTERPRISE: { users: null, events: null },
};

export async function assertUserSeatAvailable(
  prisma: PrismaService,
  organizationId: string,
  opts?: { countPendingInvites?: boolean; excludeInviteId?: string },
) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new BadRequestException('Organización no encontrada');
  if (!org.active) throw new BadRequestException('Organización inactiva');

  const cap = PLAN_CAPS[org.plan]?.users ?? null;
  if (cap == null) return org;

  const users = await prisma.user.count({ where: { organizationId } });
  let pending = 0;
  if (opts?.countPendingInvites !== false) {
    pending = await prisma.orgInvite.count({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(opts?.excludeInviteId ? { id: { not: opts.excludeInviteId } } : {}),
      },
    });
  }
  if (users + pending >= cap) {
    throw new BadRequestException(
      `Límite soft del plan ${org.plan}: ${cap} usuarios` +
        (pending
          ? ` (incluye ${pending} invite${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'})`
          : ''),
    );
  }
  return org;
}

export async function assertEventSlotAvailable(prisma: PrismaService, organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new BadRequestException('Organización no encontrada');
  if (!org.active) throw new BadRequestException('Organización inactiva');

  const cap = PLAN_CAPS[org.plan]?.events ?? null;
  if (cap == null) return org;

  const events = await prisma.event.count({ where: { organizationId } });
  if (events >= cap) {
    throw new BadRequestException(`Límite soft del plan ${org.plan}: ${cap} eventos`);
  }
  return org;
}
