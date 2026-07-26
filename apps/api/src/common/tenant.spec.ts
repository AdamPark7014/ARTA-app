import { ForbiddenException } from '@nestjs/common';
import {
  DEFAULT_ORG_ID,
  tenantIdOf,
  assertSameTenant,
  assertTenantAdminAccess,
  isPlatformAdmin,
  orgWhere,
} from './tenant';

describe('common/tenant', () => {
  describe('tenantIdOf', () => {
    it('returns the user organizationId when present', () => {
      expect(tenantIdOf({ roleKey: 'gerente_arta', organizationId: 'org_123' })).toBe('org_123');
    });

    it('falls back to DEFAULT_ORG_ID for legacy users with no organizationId', () => {
      expect(tenantIdOf({ roleKey: 'gerente_arta', organizationId: null })).toBe(DEFAULT_ORG_ID);
      expect(tenantIdOf({ roleKey: 'gerente_arta' })).toBe(DEFAULT_ORG_ID);
    });
  });

  describe('assertSameTenant', () => {
    it('allows access when resource org matches the user tenant', () => {
      expect(() =>
        assertSameTenant({ roleKey: 'gerente_arta', organizationId: 'org_a' }, 'org_a'),
      ).not.toThrow();
    });

    it('blocks cross-org access for a regular user (the core multi-tenant isolation guarantee)', () => {
      expect(() =>
        assertSameTenant({ roleKey: 'gerente_arta', organizationId: 'org_a' }, 'org_b'),
      ).toThrow(ForbiddenException);
    });

    it('allows access when the resource has no organizationId set (legacy/global data)', () => {
      expect(() =>
        assertSameTenant({ roleKey: 'gerente_arta', organizationId: 'org_a' }, null),
      ).not.toThrow();
      expect(() =>
        assertSameTenant({ roleKey: 'gerente_arta', organizationId: 'org_a' }, undefined),
      ).not.toThrow();
    });

    it('lets super_admin cross tenant boundaries regardless of org mismatch', () => {
      expect(() =>
        assertSameTenant({ roleKey: 'super_admin', organizationId: 'org_a' }, 'org_b'),
      ).not.toThrow();
    });

    it('does not special-case dir_general the way it does super_admin', () => {
      // dir_general has "everything" permission-wise elsewhere in RBAC, but tenant
      // isolation is a stricter boundary — only super_admin is exempt.
      expect(() =>
        assertSameTenant({ roleKey: 'dir_general', organizationId: 'org_a' }, 'org_b'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('orgWhere', () => {
    it('builds a Prisma where-clause scoped to the caller tenant', () => {
      expect(orgWhere({ roleKey: 'gerente_arta', organizationId: 'org_a' })).toEqual({
        organizationId: 'org_a',
      });
    });

    it('scopes to the default org for legacy users with no organizationId', () => {
      expect(orgWhere({ roleKey: 'gerente_arta', organizationId: null })).toEqual({
        organizationId: DEFAULT_ORG_ID,
      });
    });
  });

  describe('assertTenantAdminAccess', () => {
    it('allows same-tenant org admins', () => {
      expect(() =>
        assertTenantAdminAccess({ roleKey: 'dir_general', organizationId: 'org_a' }, 'org_a'),
      ).not.toThrow();
    });

    it('blocks dir_general from managing another org (no cross-tenant bypass)', () => {
      expect(() =>
        assertTenantAdminAccess({ roleKey: 'dir_general', organizationId: 'org_a' }, 'org_b'),
      ).toThrow(ForbiddenException);
    });

    it('lets only super_admin manage foreign orgs', () => {
      expect(() =>
        assertTenantAdminAccess({ roleKey: 'super_admin', organizationId: 'org_a' }, 'org_b'),
      ).not.toThrow();
    });
  });

  describe('isPlatformAdmin', () => {
    it('is true only for super_admin', () => {
      expect(isPlatformAdmin({ roleKey: 'super_admin' })).toBe(true);
      expect(isPlatformAdmin({ roleKey: 'dir_general' })).toBe(false);
    });
  });
});
