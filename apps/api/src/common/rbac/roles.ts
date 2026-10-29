/**
 * ARTA · Catálogo de roles (fuente única API + Web)
 * Un usuario = 1 rol + 1..n entidades (ARTA / EXPLANADA)
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DIR_GENERAL: 'dir_general',
  DIR_ADJUNTA: 'dir_adjunta',
  GERENTE_ARTA: 'gerente_arta',
  DIR_AUDITORIO: 'dir_auditorio',
  LOGISTICA: 'logistica',
  CONVENIOS: 'convenios',
  ENLACE_GOBIERNO: 'enlace_gobierno',
  SOLO_CARPETAS: 'solo_carpetas',
  /** Junta 23-10-2026 · Paula Farfán: temas contables y comerciales de Arta y Auditorio. */
  CONTABILIDAD: 'contabilidad',
  /** Junta 23-10-2026 · practicantes de Montse: sitio público (Studio) y calendario, nada más. */
  PRACTICANTE: 'practicante',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];
export const ALL_ROLES = Object.values(ROLES);

export type EntityKey = 'ARTA' | 'EXPLANADA';

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Administración de plataforma',
  dir_general: 'Dirección general',
  dir_adjunta: 'Dirección adjunta',
  gerente_arta: 'Gerencia Arta',
  dir_auditorio: 'Dirección Auditorio',
  logistica: 'Logística y producción',
  convenios: 'Convenios y patrocinios',
  enlace_gobierno: 'Enlace gobierno y pagos',
  solo_carpetas: 'Solo carpetas',
  contabilidad: 'Contabilidad y comercial',
  practicante: 'Practicante (sitio y redes)',
};

