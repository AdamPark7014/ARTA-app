import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isDirectionRole, type RoleKey } from './roles';

@Injectable()
export class DirectionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Direction can be configured per organization under `settingsJson.directionUsers: string[]`.
   * Falls back to role-based check when no setting or user is not listed.
   */
  async isDirection(user: { id: string; roleKey: string | null | undefined }, organizationId?: string | null): Promise<boolean> {
    if (!organizationId) return isDirectionRole(user.roleKey as RoleKey);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { settingsJson: true } });
    const list =
      (org?.settingsJson && typeof org.settingsJson === 'object' && Array.isArray((org.settingsJson as any).directionUsers)
        ? ((org!.settingsJson as any).directionUsers as string[])
        : null) || null;
    if (list && list.includes(user.id)) return true;
    return isDirectionRole(user.roleKey as RoleKey);
  }
}

