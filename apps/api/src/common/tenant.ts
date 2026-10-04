import { ForbiddenException } from '@nestjs/common';

export const DEFAULT_ORG_ID = 'org_arta_internal';

export type TenantUser = {
  id?: string;
  roleKey: string;
  organizationId?: string | null;
  permissions?: string[];
};

/** Resolve tenant id for queries; directors without org fall back to default. */
export function tenantIdOf(user: TenantUser): string {
  return user.organizationId || DEFAULT_ORG_ID;
}

export function assertSameTenant(user: TenantUser, resourceOrgId?: string | null) {
  const tid = tenantIdOf(user);
  if (resourceOrgId && resourceOrgId !== tid && user.roleKey !== 'super_admin') {
    throw new ForbiddenException('Recurso de otra organización');
  }
}

export function orgWhere(user: TenantUser): { organizationId: string } {
  return { organizationId: tenantIdOf(user) };
}

/**
 * Org-admin surfaces (invites, plan patch, digests UI): same tenant only.
 * Only `super_admin` may act across organizations — `dir_general` is not exempt.
 */
export function assertTenantAdminAccess(user: TenantUser, targetOrgId: string) {
  if (user.roleKey === 'super_admin') return;
  if (tenantIdOf(user) !== targetOrgId) {
    throw new ForbiddenException('Fuera de tu organización');
  }
}

/**
 * Shared catalogs with no organizationId (Studio public site, checklist templates):
 * only Arta's own org (DEFAULT_ORG_ID) or `super_admin` may write them.
 * Role checks stay with each caller; this is the tenant boundary on top.
 */
export function assertSharedCatalogWrite(user: TenantUser) {
  if (user.roleKey === 'super_admin') return;
  if (tenantIdOf(user) !== DEFAULT_ORG_ID) {
    throw new ForbiddenException('Solo la organización de Arta puede modificar este contenido');
  }
}

/** Whether the caller may list/manage every organization (platform ops). */
export function isPlatformAdmin(user: TenantUser): boolean {
  return user.roleKey === 'super_admin';
}
