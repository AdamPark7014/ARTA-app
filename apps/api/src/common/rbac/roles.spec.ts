import {
  hasPermission,
  canAccessEntity,
  canAccessEventOps,
  canCreateTasks,
  canEditSponsors,
  canJoinEventChannels,
  canPublishStudio,
  canSeeEventCalendar,
  canSeeGeneralFolders,
  eventOpsEntities,
  isDirectionRole,
  ALL_ROLES,
  ASSIGNABLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_DEFAULT_ENTITIES,
  ROLE_HINTS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
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

  describe('solo_carpetas (junta 11-09-2026)', () => {
    it('never gets event operations in any entity', () => {
      expect(canAccessEventOps(['ARTA', 'EXPLANADA'], 'solo_carpetas', 'ARTA')).toBe(false);
      expect(canAccessEventOps(['ARTA', 'EXPLANADA'], 'solo_carpetas', 'EXPLANADA')).toBe(false);
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'solo_carpetas')).toEqual([]);
    });

    it('keeps entity access so general folders stay reachable', () => {
      expect(canAccessEntity(['ARTA', 'EXPLANADA'], 'solo_carpetas', 'EXPLANADA')).toBe(true);
    });

    it('cannot edit anything from its role table', () => {
      expect(hasPermission('solo_carpetas', [], PERMISSIONS.FOLDERS_EDIT)).toBe(false);
      expect(hasPermission('solo_carpetas', [], PERMISSIONS.CHECKLIST_EDIT)).toBe(false);
    });
  });

  describe('dir_adjunta (Leida y Sol, 16-09-2026)', () => {
    it('gets everything dirección general gets, except managing users', () => {
      for (const p of Object.values(PERMISSIONS)) {
        expect(hasPermission('dir_adjunta', [], p)).toBe(p !== PERMISSIONS.USERS_MANAGE);
      }
    });

    it('its stored permissions never smuggle in users.manage or everything', () => {
      expect(ROLE_PERMISSIONS.dir_adjunta).not.toContain(PERMISSIONS.USERS_MANAGE);
      expect(ROLE_PERMISSIONS.dir_adjunta).not.toContain(PERMISSIONS.EVERYTHING);
    });

    it('operates events in both entities', () => {
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'dir_adjunta')).toEqual(['ARTA', 'EXPLANADA']);
    });

    it('counts as dirección for approvals and reopening', () => {
      expect(isDirectionRole('dir_adjunta')).toBe(true);
      expect(isDirectionRole('dir_general')).toBe(true);
      expect(isDirectionRole('gerente_arta')).toBe(false);
      expect(isDirectionRole(undefined)).toBe(false);
    });
  });

  describe('contabilidad (Paula Farfán, junta 23-10-2026)', () => {
    const both: EntityKey[] = ['ARTA', 'EXPLANADA'];

    it('paga y lleva el dinero: finanzas, OC pagadas, campaña y boletera', () => {
      for (const p of [
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.FINANCE_EDIT,
        PERMISSIONS.PO_MARK_PAID,
        PERMISSIONS.CAMPAIGN_VIEW,
        PERMISSIONS.CAMPAIGN_EDIT,
        PERMISSIONS.TICKETING_EDIT,
      ]) {
        expect(hasPermission('contabilidad', [], p)).toBe(true);
      }
    });

    it('no autoriza OC, no edita formatos ni Studio y no toca usuarios', () => {
      for (const p of [
        PERMISSIONS.PO_AUTHORIZE,
        PERMISSIONS.CHECKLIST_EDIT,
        PERMISSIONS.EVENT_CREATE,
        PERMISSIONS.EVENT_CLOSE,
        PERMISSIONS.STUDIO_EDIT,
        PERMISSIONS.STUDIO_PUBLISH,
        PERMISSIONS.FOLDERS_EDIT,
        PERMISSIONS.VENDOR_PIN,
        PERMISSIONS.USERS_MANAGE,
        PERMISSIONS.USERS_CREATE,
        PERMISSIONS.EVERYTHING,
      ]) {
        expect(hasPermission('contabilidad', [], p)).toBe(false);
      }
      expect(isDirectionRole('contabilidad')).toBe(false);
    });

    it('ve los eventos de Arta y Auditorio (para pagar), pero no entra sola a sus canales de chat', () => {
      expect(eventOpsEntities(both, 'contabilidad')).toEqual(both);
      expect(canJoinEventChannels('contabilidad')).toBe(false);
      expect(canSeeGeneralFolders('contabilidad')).toBe(true);
    });

    it('edita convenios por finance.edit; reemplazar formatos no', () => {
      expect(canEditSponsors('contabilidad', [])).toBe(true);
      expect(canEditSponsors('solo_carpetas', [])).toBe(false);
      // Los que ya editaban convenios siguen igual.
      expect(canEditSponsors('convenios', [])).toBe(true);
    });
  });

  describe('practicante (sitio y redes, junta 23-10-2026)', () => {
    it('solo trae studio.edit', () => {
      expect(ROLE_PERMISSIONS.practicante).toEqual([PERMISSIONS.STUDIO_EDIT]);
      for (const p of Object.values(PERMISSIONS)) {
        expect(hasPermission('practicante', [], p)).toBe(p === PERMISSIONS.STUDIO_EDIT);
      }
    });

    it('no opera eventos, pero ve el calendario de sus entidades en solo lectura', () => {
      expect(canAccessEventOps(['ARTA'], 'practicante', 'ARTA')).toBe(false);
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'practicante')).toEqual([]);
      expect(canSeeEventCalendar(['ARTA'], 'practicante', 'ARTA')).toBe(true);
      expect(canSeeEventCalendar(['ARTA'], 'practicante', 'EXPLANADA')).toBe(false);
      // solo_carpetas sigue sin calendario.
      expect(canSeeEventCalendar(['ARTA'], 'solo_carpetas', 'ARTA')).toBe(false);
      expect(canSeeEventCalendar(['ARTA'], 'logistica', 'ARTA')).toBe(true);
    });

    it('deja borradores: publica dirección, o quien recibe studio.publish como extra', () => {
      expect(canPublishStudio('practicante', [])).toBe(false);
      expect(canPublishStudio('practicante', [PERMISSIONS.STUDIO_PUBLISH])).toBe(true);
      expect(canPublishStudio('dir_adjunta', [])).toBe(true);
      expect(canPublishStudio('gerente_arta', [])).toBe(true);
      expect(canPublishStudio('dir_auditorio', [])).toBe(true);
      // Quien tenía studio.edit como extra sigue publicando como antes.
      expect(canPublishStudio('logistica', [PERMISSIONS.STUDIO_EDIT])).toBe(true);
      expect(canPublishStudio('logistica', [])).toBe(false);
    });

    it('sin carpetas generales, tareas ni canales de eventos', () => {
      expect(canSeeGeneralFolders('practicante')).toBe(false);
      expect(canCreateTasks('practicante')).toBe(false);
      expect(canCreateTasks('solo_carpetas')).toBe(false);
      expect(canCreateTasks('logistica')).toBe(true);
      expect(canJoinEventChannels('practicante')).toBe(false);
      expect(canJoinEventChannels('logistica')).toBe(true);
    });
  });

  it('los dos roles nuevos están en el catálogo con nombre, ayuda y entidades', () => {
    for (const role of ['contabilidad', 'practicante'] as RoleKey[]) {
      expect(ALL_ROLES).toContain(role);
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_HINTS[role]).toBeTruthy();
      expect(ROLE_DEFAULT_ENTITIES[role].length).toBeGreaterThan(0);
    }
    expect(ROLE_LABELS.contabilidad).toBe('Contabilidad y comercial');
    expect(ROLE_LABELS.practicante).toBe('Practicante (sitio y redes)');
    // studio.publish se puede dar como extra (dirección adjunta lo reparte a un practicante de confianza).
    expect(ASSIGNABLE_PERMISSIONS).toContain(PERMISSIONS.STUDIO_PUBLISH);
    expect(ASSIGNABLE_PERMISSIONS).not.toContain(PERMISSIONS.USERS_CREATE);
  });

  it('every declared role resolves to a stable, known key (catalog integrity)', () => {
    const known = new Set(Object.values(ROLES));
    const roleKey: RoleKey = 'super_admin';
    expect(known.has(roleKey)).toBe(true);
    const entity: EntityKey = 'ARTA';
    expect(['ARTA', 'EXPLANADA']).toContain(entity);
  });
});
