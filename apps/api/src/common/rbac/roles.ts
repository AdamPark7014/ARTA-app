/**
 * ARTA · Catálogo de roles
 * Un usuario = 1 rol + 1..n entidades (ARTA / EXPLANADA)
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DIR_GENERAL: 'dir_general', // Arturo, José Luis (Chacho) — todo
  GERENTE_ARTA: 'gerente_arta', // Melissa — todo Arta + campaña + corrida
  DIR_AUDITORIO: 'dir_auditorio', // Rodrigo — todo Explanada + generales Arta
  LOGISTICA: 'logistica', // Williams — carpetas generales ambos
  CONVENIOS: 'convenios', // Leida
  ENLACE_GOBIERNO: 'enlace_gobierno', // Juan Pablo
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];
export const ALL_ROLES = Object.values(ROLES);

export type EntityKey = 'ARTA' | 'EXPLANADA';

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  dir_general: 'Director General',
  gerente_arta: 'Gerente General Arta',
  dir_auditorio: 'Director Auditorio',
  logistica: 'Logística y Producción',
  convenios: 'Convenios y Patrocinios',
  enlace_gobierno: 'Enlace Gobierno y Pagos',
};

/** Entidades por defecto según rol */
export const ROLE_DEFAULT_ENTITIES: Record<RoleKey, EntityKey[]> = {
  super_admin: ['ARTA', 'EXPLANADA'],
  dir_general: ['ARTA', 'EXPLANADA'],
  gerente_arta: ['ARTA'],
  dir_auditorio: ['EXPLANADA', 'ARTA'], // Explanada full + carpetas generales Arta
  logistica: ['ARTA', 'EXPLANADA'],
  convenios: ['ARTA', 'EXPLANADA'],
  enlace_gobierno: ['ARTA', 'EXPLANADA'],
};

/**
 * Permisos granulares.
 * Algunos se assignan aparte del rol (p.ej. campaña = Melissa + Will).
 */
export const PERMISSIONS = {
  USERS_MANAGE: 'users.manage', // solo Arturo / Chacho
  FINANCE_EDIT: 'finance.edit', // Melissa, Chacho, Arturo
  FINANCE_VIEW: 'finance.view',
  CAMPAIGN_EDIT: 'campaign.edit', // Melissa + Will
  CAMPAIGN_VIEW: 'campaign.view',
  PO_AUTHORIZE: 'po.authorize', // Melissa (Arta) / Rodrigo (Explanada)
  PO_MARK_PAID: 'po.mark_paid',
  EVENT_CREATE: 'event.create',
  EVENT_CLOSE: 'event.close',
  CHECKLIST_EDIT: 'checklist.edit',
  STUDIO_EDIT: 'studio.edit',
  TICKETING_EDIT: 'ticketing.edit',
  FOLDERS_EDIT: 'folders.edit',
  VENDOR_PIN: 'vendor.pin',
  EVERYTHING: 'everything',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Permisos que dirección puede asignar extra a un usuario (además del rol). */
export const ASSIGNABLE_PERMISSIONS: Permission[] = [
  PERMISSIONS.FINANCE_VIEW,
  PERMISSIONS.FINANCE_EDIT,
  PERMISSIONS.CAMPAIGN_VIEW,
  PERMISSIONS.CAMPAIGN_EDIT,
  PERMISSIONS.PO_AUTHORIZE,
  PERMISSIONS.PO_MARK_PAID,
  PERMISSIONS.EVENT_CREATE,
  PERMISSIONS.EVENT_CLOSE,
  PERMISSIONS.CHECKLIST_EDIT,
  PERMISSIONS.STUDIO_EDIT,
  PERMISSIONS.TICKETING_EDIT,
  PERMISSIONS.FOLDERS_EDIT,
  PERMISSIONS.VENDOR_PIN,
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [PERMISSIONS.EVERYTHING],
  dir_general: [
    PERMISSIONS.EVERYTHING,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.FINANCE_EDIT,
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.PO_AUTHORIZE,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.EVENT_CLOSE,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.STUDIO_EDIT,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.VENDOR_PIN,
  ],
  gerente_arta: [
    PERMISSIONS.FINANCE_EDIT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.PO_AUTHORIZE,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.EVENT_CLOSE,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.STUDIO_EDIT,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.VENDOR_PIN,
  ],
  dir_auditorio: [
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.PO_AUTHORIZE,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.EVENT_CLOSE,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.STUDIO_EDIT,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.VENDOR_PIN,
  ],
  logistica: [
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FOLDERS_EDIT,
  ],
  convenios: [
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.FOLDERS_EDIT,
  ],
  enlace_gobierno: [
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.FOLDERS_EDIT,
  ],
};

export function hasPermission(
  roleKey: RoleKey,
  extra: string[],
  needed: Permission,
): boolean {
  if (roleKey === ROLES.SUPER_ADMIN || roleKey === ROLES.DIR_GENERAL) return true;
  const fromRole = ROLE_PERMISSIONS[roleKey] ?? [];
  if (fromRole.includes(PERMISSIONS.EVERYTHING)) return true;
  if (fromRole.includes(needed)) return true;
  return extra.includes(needed);
}

export function canAccessEntity(
  userEntities: EntityKey[],
  roleKey: RoleKey,
  entity: EntityKey,
): boolean {
  if (roleKey === ROLES.SUPER_ADMIN || roleKey === ROLES.DIR_GENERAL) return true;
  return userEntities.includes(entity);
}

/**
 * Operación de eventos (checklists, OC, corrida, etc.).
 * dir_auditorio: full en EXPLANADA; en ARTA solo carpetas generales (no eventos).
 */
export function canAccessEventOps(
  userEntities: EntityKey[],
  roleKey: RoleKey,
  entity: EntityKey,
): boolean {
  if (!canAccessEntity(userEntities, roleKey, entity)) return false;
  if (roleKey === ROLES.DIR_AUDITORIO && entity === 'ARTA') return false;
  return true;
}

/** Entidades donde el rol puede operar eventos (no solo carpetas) */
export function eventOpsEntities(userEntities: EntityKey[], roleKey: RoleKey): EntityKey[] {
  return userEntities.filter((e) => canAccessEventOps(userEntities, roleKey, e));
}
