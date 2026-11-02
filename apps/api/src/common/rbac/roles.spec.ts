import {
  hasPermission,
  canAccessEntity,
  canAccessEventOps,
  canCreateTasks,
  canEditSponsors,
  canJoinEventChannels,
  canPublishStudio,
  canSeeEventCalendar,
  canSeeFormat,
  canSeeGeneralFolders,
  canSeeModule,
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
      expect(hasPermission('super_admin', [], PERMISSIONS.PO_EDIT)).toBe(true);
    });

    it('grants dir_general every permission except making OC (cliente, 01-11-2026)', () => {
      for (const p of Object.values(PERMISSIONS)) {
        expect(hasPermission('dir_general', [], p)).toBe(p !== PERMISSIONS.PO_EDIT);
      }
    });

    it('dir_general only makes OC when it holds po.edit as an extra permission', () => {
      expect(hasPermission('dir_general', null, PERMISSIONS.PO_EDIT)).toBe(false);
      expect(hasPermission('dir_general', [PERMISSIONS.STUDIO_EDIT], PERMISSIONS.PO_EDIT)).toBe(false);
      expect(hasPermission('dir_general', [PERMISSIONS.PO_EDIT], PERMISSIONS.PO_EDIT)).toBe(true);
    });

    it('denies a permission not on the role and not in extra permissions', () => {
      // convenios has no PO_AUTHORIZE in its role table and none granted via extra
      expect(hasPermission('convenios', [], PERMISSIONS.PO_AUTHORIZE)).toBe(false);
    });

    it('grants a permission listed on the role table', () => {
      expect(hasPermission('gerente_arta', [], PERMISSIONS.CORRIDA_UPLOAD)).toBe(true);
      expect(hasPermission('compras', [], PERMISSIONS.PO_EDIT)).toBe(true);
      expect(hasPermission('contabilidad', [], PERMISSIONS.PO_MARK_PAID)).toBe(true);
      // Y lo que el rol ya no trae no se cuela: la gerencia dejó de autorizar OC.
      expect(hasPermission('gerente_arta', [], PERMISSIONS.PO_AUTHORIZE)).toBe(false);
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
    it('dir_auditorio ya no queda fuera de Arta: lo acotan canSeeModule y canSeeFormat', () => {
      const rodrigo = { roleKey: 'dir_auditorio', entities: ['EXPLANADA', 'ARTA'] };
      expect(ROLE_DEFAULT_ENTITIES.dir_auditorio).toEqual(['EXPLANADA', 'ARTA']);
      expect(canAccessEventOps(['EXPLANADA', 'ARTA'], 'dir_auditorio', 'ARTA')).toBe(true);
      expect(canAccessEventOps(['EXPLANADA', 'ARTA'], 'dir_auditorio', 'EXPLANADA')).toBe(true);
      // Entrar no le abre Arta: solo llega a sus tres formatos.
      expect(canSeeModule(rodrigo, 'ARTA', 'formats')).toBe(true);
      expect(canSeeModule(rodrigo, 'ARTA', 'po')).toBe(false);
      expect(canSeeModule(rodrigo, 'ARTA', 'tasks')).toBe(false);
      expect(canSeeFormat(rodrigo, 'ARTA', 'TRANSPORTACION')).toBe(true);
      expect(canSeeFormat(rodrigo, 'ARTA', 'EVENTO_GENERAL')).toBe(false);
    });

    it('dir_auditorio sin Arta en su lista sigue sin operar Arta', () => {
      expect(canAccessEventOps(['EXPLANADA'], 'dir_auditorio', 'ARTA')).toBe(false);
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
    it('dir_auditorio opera las entidades que tiene, sin recorte por rol', () => {
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'dir_auditorio')).toEqual(['ARTA', 'EXPLANADA']);
      expect(eventOpsEntities(['EXPLANADA'], 'dir_auditorio')).toEqual(['EXPLANADA']);
    });

    it('filters out every entity for the roles that do not operate events', () => {
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'solo_carpetas')).toEqual([]);
      expect(eventOpsEntities(['ARTA', 'EXPLANADA'], 'practicante')).toEqual([]);
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

  describe('dir_adjunta y gerente_arta (Leida y Sol, 01-11-2026)', () => {
    /** Lo único que les falta para tener todo Arta: modificar la corrida, las OC, Finanzas y usuarios. */
    const NOT_THEIRS: string[] = [
      PERMISSIONS.CORRIDA_EDIT,
      PERMISSIONS.FINANCE_EDIT,
      PERMISSIONS.FINANZAS_VIEW,
      PERMISSIONS.PO_EDIT,
      PERMISSIONS.PO_AUTHORIZE,
      PERMISSIONS.PO_MARK_PAID,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.PRACTICANTES_MANAGE,
      PERMISSIONS.EVERYTHING,
    ];

    it.each(['dir_adjunta', 'gerente_arta'] as RoleKey[])('%s tiene todo lo demás, permiso por permiso', (role) => {
      for (const p of Object.values(PERMISSIONS)) {
        expect(hasPermission(role, [], p)).toBe(!NOT_THEIRS.includes(p));
      }
    });

    it('la corrida la ven y la suben, no la modifican; las OC las ven, no las tocan', () => {
      for (const role of ['dir_adjunta', 'gerente_arta'] as RoleKey[]) {
        expect(hasPermission(role, [], PERMISSIONS.CORRIDA_VIEW)).toBe(true);
        expect(hasPermission(role, [], PERMISSIONS.CORRIDA_UPLOAD)).toBe(true);
        expect(hasPermission(role, [], PERMISSIONS.CORRIDA_EDIT)).toBe(false);
        expect(hasPermission(role, [], PERMISSIONS.PO_VIEW)).toBe(true);
        expect(hasPermission(role, [], PERMISSIONS.PO_EDIT)).toBe(false);
        expect(hasPermission(role, [], PERMISSIONS.PO_AUTHORIZE)).toBe(false);
        expect(hasPermission(role, [], PERMISSIONS.PO_MARK_PAID)).toBe(false);
      }
    });

    it('its stored permissions never smuggle in users.manage or everything', () => {
      expect(ROLE_PERMISSIONS.dir_adjunta).not.toContain(PERMISSIONS.USERS_MANAGE);
      expect(ROLE_PERMISSIONS.dir_adjunta).not.toContain(PERMISSIONS.EVERYTHING);
      expect(ROLE_PERMISSIONS.gerente_arta).not.toContain(PERMISSIONS.USERS_MANAGE);
      expect(ROLE_PERMISSIONS.gerente_arta).not.toContain(PERMISSIONS.EVERYTHING);
    });

    it('operan los eventos de Arta y, sin Auditorio asignado, no llegan al Auditorio', () => {
      expect(eventOpsEntities(['ARTA'], 'dir_adjunta')).toEqual(['ARTA']);
      expect(canAccessEventOps(['ARTA'], 'dir_adjunta', 'EXPLANADA')).toBe(false);
      expect(ROLE_DEFAULT_ENTITIES.gerente_arta).toEqual(['ARTA']);
    });

    it('son solo de Arta: quien da de alta a una adjunta sin elegir negocio no le abre el Auditorio', () => {
      expect(ROLE_DEFAULT_ENTITIES.dir_adjunta).toEqual(['ARTA']);
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

    it('paga y lleva el dinero: Finanzas, ve OC y las paga, campaña, convenios y boletera', () => {
      for (const p of [
        PERMISSIONS.FINANZAS_VIEW,
        PERMISSIONS.FINANCE_VIEW,
        PERMISSIONS.PO_VIEW,
        PERMISSIONS.PO_MARK_PAID,
        PERMISSIONS.CAMPAIGN_VIEW,
        PERMISSIONS.CAMPAIGN_EDIT,
        PERMISSIONS.CONVENIOS_VIEW,
        PERMISSIONS.CONVENIOS_EDIT,
        PERMISSIONS.TICKETING_VIEW,
        PERMISSIONS.TICKETING_EDIT,
      ]) {
        expect(hasPermission('contabilidad', [], p)).toBe(true);
      }
    });

    it('la corrida no es suya: ni la ve, ni la sube, ni la modifica', () => {
      for (const p of [
        PERMISSIONS.CORRIDA_VIEW,
        PERMISSIONS.CORRIDA_UPLOAD,
        PERMISSIONS.CORRIDA_EDIT,
        PERMISSIONS.FINANCE_EDIT,
      ]) {
        expect(hasPermission('contabilidad', [], p)).toBe(false);
      }
    });

    it('no autoriza ni hace OC, no edita formatos ni Studio y no toca usuarios', () => {
      for (const p of [
        PERMISSIONS.PO_AUTHORIZE,
        PERMISSIONS.PO_EDIT,
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

    it('edita convenios por convenios.edit; verlos no basta', () => {
      expect(canEditSponsors('contabilidad', [])).toBe(true);
      expect(canEditSponsors('solo_carpetas', [])).toBe(false);
      // Los que ya editaban convenios siguen igual.
      expect(canEditSponsors('convenios', [])).toBe(true);
      // Juan Pablo y Williams los ven, no los editan.
      expect(hasPermission('compras', [], PERMISSIONS.CONVENIOS_VIEW)).toBe(true);
      expect(canEditSponsors('compras', [])).toBe(false);
      expect(canEditSponsors('produccion', [])).toBe(false);
      // Tener finance.edit como extra ya no abre convenios.
      expect(canEditSponsors('logistica', [PERMISSIONS.FINANCE_EDIT])).toBe(false);
    });
  });

  describe('practicante (sitio y testigos, 01-11-2026)', () => {
    it('solo trae studio.edit y testigos.edit', () => {
      const own: string[] = [PERMISSIONS.STUDIO_EDIT, PERMISSIONS.TESTIGOS_EDIT];
      expect(ROLE_PERMISSIONS.practicante).toEqual(own);
      for (const p of Object.values(PERMISSIONS)) {
        expect(hasPermission('practicante', [], p)).toBe(own.includes(p));
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
      // Rodrigo se quedó sin Studio (01-11-2026): el sitio es de Arta.
      expect(canPublishStudio('dir_auditorio', [])).toBe(false);
      expect(canPublishStudio('dir_general', [])).toBe(true);
      // Quien tenía studio.edit como extra sigue publicando como antes.
      expect(canPublishStudio('logistica', [PERMISSIONS.STUDIO_EDIT])).toBe(true);
      expect(canPublishStudio('logistica', [])).toBe(false);
    });

    it('sin carpetas generales, tareas ni canales de eventos', () => {
      expect(canSeeGeneralFolders('practicante')).toBe(false);
      expect(canCreateTasks('practicante')).toBe(false);
      expect(canCreateTasks('solo_carpetas')).toBe(false);
      expect(canCreateTasks('contenido')).toBe(false);
      expect(canCreateTasks('catering')).toBe(false);
      expect(canCreateTasks('logistica')).toBe(true);
      expect(canCreateTasks('compras')).toBe(true);
      expect(canJoinEventChannels('practicante')).toBe(false);
      expect(canJoinEventChannels('logistica')).toBe(true);
    });
  });

  it('los roles nuevos están en el catálogo con nombre, ayuda y entidades', () => {
    for (const role of ['contabilidad', 'practicante', 'compras', 'produccion', 'contenido', 'catering'] as RoleKey[]) {
      expect(ALL_ROLES).toContain(role);
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_HINTS[role]).toBeTruthy();
      expect(ROLE_DEFAULT_ENTITIES[role].length).toBeGreaterThan(0);
    }
    expect(ROLE_LABELS.contabilidad).toBe('Contabilidad y comercial');
    expect(ROLE_LABELS.practicante).toBe('Practicante (sitio y testigos)');
    expect(ROLE_LABELS.compras).toBe('Compras');
    expect(ROLE_LABELS.produccion).toBe('Producción');
    expect(ROLE_LABELS.contenido).toBe('Contenido e imágenes');
    expect(ROLE_LABELS.catering).toBe('Catering');
    // studio.publish se puede dar como extra (dirección general lo reparte a un practicante de confianza).
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
