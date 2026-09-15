/**
 * ARTA · Catálogo de roles (fuente única API + Web)
 * Un usuario = 1 rol + 1..n entidades (ARTA / EXPLANADA)
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DIR_GENERAL: 'dir_general',
  GERENTE_ARTA: 'gerente_arta',
  DIR_AUDITORIO: 'dir_auditorio',
  LOGISTICA: 'logistica',
  CONVENIOS: 'convenios',
  ENLACE_GOBIERNO: 'enlace_gobierno',
  SOLO_CARPETAS: 'solo_carpetas',
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
  solo_carpetas: 'Solo carpetas generales',
};

/** Texto corto para que dirección elija rol sin adivinar. */
export const ROLE_HINTS: Record<RoleKey, string> = {
  super_admin: 'Plataforma completa (solo Nexara).',
  dir_general: 'Arturo / José Luis — todo el panel, altas de equipo.',
  gerente_arta: 'Todo Arta: operación, finanzas y campaña (Karla, Leida, Sol).',
  dir_auditorio: 'Operación del Auditorio / Explanada.',
  logistica: 'Producción, checklists, campaña, boletera.',
  convenios: 'Patrocinios y convenios; ve tareas de todos.',
  enlace_gobierno: 'Pagos gobierno, marcar OC pagadas.',
  solo_carpetas: 'Williams / Juan Pablo — ven carpetas generales de Arta y Auditorio; no editan.',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'finance.view': 'Ver finanzas',
  'finance.edit': 'Editar finanzas / corrida',
  'campaign.view': 'Ver campaña',
  'campaign.edit': 'Editar campaña',
  'po.authorize': 'Autorizar órdenes de compra',
  'po.mark_paid': 'Marcar OC como pagada',
  'event.create': 'Crear eventos',
  'event.close': 'Cerrar eventos',
  'checklist.edit': 'Editar checklists',
  'studio.edit': 'Editar Studio / sitio',
  'ticketing.edit': 'Editar boletera',
  'folders.edit': 'Editar carpetas',
  'vendor.pin': 'PINs de proveedor',
  'users.manage': 'Gestionar usuarios',
  everything: 'Acceso total',
};

export const ROLE_DEFAULT_ENTITIES: Record<RoleKey, EntityKey[]> = {
  super_admin: ['ARTA', 'EXPLANADA'],
  dir_general: ['ARTA', 'EXPLANADA'],
  gerente_arta: ['ARTA'],
  dir_auditorio: ['EXPLANADA', 'ARTA'],
  logistica: ['ARTA', 'EXPLANADA'],
  convenios: ['ARTA', 'EXPLANADA'],
  enlace_gobierno: ['ARTA', 'EXPLANADA'],
  solo_carpetas: ['ARTA', 'EXPLANADA'],
};

export const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  FINANCE_EDIT: 'finance.edit',
  FINANCE_VIEW: 'finance.view',
  CAMPAIGN_EDIT: 'campaign.edit',
  CAMPAIGN_VIEW: 'campaign.view',
  PO_AUTHORIZE: 'po.authorize',
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
  /**
   * Junta 11-09-2026 · «Definir quién puede editar»: Williams y Juan Pablo
   * entran únicamente a las carpetas generales de Arta y Auditorio, a ver.
   */
  solo_carpetas: [],
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

export function canAccessEventOps(
  userEntities: EntityKey[],
  roleKey: RoleKey,
  entity: EntityKey,
): boolean {
  if (!canAccessEntity(userEntities, roleKey, entity)) return false;
  if (roleKey === ROLES.SOLO_CARPETAS) return false;
  if (roleKey === ROLES.DIR_AUDITORIO && entity === 'ARTA') return false;
  return true;
}

export function eventOpsEntities(userEntities: EntityKey[], roleKey: RoleKey): EntityKey[] {
  return userEntities.filter((e) => canAccessEventOps(userEntities, roleKey, e));
}
