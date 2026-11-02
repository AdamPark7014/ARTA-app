/**
 * Matriz de acceso del panel (NAV + gates UI).
 * Permisos/roles canónicos: @arta/rbac
 */

import {
  ROLE_PERMISSIONS,
  hasPermission,
  canEditEventInfo,
  canSeeGeneralFolders,
  canAccessEventOps as rbacCanAccessEventOps,
  canSeeEventCalendar as rbacCanSeeEventCalendar,
  type EntityKey as RbacEntity,
  type Permission,
  type RoleKey as RbacRole,
} from '@arta/rbac';

export type EntityKey = 'ARTA' | 'EXPLANADA';
export type RoleKey =
  | 'super_admin'
  | 'dir_general'
  | 'dir_adjunta'
  | 'gerente_arta'
  | 'dir_auditorio'
  | 'logistica'
  | 'convenios'
  | 'enlace_gobierno'
  | 'solo_carpetas'
  | 'contabilidad'
  | 'practicante'
  | 'compras'
  | 'produccion'
  | 'contenido'
  | 'catering';

export type NavItem = {
  href: string;
  label: string;
  /** Si se define, el usuario necesita al menos uno */
  permissions?: string[];
  roles?: RoleKey[];
  /** Solo mostrar en estas entidades (vacío = ambas) */
  entities?: EntityKey[];
  /** Requiere operación de eventos (oculta a dir_auditorio en ARTA) */
  requiresEventOps?: boolean;
  /** Calendario de shows: quien opera eventos y, en solo lectura, el practicante (junta 23-10-2026). */
  requiresCalendar?: boolean;
  group?: string;
  /** Query string del enlace, p. ej. `scope=past` */
  query?: string;
  /** El item también queda activo cuando el query param no viene en la URL */
  queryIsDefault?: boolean;
  /** Activo solo con coincidencia exacta de ruta */
  exact?: boolean;
  /**
   * Fuera del menú por defecto (junta 2026-08-28: el sidebar deja de listar
   * cada check). Sigue siendo alcanzable desde el buscador del sidebar.
   */
  hidden?: boolean;
  /** Sinónimos extra para el buscador del sidebar */
  keywords?: string;
};

/** Grupo donde caen las vistas de portafolio que ya no viven en el menú. */
export const HIDDEN_NAV_GROUP = 'Vistas de portafolio';

/**
 * Menú lateral.
 *
 * Junta 2026-08-28: «en la barra lateral principal quitar el desglose de cada
 * uno de los checks (plantillas, carpetas generales, transportación, artes,
 * pendones…) y agregar Crear Evento, Eventos actuales, Eventos Pasados y
 * Tareas. El resto de herramientas y formatos deberá encontrarse dentro de
 * cada evento».
 *
 * Las herramientas transversales no se borran: quedan `hidden` y se alcanzan
 * escribiendo en el buscador del sidebar, además de vivir como pestaña dentro
 * del hub de cada evento.
 */
