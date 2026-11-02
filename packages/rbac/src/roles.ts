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
  /** 01-11-2026 · Juan Pablo: el único que hace órdenes de compra; ve todo menos la corrida. */
  COMPRAS: 'compras',
  /** 01-11-2026 · Williams: edita todo el Auditorio; en Arta, campaña, producción, transporte y hospedaje. */
  PRODUCCION: 'produccion',
  /** 01-11-2026 · Monse y Kika: suben imágenes a los formatos generales y ven la campaña. */
  CONTENIDO: 'contenido',
  /** 01-11-2026 · Iliana: ve la información general y edita solo catering. */
  CATERING: 'catering',
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
  practicante: 'Practicante (sitio y testigos)',
  compras: 'Compras',
  produccion: 'Producción',
  contenido: 'Contenido e imágenes',
  catering: 'Catering',
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
  dir_general: 'Chacho y Arturo: todo el sistema, autorizan OC, aprueban y son los únicos que manejan usuarios.',
  dir_adjunta:
    'Leida y Sol: ven todo Arta, generan y aprueban formatos salvo Evento General, Artes y Pendones. La corrida la suben, no la modifican.',
  gerente_arta: 'Igual que Leida y Sol: todo Arta sin modificar la corrida.',
  dir_auditorio: 'Rodrigo: todo el Auditorio menos OC; en Arta, formatos de transporte, hospedaje y catering.',
  logistica: 'Producción, checklists, campaña, boletera.',
  convenios: 'Patrocinios y convenios; ve tareas de todos.',
  enlace_gobierno: 'Formatos y marcar OC pagadas.',
  solo_carpetas: 'Ve las carpetas generales de sus entidades; no edita.',
  contabilidad:
    'Paula: ve Arta y Auditorio sin la corrida, entra a Finanzas, paga OC y anticipos y sube comprobantes. Le llega cada transferencia.',
  practicante: 'Por temporada: edita el sitio en Studio y sube testigos de publicidad. Nada más.',
  compras: 'Juan Pablo: ve todo sin la corrida y sin editar; es el único que hace OC y lleva barra y merch.',
  produccion: 'Williams: en Auditorio ve y edita todo; en Arta ve todo y edita campaña, producción, transporte y hospedaje.',
  contenido: 'Monse y Kika: suben imágenes a los formatos generales y ven la campaña, sin editar.',
  catering: 'Iliana: ve la información general y edita solo catering.',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'finance.view': 'Ver finanzas',
  'finance.edit': 'Editar finanzas / corrida',
  'campaign.view': 'Ver campaña',
  'campaign.edit': 'Editar campaña',
  'po.authorize': 'Autorizar órdenes de compra',
  'po.mark_paid': 'Marcar OC como pagada',
  'po.view': 'Ver órdenes de compra',
  'po.edit': 'Hacer y editar órdenes de compra',
  'corrida.view': 'Ver la corrida financiera',
  'corrida.upload': 'Subir la corrida financiera',
  'corrida.edit': 'Modificar la corrida financiera',
  'finanzas.view': 'Entrar a Finanzas',
  'convenios.view': 'Ver convenios',
  'convenios.edit': 'Editar convenios',
  'ticketing.view': 'Ver boletera',
  'testigos.edit': 'Subir testigos de publicidad',
  'advance.request': 'Solicitar anticipos',
  'practicantes.manage': 'Generar perfiles de practicante',
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
  // Leida y Sol ven solo Arta (01-11-2026).
  dir_adjunta: ['ARTA'],
  gerente_arta: ['ARTA'],
  dir_auditorio: ['EXPLANADA', 'ARTA'],
  logistica: ['ARTA', 'EXPLANADA'],
  convenios: ['ARTA', 'EXPLANADA'],
  enlace_gobierno: ['ARTA', 'EXPLANADA'],
  solo_carpetas: ['ARTA', 'EXPLANADA'],
  contabilidad: ['ARTA', 'EXPLANADA'],
  // El sitio público es solo de Arta (Studio).
  practicante: ['ARTA', 'EXPLANADA'],
  compras: ['ARTA', 'EXPLANADA'],
  produccion: ['ARTA', 'EXPLANADA'],
  contenido: ['ARTA', 'EXPLANADA'],
  catering: ['ARTA', 'EXPLANADA'],
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
  /** Ver las OC. Hacerlas y editarlas es `po.edit`: solo compras (Juan Pablo, 01-11-2026). */
  PO_VIEW: 'po.view',
  PO_EDIT: 'po.edit',
  /** La corrida solo la ven Chacho, Arturo, Leida y Sol. Leida y Sol suben; solo dirección modifica. */
  CORRIDA_VIEW: 'corrida.view',
  CORRIDA_UPLOAD: 'corrida.upload',
  CORRIDA_EDIT: 'corrida.edit',
  /** Módulo Finanzas: Paula, Chacho y Arturo. */
  FINANZAS_VIEW: 'finanzas.view',
  CONVENIOS_VIEW: 'convenios.view',
  CONVENIOS_EDIT: 'convenios.edit',
  TICKETING_VIEW: 'ticketing.view',
  TESTIGOS_EDIT: 'testigos.edit',
  ADVANCE_REQUEST: 'advance.request',
  PRACTICANTES_MANAGE: 'practicantes.manage',
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
  PERMISSIONS.PO_VIEW,
  PERMISSIONS.PO_EDIT,
  PERMISSIONS.CORRIDA_VIEW,
  PERMISSIONS.CORRIDA_UPLOAD,
  PERMISSIONS.CORRIDA_EDIT,
  PERMISSIONS.FINANZAS_VIEW,
  PERMISSIONS.CONVENIOS_VIEW,
  PERMISSIONS.CONVENIOS_EDIT,
  PERMISSIONS.TICKETING_VIEW,
  PERMISSIONS.TESTIGOS_EDIT,
  PERMISSIONS.ADVANCE_REQUEST,
  PERMISSIONS.PRACTICANTES_MANAGE,
];

