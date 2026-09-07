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
  dataJson: {
    sections: Array<{
      id: string;
      title: string;
      items: Array<{
        id: string;
        label: string;
        type?: string;
        done?: boolean;
        value?: string | number | null;
        options?: string[];
      }>;
    }>;
  };
};

export type PoLine = { id?: string; concept: string; qty: number; unitPrice: number; total?: number };
export type Po = {
  id: string;
  rubro: string;
  vendorName?: string | null;
  description?: string | null;
  amount: string | number;
  status: string;
  lines?: PoLine[];
  proofs?: Array<{ id: string; fileUrl: string; label?: string | null }>;
  createdBy?: { fullName: string } | null;
  authorizedBy?: { fullName: string } | null;
};

export type CampaignData = {
  channels?: string;
  budget?: number;
  mediaPlan?: string;
  creatives?: string;
  timeline?: string;
  /**
   * Catálogo del show: cada concepto con precio interno / externo.
   * El encabezado del PDF es fijo; aquí cambian los conceptos por concierto
   * (pedido Arta / Dashboard WhatsApp 2026-09-07).
   */
  concepts?: CampaignConceptRow[];
};

/** Fila editable en la página de campaña (antes de generar el Excel). */
export type CampaignConceptRow = {
  concept: string;
  convenio?: boolean;
  description?: string;
  precioInterno?: number | null;
  precioExterno?: number | null;
  /** Si false, no entra a la hoja de este show. Default true. */
  included?: boolean;
};

export type TicketingSetup = {
  id: string;
  boletera: string;
  logoUrl?: string | null;
  holdUntil?: string | null;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  notes?: string | null;
  zonesJson: Array<{ zona: string; aforo: number; precio: number; sold?: number }>;
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
  fileModuleLabel,
  fileKindLabel,
} from '@/lib/file-modules';

export type EventFile = EventDetail['files'][number];

export type Sponsor = {
  id: string;
  name: string;
  contact?: string | null;
  contribution?: string | null;
  amount?: string | number | null;
  notes?: string | null;
};

export type DirUser = { id: string; fullName: string; email: string };

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
  notes?: string | null;
  checklists: Checklist[];
  purchaseOrders: Po[];
  financeRuns: Array<{ id: string; title: string; locked: boolean; dataJson: FinanceData | unknown }>;
  campaign?: {
    id?: string;
    authorized: boolean;
    type: string;
    notes?: string | null;
    dataJson?: CampaignData | null;
  } | null;
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
