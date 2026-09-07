/**
 * La auditoría, dicha en castellano.
 *
 * La pantalla enseñaba el identificador crudo de la acción —`po.authorize`,
 * `checklist.status.sealed`, `finance.unlock`— dentro de un `<code>`. Para
 * quien tiene que supervisar quién tocó qué, eso no es información: es una
 * clave de base de datos. Aquí se traduce a lo que hizo la persona.
 *
 * El identificador no se tira: se sigue enseñando en pequeño, porque cuando
 * algo se discute en serio hace falta el dato exacto.
 */

const ACTION_LABELS: Record<string, string> = {
  // Sesión y seguridad
  'auth.2fa.enable': 'Activó su segundo factor',
  'auth.2fa.disable': 'Desactivó su segundo factor',
  'user.deactivate': 'Dio de baja a una persona',
  'org.invite.create': 'Invitó a alguien',
  'org.invite.accept': 'Aceptó una invitación',

  // Eventos
  'event.create': 'Creó un evento',
  'event.update': 'Editó un evento',
  'event.close': 'Cerró un evento',
  'event.cancel': 'Canceló un evento',
  'event.reopen': 'Reabrió un evento',
  'event.delete': 'Eliminó un evento',

  // Formatos (checklists)
  'checklist.update': 'Editó un formato',
  'checklist.restore': 'Restauró una versión del formato',
  'checklist.reopen': 'Reabrió un formato',
  'checklist.status.review': 'Mandó un formato a revisión',
  'checklist.status.approved': 'Aprobó un formato',
  'checklist.status.sealed': 'Selló un formato',
  'checklist.status.draft': 'Devolvió un formato a borrador',
  'template.schema.update': 'Cambió una plantilla de formato',
  'template.restore': 'Restauró una versión de la plantilla',

  // Corrida financiera
  'finance.update': 'Editó la corrida',
  'finance.unlock': 'Quitó el sello de la corrida',

  // Órdenes de compra
  'po.create': 'Pidió una orden de compra',
  'po.update': 'Editó una orden de compra',
  'po.authorize': 'Autorizó una orden de compra',
  'po.pay': 'Marcó pagada una orden de compra',
  'po.status': 'Cambió el estatus de una orden',
  'po.delete': 'Eliminó una orden de compra',
  'po.proof.add': 'Subió un comprobante',
  'po.payment_method.cash_at_payment': 'Pagó en efectivo sin comprobante',

  // Archivos
  'file.delete': 'Borró un archivo',
  'file.restore': 'Restauró una versión del archivo',
  'file.export_pdf': 'Sacó el PDF de un archivo',

  // Sistema
  'studio.upsert': 'Editó el sitio público',
  'automation.scan': 'Revisión automática del sistema',
};

const RESOURCE_LABELS: Record<string, string> = {
  Event: 'Evento',
  ChecklistInstance: 'Formato',
  ChecklistTemplate: 'Plantilla',
  FinanceRun: 'Corrida',
  PurchaseOrder: 'Orden de compra',
  EventFile: 'Archivo',
  EventDocument: 'Documento',
  PaymentProof: 'Comprobante',
  User: 'Persona',
  Organization: 'Organización',
  PageContent: 'Sitio público',
  System: 'Sistema',
};

/**
 * Acciones que merecen una segunda mirada: deshacen algo, borran, o esquivan
 * un control. No son «errores» — son las que uno quiere poder explicar.
 */
const NOTABLE = new Set([
  'po.payment_method.cash_at_payment',
  'po.delete',
  'finance.unlock',
  'checklist.reopen',
  'checklist.status.draft',
  'event.delete',
  'event.reopen',
  'file.delete',
  'user.deactivate',
  'auth.2fa.disable',
]);

/** Firmas: `checklist.sign.<tipo>`, con el tipo abierto. */
function signLabel(action: string): string | null {
  if (!action.startsWith('checklist.sign.')) return null;
  const kind = action.slice('checklist.sign.'.length);
  if (kind === 'authorize' || kind === 'authorized') return 'Autorizó y firmó un formato';
  if (kind === 'deliver' || kind === 'delivered') return 'Firmó la entrega de un formato';
  return 'Firmó un formato';
}

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] || signLabel(action) || action;
}

/** `true` cuando hay traducción; si no, la pantalla no repite el crudo dos veces. */
export function hasAuditActionLabel(action: string): boolean {
  return !!(ACTION_LABELS[action] || signLabel(action));
}

export function auditResourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] || resource;
}

export function isNotableAction(action: string): boolean {
  return NOTABLE.has(action);
}
