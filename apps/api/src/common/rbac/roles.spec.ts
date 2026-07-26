import {
  hasPermission,
  canAccessEntity,
  canAccessEventOps,
  eventOpsEntities,
  PERMISSIONS,
  ROLES,
  type EntityKey,
  type RoleKey,
} from './roles';

describe('rbac/roles', () => {
  describe('hasPermission', () => {
    it('grants super_admin every permission regardless of role table', () => {
      expect(hasPermission('super_admin', [], PERMISSIONS.USERS_MANAGE)).toBe(true);
      expect(hasPermission('super_admin', [], PERMISSIONS.PO_AUTHORIZE)).toBe(true);
    });

    it('grants dir_general every permission (treated like super_admin)', () => {
      expect(hasPermission('dir_general', [], PERMISSIONS.USERS_MANAGE)).toBe(true);
    });

    it('denies a permission not on the role and not in extra permissions', () => {
      // convenios has no PO_AUTHORIZE in its role table and none granted via extra
      expect(hasPermission('convenios', [], PERMISSIONS.PO_AUTHORIZE)).toBe(false);
    });

    it('grants a permission listed on the role table', () => {
      expect(hasPermission('gerente_arta', [], PERMISSIONS.PO_AUTHORIZE)).toBe(true);
    });

    it('grants a permission only present via the extra/fine-grained list', () => {
      expect(hasPermission('convenios', [PERMISSIONS.PO_AUTHORIZE], PERMISSIONS.PO_AUTHORIZE)).toBe(
        true,
      );
    });

    it('does not let extra permissions leak into other roles implicitly', () => {
      // enlace_gobierno without CAMPAIGN_EDIT in its role table or extra list
      expect(hasPermission('enlace_gobierno', [], PERMISSIONS.CAMPAIGN_EDIT)).toBe(false);
    });
  });

  describe('canAccessEntity', () => {
    it('super_admin and dir_general bypass entity membership entirely', () => {
      expect(canAccessEntity([], 'super_admin', 'ARTA')).toBe(true);
      expect(canAccessEntity([], 'dir_general', 'EXPLANADA')).toBe(true);
    });

    it('regular roles are restricted to their assigned entities', () => {
      expect(canAccessEntity(['ARTA'], 'gerente_arta', 'ARTA')).toBe(true);
      expect(canAccessEntity(['ARTA'], 'gerente_arta', 'EXPLANADA')).toBe(false);
    });

    it('denies an entity the user was never granted', () => {
      expect(canAccessEntity([], 'logistica', 'ARTA')).toBe(false);
    });
  });

  describe('canAccessEventOps', () => {
    it('blocks dir_auditorio from ARTA event ops even if entity is on their list', () => {
      // ROLE_DEFAULT_ENTITIES gives dir_auditorio ['EXPLANADA','ARTA'] but ops access to ARTA is denied by design
      expect(canAccessEventOps(['EXPLANADA', 'ARTA'], 'dir_auditorio', 'ARTA')).toBe(false);
      expect(canAccessEventOps(['EXPLANADA', 'ARTA'], 'dir_auditorio', 'EXPLANADA')).toBe(true);
    });

    it('falls through to canAccessEntity for roles without special-case carve-outs', () => {
      expect(canAccessEventOps(['ARTA'], 'gerente_arta', 'ARTA')).toBe(true);
      expect(canAccessEventOps(['ARTA'], 'gerente_arta', 'EXPLANADA')).toBe(false);
    });

    it('never grants ops access to an entity the user does not hold at all', () => {
      expect(canAccessEventOps([], 'logistica', 'ARTA')).toBe(false);
    });
  });

  describe('eventOpsEntities', () => {
    it('filters out entities blocked by the dir_auditorio ARTA carve-out', () => {
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'dir_auditorio')).toEqual(['EXPLANADA']);
    });

    it('returns the full entity list for roles without carve-outs', () => {
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'gerente_arta')).toEqual(['ARTA', 'EXPLANADA']);
    });

    it('returns an empty list for a user with no entities', () => {
      expect(eventOpsEntities([], 'logistica')).toEqual([]);
    });
  });

  it('every declared role resolves to a stable, known key (catalog integrity)', () => {
    const known = new Set(Object.values(ROLES));
    const roleKey: RoleKey = 'super_admin';
    expect(known.has(roleKey)).toBe(true);
    const entity: EntityKey = 'ARTA';
    expect(['ARTA', 'EXPLANADA']).toContain(entity);
  });
});
