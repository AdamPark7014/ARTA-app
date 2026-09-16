/**
 * La auditoría, dicha en castellano.
 *
 * La base guarda claves como `po.authorize` o `user.password.seeded`. Para quien
 * supervisa quién tocó qué, eso es ruido: aquí se traduce a lo que hizo la
 * persona. Adam (16-09-2026) pidió que la clave cruda no se vea en ningún lado,
 * así que una acción nueva sin traducir cae en «Movimiento en …», nunca en la
 * clave con puntos.
 */

const ACTION_LABELS: Record<string, string> = {
  // Personas, sesión y seguridad
  'auth.2fa.enable': 'Activó su segundo factor',
  'auth.2fa.disable': 'Desactivó su segundo factor',
  'user.deactivate': 'Dio de baja a una persona',
  'user.password.seeded': 'Recibió su contraseña inicial',
  'user.access.changed': 'Se cambió su acceso',
  'user.access.junta_0911': 'Se cambió su acceso',
  'user.sessions.revoked_access_change': 'Se cerraron sus sesiones por cambio de acceso',
  'user.duplicate.merged': 'Se quitó una cuenta duplicada',
  'user.removed': 'Se quitó una cuenta',
  'org.invite': 'Invitó a alguien',
  'org.invite.create': 'Invitó a alguien',
  'org.invite.accept': 'Aceptó una invitación',

  // Eventos
  'event.create': 'Creó un evento',
  'event.update': 'Editó un evento',
  'event.close': 'Cerró un evento',
  'event.cancel': 'Canceló un evento',
  'event.reopen': 'Reabrió un evento',
  'event.delete': 'Eliminó un evento',

  // Formatos
  'checklist.update': 'Editó un formato',
  'checklist.restore': 'Restauró una versión del formato',
  'checklist.reopen': 'Reabrió un formato',
  'checklist.status.review': 'Mandó un formato a revisión',
  'checklist.status.approved': 'Aprobó un formato',
  'checklist.status.sealed': 'Selló un formato',
  'checklist.status.draft': 'Devolvió un formato a borrador',
  'template.schema.update': 'Cambió una plantilla de formato',
  'template.restore': 'Restauró una versión de la plantilla',

  // Corrida
  'finance.update': 'Editó la corrida',
  'finance.unlock': 'Quitó el sello de la corrida',

  // Órdenes de compra
  'po.create': 'Pidió una orden de compra',
  'po.update': 'Editó una orden de compra',
  'po.authorize': 'Autorizó una orden de compra',
  'po.pay': 'Marcó pagada una orden de compra',
  'po.status': 'Cambió el estado de una orden de compra',
  'po.delete': 'Eliminó una orden de compra',
  'po.proof.add': 'Subió un comprobante',
  'po.payment_method.cash_at_payment': 'Pagó en efectivo sin comprobante',

  // Campaña y convenios
  'campaign.status': 'Cambió el estado de la campaña',
  'convenios.status': 'Cambió el estado de los convenios',

  // Tareas
  'task.created': 'Pidió una tarea',
  'task.assigned': 'Asignó una tarea',
  'task.reassigned': 'Reasignó una tarea',
  'task.status_changed': 'Cambió el estado de una tarea',
  'task.submitted': 'Entregó una tarea',
  'task.completed': 'Completó una tarea',
  'task.approved': 'Aprobó una tarea',
  'task.rejected': 'Pidió corregir una tarea',
  'task.evidence_added': 'Subió evidencia a una tarea',
  'task.deleted': 'Eliminó una tarea',

  // Archivos
  'file.delete': 'Borró un archivo',
  'file.restore': 'Restauró una versión del archivo',
  'file.export_pdf': 'Sacó el PDF de un archivo',

  // Sistema
  'studio.upsert': 'Editó el sitio público',
  'ticketing.sync': 'Sincronizó la boletera',
  'digest.daily': 'Envió el resumen diario',
  'automation.scan': 'Revisión automática',
};

/** Para el «Movimiento en …» de una acción que todavía no tiene traducción. */
const AREA_LABELS: Record<string, string> = {
  auth: 'la cuenta',
  user: 'personas',
  org: 'la organización',
  event: 'un evento',
  checklist: 'un formato',
  template: 'una plantilla',
  finance: 'la corrida',
  po: 'órdenes de compra',
  campaign: 'la campaña',
  convenios: 'convenios',
  task: 'tareas',
  file: 'archivos',
  studio: 'el sitio público',
  ticketing: 'la boletera',
  chat: 'el chat',
  folder: 'carpetas',
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
  Campaign: 'Campaña',
  TaskAssignment: 'Tarea',
  TicketingSetup: 'Boletera',
  SharedFolder: 'Carpeta',
  User: 'Persona',
  Organization: 'Organización',
  OrgInvite: 'Invitación',
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
  'task.deleted',
  'user.deactivate',
  'user.removed',
  'auth.2fa.disable',
]);

/** Firmas: `checklist.sign.<tipo>`, con el tipo abierto (en inglés o en español). */
function signLabel(action: string): string | null {
  if (!action.startsWith('checklist.sign.')) return null;
  const kind = action.slice('checklist.sign.'.length);
  if (kind.startsWith('authoriz') || kind.startsWith('autoriz')) return 'Autorizó y firmó un formato';
  if (kind.startsWith('deliver') || kind.startsWith('entreg')) return 'Firmó la entrega de un formato';
  if (kind.startsWith('receiv') || kind.startsWith('recib')) return 'Firmó de recibido un formato';
  return 'Firmó un formato';
}

export function auditActionLabel(action: string): string {
  const known = ACTION_LABELS[action] || signLabel(action);
  if (known) return known;
  const area = AREA_LABELS[action.split('.')[0] || ''];
  return area ? `Movimiento en ${area}` : 'Movimiento del sistema';
}

export function auditResourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] || 'Otro';
}

export function isNotableAction(action: string): boolean {
  return NOTABLE.has(action);
}