export const NAV_ITEMS: NavItem[] = [
  // Sistema visual 11-10-2026 (docs/diseno/SISTEMA-VISUAL.md): el menú se agrupa en
  // «Operación» y «Equipo»; Control, Marca y Admin siguen con su propio grupo.
  // Solo cambia la etiqueta del grupo: permisos, roles y entidades quedan igual.
  { href: '/dashboard', label: 'Inicio', group: 'Operación', exact: true },
  // 01-11-2026: arriba, junto a Inicio. Lo ven Paula, Chacho y Arturo.
  {
    href: '/finanzas',
    label: 'Finanzas',
    permissions: ['finanzas.view', 'everything'],
    group: 'Operación',
    keywords: 'contabilidad pagos transferencias comprobantes adendum',
  },
  // Junta 11-09-2026: «crear un chat interno entre todos y personal».
  { href: '/chat', label: 'Chat', group: 'Equipo', keywords: 'mensajes equipo conversacion personal' },

  // ── Eventos: las cuatro entradas que pidió la junta ────────────────────────
  {
    href: '/events/new',
    label: 'Crear evento',
    permissions: ['event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
    exact: true,
    keywords: 'nuevo alta show',
  },
  {
    href: '/events',
    label: 'Eventos actuales',
    group: 'Operación',
    requiresEventOps: true,
    query: 'scope=active',
    queryIsDefault: true,
    keywords: 'en curso proximos pipeline',
  },
  {
    href: '/events',
    label: 'Eventos pasados',
    group: 'Operación',
    requiresEventOps: true,
    query: 'scope=past',
    keywords: 'historico cerrados archivo',
  },
  {
    href: '/calendar',
    label: 'Calendario',
    group: 'Operación',
    requiresCalendar: true,
    keywords: 'agenda mes semana fechas shows',
  },
  {
    href: '/tasks',
    label: 'Tareas',
    group: 'Operación',
    // Junta 11-09-2026: «solo carpetas generales» no ve tareas. Junta 23-10-2026: contabilidad sí
    // (le piden pagos por tarea); el practicante no.
    roles: ['super_admin', 'dir_general', 'dir_adjunta', 'gerente_arta', 'dir_auditorio', 'logistica', 'convenios', 'enlace_gobierno', 'contabilidad', 'compras', 'produccion'],
    keywords: 'pendientes apoyo asignar workload',
  },

  // ── Control ───────────────────────────────────────────────────────────────
  // La junta le dedicó una sección propia a las OC (la ventana de solicitud);
  // nunca pidió moverlas dentro del evento, así que la torre de control se
  // queda en el menú.
  {
    href: '/purchase-orders',
    label: 'Órdenes de compra',
    permissions: ['po.view', 'po.edit', 'po.authorize', 'po.mark_paid', 'everything'],
    group: 'Control',
    requiresEventOps: true,
    keywords: 'oc procurement compras ventana',
  },

  // ── Marca ─────────────────────────────────────────────────────────────────
  {
    href: '/studio',
    label: 'Studio web',
    permissions: ['studio.edit', 'everything'],
    group: 'Marca',
    entities: ['ARTA'],
  },
  {
    href: '/testigos',
    label: 'Testigos de publicidad',
    permissions: ['testigos.edit', 'everything'],
    group: 'Marca',
    hidden: true,
    keywords: 'evidencia publicidad espectacular pendon prensa',
  },
  {
    href: '/studio/practicantes',
    label: 'Perfiles de practicante',
    permissions: ['practicantes.manage', 'everything'],
    group: 'Marca',
    hidden: true,
    keywords: 'temporada generar perfil acceso',
  },
  {
    href: '/site',
    label: 'Ver sitio Arta',
    group: 'Marca',
    entities: ['ARTA'],
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    href: '/users',
    label: 'Usuarios',
    // 01-11-2026: solo Chacho y Arturo meten y cambian usuarios.
    permissions: ['users.manage', 'users.create'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
    keywords: 'equipo alta personas integrantes',
  },
  {
    href: '/settings',
    label: 'Configuración',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'dir_adjunta', 'super_admin'],
    group: 'Admin',
    keywords: 'ventana ordenes de compra horario dias oc',
  },
  {
    href: '/organizations',
    label: 'Organizaciones',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/security',
    label: 'Seguridad',
    group: 'Admin',
  },
  {
    href: '/audit',
    label: 'Auditoría',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'dir_adjunta', 'super_admin'],
    group: 'Admin',
    keywords: 'audit log cumplimiento',
  },
  {
    href: '/webhooks',
    label: 'Webhooks',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'dir_adjunta', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/digests',
    label: 'Resúmenes',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'dir_adjunta', 'super_admin'],
    group: 'Admin',
    keywords: 'digests jobs outbox',
  },

  // ── Fuera del menú: vistas de portafolio (buscador del sidebar) ───────────
  // Cada una vive también como pestaña dentro del hub de cada evento.
  {
    href: '/checklists',
    label: 'Plantillas',
    permissions: ['checklist.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'checklists formatos plantilla',
  },
  {
    href: '/folders',
    label: 'Carpetas generales',
    permissions: ['folders.edit', 'checklist.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    hidden: true,
    keywords: 'documentos archivos compartidos',
  },
  {
    href: '/finance',
    label: 'Corridas',
    permissions: ['corrida.view', 'everything'],
    // El Auditorio no lleva corrida (01-11-2026).
    entities: ['ARTA'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'corrida financiera cierre',
  },
  {
    href: '/campaigns',
    label: 'Campañas',
    permissions: ['campaign.view', 'campaign.edit', 'everything'],
    // El Auditorio no lleva campaña (01-11-2026).
    entities: ['ARTA'],
    // Junta 11-09-2026: campaña con calendario propio — vuelve al menú.
    group: 'Control',
    requiresEventOps: true,
    keywords: 'publicidad medios pauta calendario',
  },
  {
    href: '/ticketing',
    label: 'Boletera',
    permissions: ['ticketing.view', 'ticketing.edit', 'everything'],
    // Junta 11-09-2026: «crear una sección para Boletera».
    group: 'Control',
    requiresEventOps: true,
    keywords: 'taquilla zonas aforo creacion boletera',
  },
  {
    href: '/advances',
    label: 'Anticipos',
    permissions: ['checklist.edit', 'finance.view', 'finance.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/hospitality',
    label: 'Hospedaje',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'hospitality hotel rider',
  },
  {
    href: '/transport',
    label: 'Transportación',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/catering',
    label: 'Catering',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/press',
    label: 'Rueda de prensa',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/arts',
    label: 'Artes',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/pendones',
    label: 'Pendones',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  {
    href: '/risk',
    label: 'Riesgo',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'risk workspace alertas criticos',
  },
  {
    href: '/maintenance',
    label: 'Mantenimiento',
    entities: ['EXPLANADA'],
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
  },
  // Junta 23-10-2026: inventario de limpieza semanal del Auditorio (no cuelga de un evento).
  {
    href: '/maintenance/inventario-limpieza',
    label: 'Inventario de limpieza',
    entities: ['EXPLANADA'],
    group: 'Operación',
    requiresEventOps: true,
    keywords: 'insumos semanal limpieza consumo existencias faltantes inventario',
  },
  {
    href: '/vendor',
    label: 'PIN proveedores',
    permissions: ['vendor.pin', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'vendor pin acceso externo',
  },
];

/** URL final del item (ruta + query si lo tiene). */
export function navHref(item: NavItem): string {
  return item.query ? `${item.href}?${item.query}` : item.href;
}

/** Clave estable: dos items pueden compartir href y diferir en query. */
export function navKey(item: NavItem): string {
  return navHref(item);
}

function pathMatches(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  return item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`);
}

/** ¿Este item corresponde a la URL actual? */
export function isNavActive(
  item: NavItem,
  pathname: string,
  params?: URLSearchParams | null,
): boolean {
  if (!pathMatches(item, pathname)) return false;
  if (!item.query) return true;
  const expected = new URLSearchParams(item.query);
  for (const [key, value] of Array.from(expected.entries())) {
    const actual = params?.get(key);
    if (actual === value) continue;
    if (!actual && item.queryIsDefault) continue;
    return false;
  }
  return true;
}

/** El item activo: gana la coincidencia exacta sobre la de prefijo. */
export function activeNavKey(
  items: NavItem[],
  pathname: string,
  params?: URLSearchParams | null,
): string {
  const exact = items.find((i) => i.exact && isNavActive(i, pathname, params));
  if (exact) return navKey(exact);
  const loose = items.find((i) => !i.exact && isNavActive(i, pathname, params));
  return loose ? navKey(loose) : '';
}

/**
 * Roles cuya herramienta principal son las carpetas generales, no los eventos.
 * Su `ROLE_SCOPE` empieza justamente por «Carpetas».
 */
const FOLDER_CENTRIC_ROLES: RoleKey[] = ['convenios', 'enlace_gobierno', 'solo_carpetas'];

/**
 * Vistas de portafolio que para un rol son su trabajo diario y salen del buscador al menú.
 * Contabilidad: los anticipos por pagar. Practicante: los testigos de publicidad.
 */
const ROLE_SURFACED: Partial<Record<RoleKey, string[]>> = {
  contabilidad: ['/advances'],
  practicante: ['/testigos'],
};

/**
 * Items que le tocan a este usuario en esta entidad.
 *
 * Excepción deliberada: **las carpetas generales vuelven al menú** para quien
 * no tiene operación de eventos en la entidad activa (dir_auditorio dentro de
 * Arta) y para los roles que trabajan sobre carpetas (convenios, enlace de
 * gobierno). Sin esto, Leida, Marisol y Juan Pablo se quedaban con un menú de
 * cuatro entradas de eventos y sin su herramienta de todos los días: las
 * carpetas no son un check del evento, son el repositorio que no cuelga de
 * ningún show.
 */
export function visibleNavItems(
  user: { roleKey: string; permissions: string[]; entities: EntityKey[] },
  entity: EntityKey,
): NavItem[] {
  const surfaced = ROLE_SURFACED[user.roleKey as RoleKey] ?? [];
  const items = NAV_ITEMS.filter((item) => canSeeNavItem(user, item, entity)).map((item) =>
    surfaced.includes(item.href)
      ? { ...item, hidden: false, group: item.group === HIDDEN_NAV_GROUP ? 'Control' : item.group }
      : item,
  );
  // El practicante no trabaja con carpetas generales: su menú es Studio y calendario.
  const needsFolders =
    user.roleKey !== 'practicante' &&
    (!canAccessEventOps(user.roleKey, entity) ||
      FOLDER_CENTRIC_ROLES.includes(user.roleKey as RoleKey));
  if (!needsFolders) return items;
  return items.map((item) =>
    item.href === '/folders' ? { ...item, hidden: false, group: 'Equipo' } : item,
  );
}

/** Coincidencia del buscador del sidebar (incluye items ocultos). */
export function navItemMatches(item: NavItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    item.label.toLowerCase().includes(q) ||
    (item.group || '').toLowerCase().includes(q) ||
    (item.keywords || '').toLowerCase().includes(q) ||
    item.href.toLowerCase().includes(q)
  );
}

/** dir_auditorio: full EXPLANADA; ARTA = solo carpetas (no eventos) */
export function canAccessEventOps(roleKey: string, entity: EntityKey): boolean {
  // UI helper: entities list not always present — use role rules
  if (roleKey === 'super_admin' || roleKey === 'dir_general') return true;
  return rbacCanAccessEventOps([entity] as RbacEntity[], roleKey as RbacRole, entity as RbacEntity);
}

/** Calendario de shows: quien opera eventos o, en solo lectura, el practicante. */
export function canSeeCalendar(roleKey: string, entity: EntityKey): boolean {
  if (roleKey === 'super_admin' || roleKey === 'dir_general') return true;
  return rbacCanSeeEventCalendar([entity] as RbacEntity[], roleKey as RbacRole, entity as RbacEntity);
}

export function userHasPermission(
  roleKey: string,
  permissions: string[],
  needed?: string[],
): boolean {
  if (!needed?.length) return true;
  if (roleKey === 'super_admin' || roleKey === 'dir_general') return true;
  if (permissions.includes('everything')) return true;
  return needed.some((p) =>
    hasPermission(roleKey as RbacRole, permissions, p as Permission),
  );
}

export function canSeeNavItem(
  user: { roleKey: string; permissions: string[]; entities: EntityKey[] },
  item: NavItem,
  entity: EntityKey,
): boolean {
  if (item.entities?.length && !item.entities.includes(entity)) return false;
  if (item.href === '/folders' && !canSeeGeneralFolders(user.roleKey)) return false;
  if (item.href === '/events/new' && !canEditEventInfo(user, entity)) return false;
  if (item.requiresEventOps && !canAccessEventOps(user.roleKey, entity)) return false;
  if (item.requiresCalendar && !canSeeCalendar(user.roleKey, entity)) return false;
  if (item.roles?.length && !item.roles.includes(user.roleKey as RoleKey)) {
    if (user.roleKey !== 'super_admin' && user.roleKey !== 'dir_general') return false;
  }
  return userHasPermission(user.roleKey, user.permissions, item.permissions);
}

/** Alcance operacional por rol (texto UI) */
export const ROLE_SCOPE: Record<string, string> = {
  super_admin: 'Acceso total de sistemas',
  dir_general: 'Todo Arta y Auditorio · autoriza OC · usuarios · corrida · Finanzas',
  dir_adjunta: 'Todo Arta · aprueba formatos salvo Evento General, Artes y Pendones · sube la corrida',
  gerente_arta: 'Todo Arta · aprueba formatos salvo Evento General, Artes y Pendones · sube la corrida',
  dir_auditorio: 'Todo Auditorio menos OC · en Arta: transporte, hospedaje y catering',
  logistica: 'Eventos ambos · campaña · boletera · checklists · carpetas',
  convenios: 'Carpetas · patrocinios · checklists',
  enlace_gobierno: 'Carpetas · pagos · marcar OC pagado',
  solo_carpetas: 'Solo carpetas generales · Arta y Auditorio',
  contabilidad: 'Arta y Auditorio sin corrida · Finanzas · pagos de OC y anticipos · comprobantes',
  practicante: 'Por temporada: Studio · testigos de publicidad · calendario de shows',
  compras: 'Hace las OC · ve todo sin corrida · barra y merch',
  produccion: 'Edita todo Auditorio · en Arta: campaña, producción, transporte y hospedaje',
  contenido: 'Sube imágenes a los formatos generales · ve la campaña',
  catering: 'Ve la información general · edita solo catering',
};

/** Expuesto para pantallas de gobierno */
export { ROLE_PERMISSIONS };
