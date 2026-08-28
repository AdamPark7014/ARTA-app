/**
 * Matriz de acceso del panel (NAV + gates UI).
 * Permisos/roles canónicos: @arta/rbac
 */

import {
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessEventOps as rbacCanAccessEventOps,
  type EntityKey as RbacEntity,
  type Permission,
  type RoleKey as RbacRole,
} from '@arta/rbac';

export type EntityKey = 'ARTA' | 'EXPLANADA';
export type RoleKey =
  | 'super_admin'
  | 'dir_general'
  | 'gerente_arta'
  | 'dir_auditorio'
  | 'logistica'
  | 'convenios'
  | 'enlace_gobierno';

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
  { href: '/dashboard', label: 'Dashboard', group: 'Inicio', exact: true },

  // ── Eventos: las cuatro entradas que pidió la junta ────────────────────────
  {
    href: '/events/new',
    label: 'Crear evento',
    permissions: ['event.create', 'everything'],
    group: 'Eventos',
    requiresEventOps: true,
    exact: true,
    keywords: 'nuevo alta show',
  },
  {
    href: '/events',
    label: 'Eventos actuales',
    group: 'Eventos',
    requiresEventOps: true,
    query: 'scope=active',
    queryIsDefault: true,
    keywords: 'en curso proximos pipeline',
  },
  {
    href: '/events',
    label: 'Eventos pasados',
    group: 'Eventos',
    requiresEventOps: true,
    query: 'scope=past',
    keywords: 'historico cerrados archivo',
  },
  {
    href: '/tasks',
    label: 'Tareas',
    group: 'Eventos',
    keywords: 'pendientes apoyo asignar workload',
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
    href: '/site',
    label: 'Ver sitio Arta',
    group: 'Marca',
    entities: ['ARTA'],
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    href: '/users',
    label: 'Usuarios',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/settings',
    label: 'Configuración',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
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
    label: 'Audit log',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/webhooks',
    label: 'Webhooks',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/digests',
    label: 'Digests / Jobs',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
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
    label: 'Finanzas',
    permissions: ['finance.view', 'finance.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'corrida financiera cierre',
  },
  {
    href: '/purchase-orders',
    label: 'Órdenes de compra',
    permissions: ['checklist.edit', 'po.authorize', 'po.mark_paid', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'oc procurement compras',
  },
  {
    href: '/campaigns',
    label: 'Campañas',
    permissions: ['campaign.view', 'campaign.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'publicidad medios pauta',
  },
  {
    href: '/ticketing',
    label: 'Boletera',
    permissions: ['ticketing.edit', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'taquilla zonas aforo',
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
    label: 'Hospitality',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'hospedaje hotel',
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
    label: 'Risk workspace',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'riesgo alertas',
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
  {
    href: '/vendor',
    label: 'Vendor PIN',
    permissions: ['vendor.pin', 'everything'],
    group: HIDDEN_NAV_GROUP,
    requiresEventOps: true,
    hidden: true,
    keywords: 'proveedor acceso',
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
 * Items que le tocan a este usuario en esta entidad.
 *
 * Excepción deliberada: un rol sin operación de eventos en la entidad activa
 * (dir_auditorio dentro de Arta, por ejemplo) se quedaría con un menú vacío,
 * porque las cuatro entradas de eventos no le aplican. Para ese caso las
 * carpetas generales — su única herramienta ahí — vuelven al menú.
 */
export function visibleNavItems(
  user: { roleKey: string; permissions: string[]; entities: EntityKey[] },
  entity: EntityKey,
): NavItem[] {
  const items = NAV_ITEMS.filter((item) => canSeeNavItem(user, item, entity));
  if (canAccessEventOps(user.roleKey, entity)) return items;
  return items.map((item) =>
    item.href === '/folders' ? { ...item, hidden: false, group: 'Operación' } : item,
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
  if (item.requiresEventOps && !canAccessEventOps(user.roleKey, entity)) return false;
  if (item.roles?.length && !item.roles.includes(user.roleKey as RoleKey)) {
    if (user.roleKey !== 'super_admin' && user.roleKey !== 'dir_general') return false;
  }
  return userHasPermission(user.roleKey, user.permissions, item.permissions);
}

/** Alcance operacional por rol (texto UI) */
export const ROLE_SCOPE: Record<string, string> = {
  super_admin: 'Acceso total de sistemas',
  dir_general: 'Acceso total Arta + Auditorio · usuarios · cierre · corrida',
  gerente_arta: 'Todo Arta · campaña · corrida · autoriza OC Arta · Studio',
  dir_auditorio: 'Todo Auditorio · en Arta solo carpetas generales · autoriza OC Auditorio',
  logistica: 'Eventos ambos · campaña · boletera · checklists · carpetas',
  convenios: 'Carpetas · patrocinios · checklists',
  enlace_gobierno: 'Carpetas · pagos · marcar OC pagado',
};

/** Expuesto para pantallas de gobierno */
export { ROLE_PERMISSIONS };
