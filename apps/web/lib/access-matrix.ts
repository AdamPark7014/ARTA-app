/**
 * Matriz de acceso del panel (fuente única para sidebar y gates en UI).
 * Espejo de roles.ts del API.
 */

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
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', group: 'Inicio' },
  { href: '/events', label: 'Eventos', group: 'Operación', requiresEventOps: true },
  {
    href: '/events/new',
    label: 'Nuevo evento',
    permissions: ['event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/checklists',
    label: 'Plantillas',
    permissions: ['checklist.edit', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/finance',
    label: 'Finanzas',
    permissions: ['finance.view', 'finance.edit', 'everything'],
    group: 'Control',
    requiresEventOps: true,
  },
  {
    href: '/purchase-orders',
    label: 'Órdenes de compra',
    permissions: ['checklist.edit', 'po.authorize', 'po.mark_paid', 'everything'],
    group: 'Control',
    requiresEventOps: true,
  },
  {
    href: '/campaigns',
    label: 'Campañas',
    permissions: ['campaign.view', 'campaign.edit', 'everything'],
    group: 'Control',
    requiresEventOps: true,
  },
  {
    href: '/ticketing',
    label: 'Boletera',
    permissions: ['ticketing.edit', 'everything'],
    group: 'Control',
    requiresEventOps: true,
  },
  {
    href: '/advances',
    label: 'Anticipos',
    permissions: ['checklist.edit', 'finance.view', 'finance.edit', 'everything'],
    group: 'Control',
    requiresEventOps: true,
  },
  {
    href: '/folders',
    label: 'Carpetas generales',
    permissions: ['folders.edit', 'checklist.edit', 'everything'],
    group: 'Operación',
  },
  {
    href: '/hospitality',
    label: 'Hospitality',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/transport',
    label: 'Transportación',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/catering',
    label: 'Catering',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/press',
    label: 'Rueda de prensa',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/arts',
    label: 'Artes',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/pendones',
    label: 'Pendones',
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/tasks',
    label: 'Mis tareas',
    group: 'Operación',
    requiresEventOps: true,
  },
  {
    href: '/maintenance',
    label: 'Mantenimiento',
    entities: ['EXPLANADA'],
    permissions: ['checklist.edit', 'event.create', 'everything'],
    group: 'Operación',
    requiresEventOps: true,
  },
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
  {
    href: '/users',
    label: 'Usuarios',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
  {
    href: '/audit',
    label: 'Audit log',
    permissions: ['users.manage', 'everything'],
    roles: ['dir_general', 'super_admin'],
    group: 'Admin',
  },
];

/** dir_auditorio: full EXPLANADA; ARTA = solo carpetas (no eventos) */
export function canAccessEventOps(roleKey: string, entity: EntityKey): boolean {
  if (roleKey === 'super_admin' || roleKey === 'dir_general') return true;
  if (roleKey === 'dir_auditorio' && entity === 'ARTA') return false;
  return true;
}

export function userHasPermission(
  roleKey: string,
  permissions: string[],
  needed?: string[],
): boolean {
  if (!needed?.length) return true;
  if (roleKey === 'super_admin' || roleKey === 'dir_general') return true;
  if (permissions.includes('everything')) return true;
  const fromRole: Record<string, string[]> = {
    gerente_arta: [
      'finance.edit',
      'finance.view',
      'campaign.edit',
      'campaign.view',
      'po.authorize',
      'po.mark_paid',
      'event.create',
      'event.close',
      'checklist.edit',
      'studio.edit',
      'ticketing.edit',
      'folders.edit',
      'vendor.pin',
    ],
    dir_auditorio: [
      'finance.view',
      'campaign.view',
      'po.authorize',
      'po.mark_paid',
      'event.create',
      'event.close',
      'checklist.edit',
      'studio.edit',
      'ticketing.edit',
      'folders.edit',
      'vendor.pin',
    ],
    logistica: [
      'campaign.edit',
      'campaign.view',
      'checklist.edit',
      'event.create',
      'ticketing.edit',
      'finance.view',
      'folders.edit',
    ],
    convenios: ['checklist.edit', 'finance.view', 'campaign.view', 'folders.edit'],
    enlace_gobierno: ['checklist.edit', 'finance.view', 'po.mark_paid', 'event.create', 'folders.edit'],
  };
  const bag = new Set([...(fromRole[roleKey] || []), ...permissions]);
  return needed.some((p) => bag.has(p));
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
