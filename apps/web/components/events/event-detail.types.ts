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

export type Checklist = {
  id: string;
  title: string;
  progressPct: number;
  lastEditedAt?: string | null;
  lastEditedBy?: { fullName: string } | null;
  template?: { key: string };
  pdfUrl?: string | null;
  pdfGeneratedAt?: string | null;
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
  status: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string } | null;
};

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
  files: Array<{ id: string; fileName: string; url: string; kind?: string | null }>;
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
