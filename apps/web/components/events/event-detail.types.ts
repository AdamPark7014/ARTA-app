export type SigPayload = {
  signerName?: string;
  imageDataUrl?: string;
  signedAt?: string;
};

export type ChecklistVersion = {
  id: string;
  createdAt: string;
  note?: string | null;
  editedBy?: { fullName: string } | null;
};

export type DocStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SEALED';

export type Checklist = {
  id: string;
  title: string;
  progressPct: number;
  /** Contador de revisiones y token de bloqueo optimista. */
  revision?: number;
  status?: DocStatus;
  sealedAt?: string | null;
  sealedBy?: { fullName: string } | null;
  approvedAt?: string | null;
  submittedAt?: string | null;
  lastEditedAt?: string | null;
  lastEditedBy?: { fullName: string } | null;
  template?: { key: string };
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
  /** Dónde quedó cada dato dentro del PDF, para escribir encima del documento */
  pdfFieldsJson?: {
    pageWidth: number;
    pageHeight: number;
    fields: Array<{
      sectionId: string;
      itemId: string;
      type: 'check' | 'value';
      page: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
  } | null;
  deliveredAt?: string | null;
  deliveredBy?: { fullName: string } | null;
  deliveredSignature?: SigPayload | null;
  authorizedAt?: string | null;
  authorizedBy?: { fullName: string } | null;
  authorizedSignature?: SigPayload | null;
  versions?: ChecklistVersion[];
  /**
   * Solo viene en `GET /checklists/:id`. La LISTA del evento no lo trae: era
   * el 72 % del payload y se volvía a bajar en cada guardado.
   */
  dataJson?: ChecklistData;
};

/**
 * Tipos de campo de un formato (espejo de `apps/api/src/common/format-schema.ts`):
 * check · text · longtext · number · date · time · yesno · select · table ·
 * attachment · signature.
 */
export type ChecklistColumn = {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'time' | 'date';
  width?: number;
  /** Se suma en el pie de la tabla. */
  total?: boolean;
};

export type ChecklistRow = Record<string, string | number | null>;

export type ChecklistItem = {
  id: string;
  label: string;
  type?: string;
  done?: boolean;
  /** Nota corta junto a una casilla (proveedor, quién, cuándo…). */
  note?: string | null;
  value?: string | number | null;
  options?: string[];
  /** Tabla. */
  columns?: ChecklistColumn[];
  rows?: ChecklistRow[];
  minRows?: number;
  totalLabel?: string;
  /** Adjunto del formato (EventFile.id); el nombre o link queda en `value`. */
  fileId?: string | null;
  /** No cuenta para el avance si está vacío. */
  optional?: boolean;
  /** Se rellenó desde el evento al crear el formato. */
  bind?: string;
  /** Ancho en el encabezado (de 12 columnas). */
  cols?: number;
  placeholder?: string;
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
  /** `header`: datos del show en rejilla · `columns`: casillas a dos columnas. */
  layout?: 'list' | 'columns' | 'header';
};

export const YES_LABEL = 'SÍ';
export const NO_LABEL = 'NO';

export function isCheckItem(it: Pick<ChecklistItem, 'type'>): boolean {
  return it.type === 'check' || !it.type;
}

function hasText(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/** Renglones de una tabla con algo escrito. */
export function tableRowsWithContent(rows?: ChecklistRow[] | null): ChecklistRow[] {
  return (Array.isArray(rows) ? rows : []).filter((r) => !!r && Object.values(r).some(hasText));
}

/** Misma regla que el servidor (`isFormatItemComplete`). */
export function isItemDone(it: ChecklistItem): boolean {
  if (isCheckItem(it)) return !!it.done;
  if (it.type === 'table') return tableRowsWithContent(it.rows).length > 0;
  if (it.type === 'attachment') return hasText(it.value) || hasText(it.fileId);
  if (it.type === 'signature') return true;
  return hasText(it.value);
}

/** Un ítem opcional vacío no cuenta para el avance. */
export function isScoringItem(it: ChecklistItem): boolean {
  if (it.type === 'signature') return false;
  return !it.optional || isItemDone(it);
}

/** El contenido del formato. Llega con el formato abierto, no con la lista. */
export type ChecklistData = { sections: ChecklistSection[] };

/**
 * Partida de OC. `unitPrice` puede venir vacío mientras se captura: el «0»
 * pintado en el campo era una de las correcciones de la junta 11-09-2026.
 */
export type PoLine = {
  id?: string;
  concept: string;
  qty: number | null;
  unitPrice: number | null;
  total?: number;
};

export type Po = {
  id: string;
  rubro: string;
  vendorName?: string | null;
  description?: string | null;
  amount: string | number;
  status: string;
  /** EFECTIVO | TRANSFERENCIA | CHEQUE | TARJETA | OTRO — efectivo no pide comprobante. */
  paymentMethod?: string | null;
  /** Machote: PROVEEDOR u OTRO. */
  payeeType?: string | null;
  /** El total lleva IVA encima del subtotal de partidas. */
  withIva?: boolean | null;
  lines?: PoLine[];
  proofs?: Array<{ id: string; fileUrl: string; label?: string | null; amount?: number | string | null }>;
  createdAt?: string;
  authorizedAt?: string | null;
  paidAt?: string | null;
  createdBy?: { fullName: string } | null;
  authorizedBy?: { fullName: string } | null;
};

/** DRAFT → REVIEW → AUTHORIZED → PAID (campaña y campaña de convenios). */
export type ReviewStatus = 'DRAFT' | 'REVIEW' | 'AUTHORIZED' | 'PAID';

export type CampaignData = {
  channels?: string;
  budget?: number;
  mediaPlan?: string;
  creatives?: string;
  timeline?: string;
  /** Conceptos de la campaña: cantidad, fechas y precio interno / externo. */
  concepts?: CampaignConceptRow[];
  /** Campaña de convenios: zona, cantidad, precio y total. */
  convenios?: ConvenioRow[];
};

/** Fila de la campaña publicitaria. */
export type CampaignConceptRow = {
  concept: string;
  /** Cantidad de piezas / periodos. Default 1. */
  qty?: number | null;
  /** Cuándo corre el concepto (YYYY-MM-DD) — alimenta el calendario. */
  from?: string | null;
  to?: string | null;
  precioInterno?: number | null;
  precioExterno?: number | null;
  /** Legado: filas de convenio que vivían en la misma tabla. */
  convenio?: boolean;
  description?: string;
  /** Legado: si false, no entraba a la hoja. */
  included?: boolean;
};

/** Fila de la campaña de convenios: se paga en especie, sin precio interno/externo. */
export type ConvenioRow = {
  concept: string;
  description?: string;
  zona?: string;
  qty?: number | null;
  price?: number | null;
};

export type TicketZoneRow = { zona: string; aforo: number; precio: number; sold?: number };

export type TicketingSetup = {
  id: string;
  boletera: string;
  logoUrl?: string | null;
  holdUntil?: string | null;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  notes?: string | null;
  zonesJson: TicketZoneRow[];
  /** Junta 11-09-2026 — «Creación de boletera». */
  artsUrl?: string | null;
  dateLabel?: string | null;
  functions?: number | null;
  schedule?: string | null;
  description?: string | null;
  holdArtist?: number | null;
  holdPromoter?: number | null;
  holdVenue?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type FinanceRow = { concept: string; type: 'income' | 'expense'; amount: number };
export type FinanceData = { rows: FinanceRow[]; totalIncome?: number; totalExpense?: number };

export type Task = {
  id: string;
  title: string;
  module?: string | null;
  detail?: string | null;
  status: string;
  dueAt?: string | null;
  seenAt?: string | null;
  submittedAt?: string | null;
  completionNote?: string | null;
  rejectionNote?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string } | null;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  rejectedBy?: { id: string; fullName: string } | null;
  evidences?: Array<{ id: string; fileUrl: string; label?: string | null }>;
  activities?: Array<{
    id: string;
    action: string;
    detail?: string | null;
    createdAt: string;
    actor?: { id: string; fullName: string } | null;
  }>;
};

/** Etiqueta de `EventFile.module` — reexport desde file-modules. */
export {
  CAMPAIGN_FILE_MODULE,
  FINANCE_FILE_MODULE,
  CHECKLIST_FILE_MODULE,
  GENERAL_FILE_MODULE,
  OC_PROOF_FILE_MODULE,
  SPONSORS_FILE_MODULE,
  fileModuleLabel,
  fileKindLabel,
} from '@/lib/file-modules';

export type EventFile = EventDetail['files'][number];

export type Sponsor = {
  id: string;
  name: string;
  tier?: string | null;
  status?: string | null;
  contact?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contribution?: string | null;
  amount?: string | number | null;
  benefits?: string | null;
  deliverables?: string | null;
  paymentTerms?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
};

export type DirUser = { id: string; fullName: string; email: string };

export type EventCampaign = {
  id?: string;
  authorized: boolean;
  type: string;
  notes?: string | null;
  dataJson?: CampaignData | null;
  status?: ReviewStatus | string;
  submittedAt?: string | null;
  authorizedAt?: string | null;
  paidAt?: string | null;
  convenioStatus?: ReviewStatus | string;
  convenioSubmittedAt?: string | null;
  updatedAt?: string;
};

export type EventDetail = {
  id: string;
  name: string;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  city?: string | null;
  status: string;
  entity: string;
  campaignType: string;
  startsAt?: string | null;
  /** El API ya lo devolvía y lo aceptaba; el panel nunca lo miró. */
  endsAt?: string | null;
  notes?: string | null;
  /** Junta 11-09-2026: descripción, horario y funciones del show. */
  description?: string | null;
  schedule?: string | null;
  functions?: number | null;
  createdBy?: { id: string; fullName: string } | null;
  checklists: Checklist[];
  purchaseOrders: Po[];
  financeRuns: Array<{ id: string; title: string; locked: boolean; dataJson: FinanceData | unknown }>;
  campaign?: EventCampaign | null;
  ticketingSetups?: TicketingSetup[];
  files: Array<{
    id: string;
    fileName: string;
    url: string;
    kind?: string | null;
    /** Sección: campaign | finance | checklist | general | oc … */
    module?: string | null;
    /** Si cuelga de un formato concreto del evento. */
    checklistId?: string | null;
    /** `false` si el libro trae gráficas o tablas dinámicas: se ve, no se edita. */
    panelEditable?: boolean;
    panelBlockReason?: string | null;
    createdAt?: string;
    updatedAt?: string;
    version?: number;
  }>;
  tasks?: Task[];
  sponsors?: Sponsor[];
};

export type Tab =
  | 'overview'
  | 'checklists'
  | 'ocs'
  | 'finance'
  | 'campaign'
  | 'ticketing'
  | 'tasks'
  | 'sponsors'
  | 'files';

/**
 * Lo que todo panel autónomo del evento recibe.
 *
 * Cada panel guarda por su cuenta y avisa con `onChanged` para que la página
 * recargue el evento; los mensajes van por `flash` a la barra común.
 */
export type EventPanelProps = {
  event: EventDetail;
  /** Evento cerrado o cancelado: todo en solo lectura. */
  closed: boolean;
  onChanged: () => Promise<void> | void;
  flash: (text: string, variant?: 'success' | 'error' | 'info' | 'warn') => void;
};

export const emptyFinance = (): FinanceData => ({
  rows: [
    { concept: 'Taquilla estimada', type: 'income', amount: 0 },
    { concept: 'Patrocinios', type: 'income', amount: 0 },
    { concept: 'Producción', type: 'expense', amount: 0 },
  ],
  totalIncome: 0,
  totalExpense: 0,
});

export function asFinance(data: unknown): FinanceData {
  const d = data as FinanceData | null;
  if (d?.rows?.length) return { rows: d.rows.map((r) => ({ ...r, amount: Number(r.amount || 0) })), totalIncome: d.totalIncome, totalExpense: d.totalExpense };
  return emptyFinance();
}