/** Lo que tiene Leida y Sol (`dir_adjunta`) y la gerencia de Arta: todo Arta, sin modificar corrida ni tocar OC. */
const ARTA_MANAGEMENT: Permission[] = [
  PERMISSIONS.FINANCE_VIEW,
  PERMISSIONS.CORRIDA_VIEW,
  PERMISSIONS.CORRIDA_UPLOAD,
  PERMISSIONS.PO_VIEW,
  PERMISSIONS.CAMPAIGN_VIEW,
  PERMISSIONS.CAMPAIGN_EDIT,
  PERMISSIONS.CONVENIOS_VIEW,
  PERMISSIONS.CONVENIOS_EDIT,
  PERMISSIONS.TICKETING_VIEW,
  PERMISSIONS.TICKETING_EDIT,
  PERMISSIONS.EVENT_CREATE,
  PERMISSIONS.EVENT_CLOSE,
  PERMISSIONS.CHECKLIST_EDIT,
  PERMISSIONS.STUDIO_EDIT,
  PERMISSIONS.STUDIO_PUBLISH,
  PERMISSIONS.FOLDERS_EDIT,
  PERMISSIONS.VENDOR_PIN,
  PERMISSIONS.TESTIGOS_EDIT,
  PERMISSIONS.ADVANCE_REQUEST,
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [PERMISSIONS.EVERYTHING],
  /** Chacho y Arturo. Todo, menos hacer OC: eso es de Juan Pablo (`hasPermission`). */
  dir_general: [PERMISSIONS.EVERYTHING, ...ASSIGNABLE_PERMISSIONS, PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_CREATE],
  /** Leida y Sol (01-11-2026): todo Arta; la corrida la suben, no la modifican; no manejan usuarios. */
  dir_adjunta: ARTA_MANAGEMENT,
  gerente_arta: ARTA_MANAGEMENT,
  /** Rodrigo (01-11-2026): todo el Auditorio menos OC. Lo que puede en Arta lo acota `canEditFormat`. */
  dir_auditorio: [
    PERMISSIONS.TICKETING_VIEW,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.EVENT_CLOSE,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.VENDOR_PIN,
    PERMISSIONS.TESTIGOS_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  /** Williams (01-11-2026). Qué edita en cada negocio lo acotan `canEditFormat` y `canEditEventInfo`. */
  produccion: [
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.CONVENIOS_VIEW,
    PERMISSIONS.TICKETING_VIEW,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.TESTIGOS_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  /** Juan Pablo (01-11-2026): el único que hace OC; ve lo demás sin editar, salvo barra y merch. */
  compras: [
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.PO_EDIT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CONVENIOS_VIEW,
    PERMISSIONS.TICKETING_VIEW,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  /** Monse y Kika (01-11-2026): imágenes en los formatos generales y ver la campaña. */
  contenido: [PERMISSIONS.CAMPAIGN_VIEW],
  /** Iliana (01-11-2026): `canEditFormat` deja solo catering. */
  catering: [PERMISSIONS.CHECKLIST_EDIT],
  logistica: [
    PERMISSIONS.CAMPAIGN_EDIT,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.TICKETING_VIEW,
    PERMISSIONS.TICKETING_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  convenios: [
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CONVENIOS_VIEW,
    PERMISSIONS.CONVENIOS_EDIT,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  enlace_gobierno: [
    PERMISSIONS.CHECKLIST_EDIT,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.PO_MARK_PAID,
    PERMISSIONS.EVENT_CREATE,
    PERMISSIONS.FOLDERS_EDIT,
    PERMISSIONS.ADVANCE_REQUEST,
  ],
  /** Junta 11-09-2026: entra únicamente a las carpetas generales, a ver. */
  solo_carpetas: [],
  /**
   * Paula Farfán: ve Arta y Auditorio menos la corrida, entra a Finanzas y paga (OC y anticipos, con
   * comprobante). Junta 23-10-2026: edita campañas, convenios y boletera. No autoriza OC ni toca usuarios.
   */
  contabilidad: [
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
  ],
  /**
   * Perfil por temporada que se genera desde Studio (`User.accessExpiresAt`). Edita el sitio y sube
   * testigos; ve el calendario de shows en solo lectura. Publicar lo da su perfil (`studio.publish`).
   */
  practicante: [PERMISSIONS.STUDIO_EDIT, PERMISSIONS.TESTIGOS_EDIT],
};

export function hasPermission(
  roleKey: RoleKey,
  extra: string[] | null | undefined,
  needed: Permission,
): boolean {
  if (roleKey === ROLES.SUPER_ADMIN) return true;
  // Hacer OC es de compras aunque dirección «pueda todo»: si falta Juan Pablo, Chacho o Arturo
  // le dan el permiso a alguien (o a sí mismos) en Usuarios.
  if (roleKey === ROLES.DIR_GENERAL) return needed !== PERMISSIONS.PO_EDIT || (extra ?? []).includes(needed);
  if ((ROLE_PERMISSIONS[roleKey] ?? []).includes(needed)) return true;
  return (extra ?? []).includes(needed);
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
  // El practicante no opera eventos: calendario (`canSeeEventCalendar`) y testigos (`canSeeModule`).
  if (roleKey === ROLES.PRACTICANTE) return false;
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

/** Patrocinios (convenios) de un evento: dirección, Leida, Sol y contabilidad. */
export function canEditSponsors(roleKey: RoleKey, extra: string[]): boolean {
  return hasPermission(roleKey, extra, PERMISSIONS.CONVENIOS_EDIT);
}

/**
 * Canales de chat de un evento (la conversación de producción). Contabilidad y practicantes no
 * entran por su cuenta; si alguien los agrega al canal, entonces sí.
 */
export function canJoinEventChannels(roleKey: string | null | undefined): boolean {
  return roleKey !== ROLES.CONTABILIDAD && roleKey !== ROLES.PRACTICANTE;
}

/** Carpetas generales: todos los que trabajan en la entidad menos practicante, contenido y catering. */
export function canSeeGeneralFolders(roleKey: string | null | undefined): boolean {
  return roleKey !== ROLES.PRACTICANTE && roleKey !== ROLES.CONTENIDO && roleKey !== ROLES.CATERING;
}

/** Crear y asignar tareas: no quien solo consulta carpetas, el practicante, contenido ni catering. */
export function canCreateTasks(roleKey: string | null | undefined): boolean {
  return (
    roleKey !== ROLES.SOLO_CARPETAS &&
    roleKey !== ROLES.PRACTICANTE &&
    roleKey !== ROLES.CONTENIDO &&
    roleKey !== ROLES.CATERING
  );
}

// ─── Qué ve y qué edita cada quien (01-11-2026, docs/ROLES-Y-PERMISOS.md) ──────

export type AccessUser = {
  roleKey: string;
  entities?: string[] | null;
  permissions?: string[] | null;
};

export type EventModule =
  | 'corrida'
  | 'campaign'
  | 'formats'
  | 'po'
  | 'convenios'
  | 'ticketing'
  | 'tasks'
  | 'documents'
  | 'adendum'
  | 'testigos';

/** El Auditorio no lleva corrida, campaña ni convenios (01-11-2026). */
export function entityHasModule(entity: EntityKey | string, module: EventModule): boolean {
  if (entity !== 'EXPLANADA') return true;
  return module !== 'corrida' && module !== 'campaign' && module !== 'convenios';
}

function can(user: AccessUser, needed: Permission): boolean {
  return hasPermission(user.roleKey as RoleKey, user.permissions, needed);
}

function opsIn(user: AccessUser, entity: EntityKey | string): boolean {
  return canAccessEventOps((user.entities ?? []) as EntityKey[], user.roleKey as RoleKey, entity as EntityKey);
}

/** Rodrigo: en Arta solo llega a sus formatos de transporte, hospedaje y catering. */
function onlyFormatsIn(user: AccessUser, entity: EntityKey | string): boolean {
  return (user.roleKey === ROLES.DIR_AUDITORIO && entity === 'ARTA') || user.roleKey === ROLES.CATERING;
}

/** Pestaña del evento: ¿la ve esta persona en este negocio? */
export function canSeeModule(user: AccessUser, entity: EntityKey | string, module: EventModule): boolean {
  if (!entityHasModule(entity, module)) return false;
  if (module === 'testigos') {
    if (user.roleKey === ROLES.CATERING) return false;
    if (user.roleKey === ROLES.DIR_AUDITORIO && entity === 'ARTA') return false;
    if (user.roleKey === ROLES.PRACTICANTE) {
      return canAccessEntity((user.entities ?? []) as EntityKey[], ROLES.PRACTICANTE, entity as EntityKey);
    }
    return opsIn(user, entity);
  }
  if (!opsIn(user, entity)) return false;
  if (module === 'formats') return true;
  if (onlyFormatsIn(user, entity)) return false;
  switch (module) {
    case 'corrida':
      return can(user, PERMISSIONS.CORRIDA_VIEW);
    case 'campaign':
      return can(user, PERMISSIONS.CAMPAIGN_VIEW) || can(user, PERMISSIONS.CAMPAIGN_EDIT);
    case 'convenios':
      return can(user, PERMISSIONS.CONVENIOS_VIEW) || can(user, PERMISSIONS.CONVENIOS_EDIT);
    case 'ticketing':
      return can(user, PERMISSIONS.TICKETING_VIEW) || can(user, PERMISSIONS.TICKETING_EDIT);
    case 'po':
    case 'adendum':
      return (
        can(user, PERMISSIONS.PO_VIEW) ||
        can(user, PERMISSIONS.PO_EDIT) ||
        can(user, PERMISSIONS.PO_AUTHORIZE) ||
        can(user, PERMISSIONS.PO_MARK_PAID)
      );
    case 'tasks':
    case 'documents':
      return user.roleKey !== ROLES.CONTENIDO;
    default:
      return false;
  }
}

/**
 * Datos del show. Williams edita los del Auditorio y solo ve los de Arta; Rodrigo, al revés que antes,
 * solo los del Auditorio. Compras, contabilidad, contenido y catering los ven.
 */
export function canEditEventInfo(user: AccessUser, entity: EntityKey | string): boolean {
  if (!opsIn(user, entity)) return false;
  const role = user.roleKey;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.DIR_GENERAL) return true;
  if (role === ROLES.DIR_ADJUNTA || role === ROLES.GERENTE_ARTA) return entity === 'ARTA';
  if (role === ROLES.DIR_AUDITORIO || role === ROLES.PRODUCCION) return entity === 'EXPLANADA';
  if (role === ROLES.LOGISTICA || role === ROLES.CONVENIOS || role === ROLES.ENLACE_GOBIERNO) return true;
  return false;
}

/** Boletera: Williams la edita en Auditorio y la ve en Arta. */
export function canEditTicketing(user: AccessUser, entity: EntityKey | string): boolean {
  if (!canSeeModule(user, entity, 'ticketing') || !can(user, PERMISSIONS.TICKETING_EDIT)) return false;
  return !(user.roleKey === ROLES.PRODUCCION && entity === 'ARTA');
}

/** Campaña: de dirección, gerencia, Williams y contabilidad; solo existe en Arta. */
export function canEditCampaign(user: AccessUser, entity: EntityKey | string): boolean {
  return canSeeModule(user, entity, 'campaign') && can(user, PERMISSIONS.CAMPAIGN_EDIT);
}

/** Testigos de publicidad: Williams solo los ve en Arta; en Auditorio los sube. */
export function canEditTestigos(user: AccessUser, entity: EntityKey | string): boolean {
  if (!canSeeModule(user, entity, 'testigos') || !can(user, PERMISSIONS.TESTIGOS_EDIT)) return false;
  return !(user.roleKey === ROLES.PRODUCCION && entity === 'ARTA');
}

/**
 * Evento General, Artes y Pendones los aprueban solo Chacho o Arturo (01-11-2026); los demás de Arta,
 * también Leida y Sol.
 */
export const TOP_APPROVAL_FORMATS = ['EVENTO_GENERAL', 'ARTES_SHOWS', 'PENDONES'];

/**
 * La clave que cuenta para aprobar. Distribución de Pendones en Excel y las plantillas que crea el
 * equipo comparten `CUSTOM`: el libro de Pendones cuenta como Pendones y las demás no se reservan.
 */
export function formatRuleKey(template?: { key?: string | null; name?: string | null } | null): string {
  const key = template?.key ?? '';
  return key === 'CUSTOM' && /pendones/i.test(template?.name ?? '') ? 'PENDONES' : key;
}
/** Formatos generales: donde Monse y Kika suben imágenes. */
export const GENERAL_FORMATS = ['EVENTO_GENERAL', 'CHECKLIST_AUDITORIO'];
export const BAR_MERCH_FORMATS = ['BARRA', 'MERCH'];
const WILLIAMS_ARTA_FORMATS = ['PRODUCCION', 'TRANSPORTACION', 'HOSPEDAJE'];
const RODRIGO_ARTA_FORMATS = ['TRANSPORTACION', 'HOSPEDAJE', 'CATERING'];

export function canSeeFormat(user: AccessUser, entity: EntityKey | string, key: string): boolean {
  if (!opsIn(user, entity)) return false;
  const role = user.roleKey;
  if (role === ROLES.DIR_AUDITORIO && entity === 'ARTA') return RODRIGO_ARTA_FORMATS.includes(key);
  if (role === ROLES.CATERING) return key === 'CATERING';
  if (role === ROLES.CONTENIDO) return GENERAL_FORMATS.includes(key);
  return true;
}

export function canEditFormat(user: AccessUser, entity: EntityKey | string, key: string): boolean {
  if (!canSeeFormat(user, entity, key)) return false;
  const role = user.roleKey;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.DIR_GENERAL) return true;
  if (role === ROLES.DIR_ADJUNTA || role === ROLES.GERENTE_ARTA) return entity === 'ARTA';
  if (role === ROLES.DIR_AUDITORIO) return true;
  if (role === ROLES.PRODUCCION) return entity === 'EXPLANADA' || WILLIAMS_ARTA_FORMATS.includes(key);
  if (role === ROLES.COMPRAS) return BAR_MERCH_FORMATS.includes(key);
  if (role === ROLES.CATERING) return key === 'CATERING';
  if (role === ROLES.CONTENIDO || role === ROLES.CONTABILIDAD) return false;
  return can(user, PERMISSIONS.CHECKLIST_EDIT);
}

/** Subir imágenes a un formato: quien lo edita, y Monse y Kika en los generales. */
export function canAddFormatImages(user: AccessUser, entity: EntityKey | string, key: string): boolean {
  if (canEditFormat(user, entity, key)) return true;
  return user.roleKey === ROLES.CONTENIDO && canSeeFormat(user, entity, key);
}

export function canApproveFormat(user: AccessUser, entity: EntityKey | string, key: string): boolean {
  if (!opsIn(user, entity)) return false;
  const role = user.roleKey;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.DIR_GENERAL) return true;
  if (role === ROLES.DIR_ADJUNTA || role === ROLES.GERENTE_ARTA) {
    return entity === 'ARTA' && !TOP_APPROVAL_FORMATS.includes(key);
  }
  if (role === ROLES.DIR_AUDITORIO) return entity === 'EXPLANADA' && !TOP_APPROVAL_FORMATS.includes(key);
  return false;
}

/** Quién puede agregar un formato al evento. */
export function canCreateFormats(user: AccessUser, entity: EntityKey | string): boolean {
  if (!opsIn(user, entity)) return false;
  const role = user.roleKey;
  return role !== ROLES.CONTENIDO && role !== ROLES.CONTABILIDAD && role !== ROLES.CATERING && can(user, PERMISSIONS.CHECKLIST_EDIT);
}
