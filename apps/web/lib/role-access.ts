import {
  canAddFormatImages,
  canCreateFormats,
  canEditCampaign,
  canEditEventInfo,
  canEditFormat,
  canEditTestigos,
  canEditTicketing,
  canSeeModule,
  hasPermission,
  type AccessUser,
  type EntityKey,
  type EventModule,
  type Permission,
  type RoleKey,
} from '@arta/rbac';

export type AccessLevel = 'edit' | 'view' | 'none';

export type ModuleAccess = {
  key: EventModule;
  label: string;
  level: AccessLevel;
  /** Lo que hace en concreto cuando no es simplemente editar o ver. */
  note?: string;
};

function formatsAccess(user: AccessUser, entity: EntityKey): Pick<ModuleAccess, 'level' | 'note'> {
  if (!canSeeModule(user, entity, 'formats')) return { level: 'none' };
  if (canCreateFormats(user, entity)) {
    if (user.roleKey === 'compras') return { level: 'edit', note: 'Barra y merch' };
    if (user.roleKey === 'produccion' && entity === 'ARTA') {
      return { level: 'edit', note: 'Producción, transporte y hospedaje' };
    }
    if (user.roleKey === 'dir_auditorio' && entity === 'ARTA') {
      return { level: 'edit', note: 'Transporte, hospedaje y catering' };
    }
    return { level: 'edit' };
  }
  if (canEditFormat(user, entity, 'CATERING')) return { level: 'edit', note: 'Solo catering' };
  if (canAddFormatImages(user, entity, 'EVENTO_GENERAL')) return { level: 'view', note: 'Sube imágenes a los generales' };
  return { level: 'view' };
}

function orderAccess(user: AccessUser, entity: EntityKey, module: 'po' | 'adendum'): Pick<ModuleAccess, 'level' | 'note'> {
  if (!canSeeModule(user, entity, module)) return { level: 'none' };
  const can = (p: Permission) => hasPermission(user.roleKey as RoleKey, user.permissions, p);
  if (can('po.edit')) return { level: 'edit', note: 'Las hace' };
  if (can('po.authorize')) return { level: 'edit', note: 'Autoriza' };
  if (can('po.mark_paid')) return { level: 'edit', note: 'Paga y sube comprobante' };
  return { level: 'view' };
}

/**
 * Lo que una persona con este rol ve y edita de un evento en un negocio. Sale de las mismas funciones
 * que aplica el servidor, así que lo que dice la pantalla de Usuarios es lo que de verdad pasa.
 */
export function describeAccess(user: AccessUser, entity: EntityKey): ModuleAccess[] {
  const can = (p: Permission) => hasPermission(user.roleKey as RoleKey, user.permissions, p);
  const seen = (key: EventModule, label: string, edit: boolean, note?: string): ModuleAccess => {
    if (!canSeeModule(user, entity, key)) return { key, label, level: 'none' };
    return { key, label, level: edit ? 'edit' : 'view', note };
  };
  const corrida: ModuleAccess = seen(
    'corrida',
    'Corrida',
    can('corrida.edit'),
    !can('corrida.edit') && can('corrida.upload') ? 'La sube, no la modifica' : undefined,
  );
  return [
    corrida,
    seen('campaign', 'Campaña', canEditCampaign(user, entity)),
    { key: 'formats', label: 'Formatos', ...formatsAccess(user, entity) },
    { key: 'po', label: 'Órdenes de compra', ...orderAccess(user, entity, 'po') },
    seen('convenios', 'Convenios', can('convenios.edit')),
    seen('ticketing', 'Boletera', canEditTicketing(user, entity)),
    seen('tasks', 'Tareas', true),
    seen('documents', 'Documentos', canEditEventInfo(user, entity)),
    { key: 'adendum', label: 'Adendum', ...orderAccess(user, entity, 'adendum') },
    seen('testigos', 'Testigos', canEditTestigos(user, entity)),
  ];
}
