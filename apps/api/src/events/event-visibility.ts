import { canSeeFormat, canSeeModule, type AccessUser } from '../common/rbac/roles';

/** Secciones de los archivos del evento y el módulo que manda en cada una. */
const FILE_MODULE: Record<string, 'corrida' | 'campaign' | 'convenios' | 'po' | 'ticketing'> = {
  finance: 'corrida',
  campaign: 'campaign',
  sponsors: 'convenios',
  convenios: 'convenios',
  oc: 'po',
  purchase_orders: 'po',
  ticketing: 'ticketing',
};

type RedactableEvent = {
  entity: string;
  checklists?: Array<{ id?: string; template?: { key: string } | null }>;
  purchaseOrders?: unknown[];
  financeRuns?: unknown[];
  campaign?: unknown;
  ticketingSetups?: unknown[];
  sponsors?: unknown[];
  files?: Array<{ module?: string | null; checklistId?: string | null }>;
  slots?: Array<{ kind: string }>;
  tasks?: unknown[];
};

/** Un archivo pedido por su id: misma regla que el listado del evento. */
export function canSeeEventFile(
  user: AccessUser,
  entity: string,
  file: { module?: string | null; checklistId?: string | null; checklist?: { template?: { key: string } | null } | null },
): boolean {
  if (file.checklistId) return canSeeFormat(user, entity, file.checklist?.template?.key ?? '');
  return canSeeModule(user, entity, FILE_MODULE[file.module ?? ''] ?? 'documents');
}

/**
 * El evento completo para el panel, sin lo que esta persona no debe ver. La pestaña oculta no basta:
 * la corrida, los montos de las OC y los formatos de otros viajan en esta respuesta. Lo que se quita
 * se quita aquí, en el servidor (docs/ROLES-Y-PERMISOS.md).
 */
export function redactEventFor<T extends RedactableEvent>(user: AccessUser, event: T): T {
  const see = (module: Parameters<typeof canSeeModule>[2]) => canSeeModule(user, event.entity, module);
  const out = { ...event };
  if (event.checklists) {
    out.checklists = event.checklists.filter((c) => canSeeFormat(user, event.entity, c.template?.key ?? ''));
  }
  if (!see('corrida')) out.financeRuns = [];
  if (!see('po')) out.purchaseOrders = [];
  if (!see('campaign')) out.campaign = null;
  if (!see('ticketing')) out.ticketingSetups = [];
  if (!see('convenios')) out.sponsors = [];
  if (!see('tasks')) out.tasks = [];
  if (event.files) {
    const documents = see('documents');
    // Lo adjunto a un formato sigue al formato: Monse y Kika ven lo de los generales, Iliana lo de catering.
    const formats = new Set((out.checklists ?? []).map((c) => c.id));
    out.files = event.files.filter((f) => {
      if (f.checklistId) return formats.has(f.checklistId);
      const module = FILE_MODULE[f.module ?? ''];
      return module ? see(module) : documents;
    });
  }
  if (event.slots) {
    out.slots = event.slots.filter((s) => {
      if (s.kind === 'CORRIDA') return see('corrida');
      if (s.kind === 'CAMPAIGN') return see('campaign');
      if (s.kind === 'OC') return see('po');
      if (s.kind === 'BOLETERA') return see('ticketing');
      return true;
    });
  }
  return out;
}