/** Nombre del rol para pantalla: una clave desconocida se lee como texto, nunca como `cosa_cosa`. */
export function roleLabel(roleKey: string | null | undefined): string {
  if (!roleKey) return '—';
  const known = ROLE_LABELS[roleKey as RoleKey];
  if (known) return known;
  const plain = roleKey.replace(/[._-]+/g, ' ').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Texto corto para que dirección elija rol sin adivinar. */
export const ROLE_HINTS: Record<RoleKey, string> = {
  super_admin: 'Plataforma completa (solo Nexara).',
  dir_general: 'Arturo / José Luis — todo el panel, Arta y Auditorio, y gestión de usuarios.',
  dir_adjunta:
    'Opera todo en sus entidades (Arta, Auditorio o ambas). Da de alta gente nueva, pero no edita ni da de baja a usuarios existentes.',
  gerente_arta: 'Todo Arta: operación, finanzas y campaña.',
  dir_auditorio: 'Operación del Auditorio / Explanada.',
  logistica: 'Producción, checklists, campaña, boletera.',
  convenios: 'Patrocinios y convenios; ve tareas de todos.',
  enlace_gobierno: 'Pagos gobierno, marcar OC pagadas.',
  solo_carpetas: 'Ve las carpetas generales de sus entidades; no edita.',
  contabilidad:
    'Paga OC y anticipos (sube comprobantes y facturas), corrida, campañas, convenios y boletera. No autoriza OC ni toca usuarios ni formatos.',
  practicante:
    'Edita el sitio público en Studio como borrador (dirección publica) y ve el calendario de shows. Nada más.',
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
  'studio.publish': 'Publicar en el sitio (Studio)',
  'ticketing.edit': 'Editar boletera',
  'folders.edit': 'Editar carpetas',
  'vendor.pin': 'PINs de proveedor',
  'users.manage': 'Gestionar usuarios',
  'users.create': 'Dar de alta usuarios',
  everything: 'Acceso total',
};

export const ROLE_DEFAULT_ENTITIES: Record<RoleKey, EntityKey[]> = {
  super_admin: ['ARTA', 'EXPLANADA'],
  dir_general: ['ARTA', 'EXPLANADA'],
  dir_adjunta: ['ARTA', 'EXPLANADA'],
  gerente_arta: ['ARTA'],
  dir_auditorio: ['EXPLANADA', 'ARTA'],
  logistica: ['ARTA', 'EXPLANADA'],
  convenios: ['ARTA', 'EXPLANADA'],
  enlace_gobierno: ['ARTA', 'EXPLANADA'],
  solo_carpetas: ['ARTA', 'EXPLANADA'],
  contabilidad: ['ARTA', 'EXPLANADA'],
  // El sitio público es solo de Arta (Studio).
  practicante: ['ARTA'],
};

export const PERMISSIONS = {
  /** Editar, cambiar de rol, dar de baja o reactivar a usuarios existentes (solo dirección general). */
  USERS_MANAGE: 'users.manage',
  /** Dar de alta gente nueva sin tocar a nadie que ya exista (dirección adjunta, 11-10-2026). */
  USERS_CREATE: 'users.create',
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
  /**
   * Publicar en el sitio (noticias, slides activos, secciones). Quien edita Studio publica, salvo el
   * practicante: él deja borradores y los publica dirección (`canPublishStudio`).
   */
  STUDIO_PUBLISH: 'studio.publish',
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
  PERMISSIONS.STUDIO_PUBLISH,
  PERMISSIONS.TICKETING_EDIT,
  PERMISSIONS.FOLDERS_EDIT,
  PERMISSIONS.VENDOR_PIN,
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [PERMISSIONS.EVERYTHING],
  dir_general: [
    PERMISSIONS.EVERYTHING,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.FINANCE_EDIT,
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.PO_AUTHORIZE,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.EVENT_CLOSE,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.STUDIO_EDIT,
    PERMISSIONS.STUDIO_PUBLISH,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.VENDOR_PIN,
  ],
  /**
   * 16-09-2026 · Leida y Sol: «los mismos permisos de Arturo y José Luis
   * excepto gestión de usuarios». La tabla no lleva `EVERYTHING` porque eso
   * incluye `users.manage`; `hasPermission` le concede todo lo demás.
   * 11-10-2026 · sí da de alta gente nueva (`users.create`), sin tocar a los que ya existen.
   */
  dir_adjunta: [...ASSIGNABLE_PERMISSIONS, PERMISSIONS.USERS_CREATE],
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
    PERMISSIONS.STUDIO_PUBLISH,
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
    PERMISSIONS.STUDIO_PUBLISH,
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
  /**
   * Junta 23-10-2026 · Paula Farfán: «Auditorio y Arta en temas contables, accesos muy puntuales a
   * temas comerciales y contables». Paga (OC y anticipos, con comprobante), lleva la corrida, edita
   * campañas, convenios y boletera. No autoriza OC ni anticipos, no edita formatos ni toca usuarios;
   * tampoco entra a los canales de chat de los eventos (`canJoinEventChannels`).
   */
  contabilidad: [
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_EDIT,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.TICKETING_EDIT,
  ],
  /**
   * Junta 23-10-2026 · «Montse redes sociales: acceso para practicantes». Edita el sitio en Studio
   * como borrador (publica dirección: `canPublishStudio`) y ve el calendario de shows en solo
   * lectura (`canSeeEventCalendar`). Sin eventos, finanzas, OC, formatos, carpetas ni tareas.
   */
  practicante: [PERMISSIONS.STUDIO_EDIT],
};

export function hasPermission(
  roleKey: RoleKey,
  extra: string[],
  needed: Permission,
): boolean {
  if (roleKey === ROLES.SUPER_ADMIN || roleKey === ROLES.DIR_GENERAL) return true;
  if (roleKey === ROLES.DIR_ADJUNTA && needed !== PERMISSIONS.USERS_MANAGE) return true;
  const fromRole = ROLE_PERMISSIONS[roleKey] ?? [];
  if (fromRole.includes(PERMISSIONS.EVERYTHING)) return true;
  if (fromRole.includes(needed)) return true;
  return extra.includes(needed);
}

/**
 * Dirección: aprueba, sella, reabre y no la encierran los días de cobro.
 * `dir_adjunta` entra aquí; lo único que no tiene es `users.manage`.
 */
export function isDirectionRole(roleKey: string | null | undefined): boolean {
  return (
    roleKey === ROLES.SUPER_ADMIN || roleKey === ROLES.DIR_GENERAL || roleKey === ROLES.DIR_ADJUNTA
  );
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
  // El practicante no opera eventos: solo consulta el calendario (`canSeeEventCalendar`).
  if (roleKey === ROLES.PRACTICANTE) return false;
  if (roleKey === ROLES.DIR_AUDITORIO && entity === 'ARTA') return false;
  return true;
}

export function eventOpsEntities(userEntities: EntityKey[], roleKey: RoleKey): EntityKey[] {
  return userEntities.filter((e) => canAccessEventOps(userEntities, roleKey, e));
}

/**
 * Calendario de shows. Quien opera eventos lo ve completo; el practicante lo consulta en solo
 * lectura para preparar sus publicaciones (sin abrir el evento ni escribir notas).
 */
export function canSeeEventCalendar(
  userEntities: EntityKey[],
  roleKey: RoleKey,
  entity: EntityKey,
): boolean {
  if (canAccessEventOps(userEntities, roleKey, entity)) return true;
  return roleKey === ROLES.PRACTICANTE && canAccessEntity(userEntities, roleKey, entity);
}

/**
 * Publicar en el sitio público (noticia publicada, slide activo, sección publicada). Quien edita
 * Studio publica como siempre; el practicante solo deja borradores, salvo que dirección le dé
 * `studio.publish` como permiso extra.
 */
export function canPublishStudio(roleKey: RoleKey, extra: string[]): boolean {
  if (hasPermission(roleKey, extra, PERMISSIONS.STUDIO_PUBLISH)) return true;
  return roleKey !== ROLES.PRACTICANTE && hasPermission(roleKey, extra, PERMISSIONS.STUDIO_EDIT);
}

/**
 * Patrocinios (convenios) de un evento: quien edita formatos, como siempre, o quien lleva el
 * dinero (`finance.edit`: contabilidad registra montos y condiciones de pago).
 */
export function canEditSponsors(roleKey: RoleKey, extra: string[]): boolean {
  return (
    hasPermission(roleKey, extra, PERMISSIONS.CHECKLIST_EDIT) ||
    hasPermission(roleKey, extra, PERMISSIONS.FINANCE_EDIT)
  );
}

/**
 * Canales de chat de un evento (la conversación de producción). Contabilidad y practicantes no
 * entran por su cuenta; si alguien los agrega al canal, entonces sí.
 */
export function canJoinEventChannels(roleKey: string | null | undefined): boolean {
  return roleKey !== ROLES.CONTABILIDAD && roleKey !== ROLES.PRACTICANTE;
}

/** Carpetas generales: todos los que trabajan en la entidad menos el practicante (solo sitio y calendario). */
export function canSeeGeneralFolders(roleKey: string | null | undefined): boolean {
  return roleKey !== ROLES.PRACTICANTE;
}

/** Crear y asignar tareas: no quien solo consulta carpetas ni el practicante. */
export function canCreateTasks(roleKey: string | null | undefined): boolean {
  return roleKey !== ROLES.SOLO_CARPETAS && roleKey !== ROLES.PRACTICANTE;
}
