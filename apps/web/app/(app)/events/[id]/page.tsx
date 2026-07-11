'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { FileViewer } from '@/components/files/FileViewer';
import { userHasPermission } from '@/lib/access-matrix';
import { importFinanceFromFile } from '@/lib/finance-import';

type SigPayload = {
  signerName?: string;
  imageDataUrl?: string;
  signedAt?: string;
};

type ChecklistVersion = {
  id: string;
  createdAt: string;
  note?: string | null;
  editedBy?: { fullName: string } | null;
};

type Checklist = {
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

type PoLine = { id?: string; concept: string; qty: number; unitPrice: number; total?: number };
type Po = {
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

type CampaignData = {
  channels?: string;
  budget?: number;
  mediaPlan?: string;
  creatives?: string;
  timeline?: string;
};

type TicketingSetup = {
  id: string;
  boletera: string;
  holdUntil?: string | null;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  notes?: string | null;
  zonesJson: Array<{ zona: string; aforo: number; precio: number }>;
};

type FinanceRow = { concept: string; type: 'income' | 'expense'; amount: number };
type FinanceData = { rows: FinanceRow[]; totalIncome?: number; totalExpense?: number };

type Task = {
  id: string;
  title: string;
  module?: string | null;
  status: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string } | null;
};

type Sponsor = {
  id: string;
  name: string;
  contact?: string | null;
  contribution?: string | null;
  amount?: string | number | null;
  notes?: string | null;
};

type DirUser = { id: string; fullName: string; email: string };

type EventDetail = {
  id: string;
  name: string;
  artist?: string | null;
  promoter?: string | null;
  venue?: string | null;
  city?: string | null;
  status: string;
  entity: string;
  campaignType: string;
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

type Tab =
  | 'overview'
  | 'checklists'
  | 'ocs'
  | 'finance'
  | 'campaign'
  | 'ticketing'
  | 'tasks'
  | 'sponsors'
  | 'files';

const emptyFinance = (): FinanceData => ({
  rows: [
    { concept: 'Taquilla estimada', type: 'income', amount: 0 },
    { concept: 'Patrocinios', type: 'income', amount: 0 },
    { concept: 'Producción', type: 'expense', amount: 0 },
  ],
  totalIncome: 0,
  totalExpense: 0,
});

function asFinance(data: unknown): FinanceData {
  const d = data as FinanceData | null;
  if (d?.rows?.length) return { rows: d.rows.map((r) => ({ ...r, amount: Number(r.amount || 0) })), totalIncome: d.totalIncome, totalExpense: d.totalExpense };
  return emptyFinance();
}

export default function EventDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Evento">
          <p className="muted">Cargando…</p>
        </AppShell>
      }
    >
      <EventDetailInner />
    </Suspense>
  );
}

function EventDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user } = useUser();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [saving, setSaving] = useState(false);
  const [poForm, setPoForm] = useState({
    rubro: 'audio',
    vendorName: '',
    description: '',
    lines: [{ concept: '', qty: 1, unitPrice: 0 }] as PoLine[],
  });
  const [msg, setMsg] = useState('');
  const [financeDraft, setFinanceDraft] = useState<FinanceData>(emptyFinance());
  const [financeId, setFinanceId] = useState<string | null>(null);
  const [financeLocked, setFinanceLocked] = useState(false);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [taskForm, setTaskForm] = useState({ title: '', module: '', assigneeId: '', dueAt: '' });
  const [sponsorForm, setSponsorForm] = useState({ name: '', contact: '', contribution: '', amount: '', notes: '' });
  const [previewFile, setPreviewFile] = useState<EventDetail['files'][0] | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    type: 'INTERNAL',
    notes: '',
    channels: '',
    budget: '',
    mediaPlan: '',
    creatives: '',
    timeline: '',
  });
  const [ticketForm, setTicketForm] = useState({
    boletera: 'Arema',
    holdUntil: '',
    artist: '',
    promoter: '',
    notes: '',
  });
  const [ticketZones, setTicketZones] = useState([
    { zona: 'Diamante', aforo: 0, precio: 0 },
    { zona: 'Oro', aforo: 0, precio: 0 },
    { zona: 'Plata', aforo: 0, precio: 0 },
    { zona: 'Bronce', aforo: 0, precio: 0 },
  ]);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);

  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editPoLines, setEditPoLines] = useState<PoLine[]>([]);
  const [editPoMeta, setEditPoMeta] = useState({ vendorName: '', description: '' });
  const [eventNotes, setEventNotes] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({
    name: '',
    artist: '',
    promoter: '',
    venue: '',
    city: '',
  });
  const [vendorPins, setVendorPins] = useState<
    Array<{ id: string; label: string; scopes: string[]; active: boolean; expiresAt?: string | null }>
  >([]);
  const [pinForm, setPinForm] = useState({ label: 'Vendor', pin: '', scopes: 'files,checklists' });
  const [revealedPin, setRevealedPin] = useState<{ path: string; pin: string } | null>(null);

  const closed = event?.status === 'CLOSED' || event?.status === 'CANCELLED';
  const canClose = userHasPermission(user?.roleKey || '', user?.permissions || [], ['event.close', 'everything']);
  const canFinance = userHasPermission(user?.roleKey || '', user?.permissions || [], ['finance.edit', 'everything']);
  const canCampaign = userHasPermission(user?.roleKey || '', user?.permissions || [], ['campaign.edit', 'everything']);
  const canTicketing = userHasPermission(user?.roleKey || '', user?.permissions || [], ['ticketing.edit', 'everything']);
  const canVendorPin = userHasPermission(user?.roleKey || '', user?.permissions || [], ['vendor.pin', 'everything']);
  const canReopen = user?.roleKey === 'dir_general' || user?.roleKey === 'super_admin';
  const canDeleteEvent = user?.roleKey === 'dir_general' || user?.roleKey === 'super_admin';

  const load = useCallback(async () => {
    const data = await api<EventDetail>(`/events/${id}`);
    setEvent(data);
    if (activeChecklist) {
      try {
        const full = await api<Checklist>(`/checklists/${activeChecklist.id}`);
        setActiveChecklist(full);
      } catch {
        const refreshed = data.checklists.find((c) => c.id === activeChecklist.id);
        if (refreshed) setActiveChecklist(refreshed);
      }
    }
    const run = data.financeRuns?.[0];
    if (run) {
      setFinanceId(run.id);
      setFinanceLocked(run.locked);
      setFinanceDraft(asFinance(run.dataJson));
    }
    const camp = data.campaign;
    const dj = (camp?.dataJson || {}) as CampaignData;
    setCampaignForm({
      type: camp?.type || data.campaignType || 'INTERNAL',
      notes: camp?.notes || '',
      channels: dj.channels || '',
      budget: dj.budget != null ? String(dj.budget) : '',
      mediaPlan: dj.mediaPlan || '',
      creatives: dj.creatives || '',
      timeline: dj.timeline || '',
    });
    setEventNotes(data.notes || '');
    setMetaForm({
      name: data.name || '',
      artist: data.artist || '',
      promoter: data.promoter || '',
      venue: data.venue || '',
      city: data.city || '',
    });
  }, [id, activeChecklist?.id]);

  useEffect(() => {
    load().catch(console.error);
    api<DirUser[]>('/users/directory').then(setDirectory).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function openChecklist(c: Checklist) {
    setTab('checklists');
    setActiveChecklist(c);
    try {
      const full = await api<Checklist>(`/checklists/${c.id}`);
      setActiveChecklist(full);
    } catch {
      /* keep list payload */
    }
  }

  // Deep-link: ?tab=&checklist=
  useEffect(() => {
    if (!event) return;
    const qTab = searchParams.get('tab') as Tab | null;
    const qChecklist = searchParams.get('checklist');
    if (qTab) setTab(qTab);
    if (qChecklist) {
      const found = event.checklists.find((c) => c.id === qChecklist);
      if (found) {
        setTab('checklists');
        openChecklist(found).catch(console.error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, searchParams]);

  useEffect(() => {
    if (!canVendorPin) return;
    api<typeof vendorPins>(`/vendor/event/${id}`)
      .then(setVendorPins)
      .catch(() => undefined);
  }, [id, canVendorPin]);

  const modules = useMemo(() => {
    if (!event) return [];
    return [
      { key: 'checklists', label: 'Checklists', count: event.checklists.length },
      { key: 'ocs', label: 'Órdenes de compra', count: event.purchaseOrders.length },
      { key: 'finance', label: 'Corrida', count: event.financeRuns.length },
      { key: 'campaign', label: 'Campaña', count: event.campaign ? 1 : 0 },
      { key: 'ticketing', label: 'Boletera', count: event.ticketingSetups?.length || 0 },
      { key: 'tasks', label: 'Tareas', count: event.tasks?.length || 0 },
      { key: 'sponsors', label: 'Patrocinios', count: event.sponsors?.length || 0 },
      { key: 'files', label: 'Excel / PDF', count: event.files.length },
    ] as const;
  }, [event]);

  async function saveChecklist() {
    if (!activeChecklist || closed) return;
    setSaving(true);
    setMsg('');
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dataJson: activeChecklist.dataJson }),
      });
      setActiveChecklist(updated);
      setMsg('Checklist guardado · PDF regenerado');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function signChecklist(kind: 'ENTREGADO' | 'AUTORIZADO', payload: { imageDataUrl: string; signerName: string }) {
    if (!activeChecklist || closed) return;
    const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ kind, ...payload }),
    });
    setActiveChecklist(updated);
    setMsg(`Firma ${kind.toLowerCase()} guardada`);
    await load();
  }

  async function regeneratePdf() {
    if (!activeChecklist) return;
    const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/pdf`, { method: 'POST' });
    setActiveChecklist(updated);
    setMsg('PDF regenerado');
    await load();
  }

  async function restoreChecklistVersion(versionId: string) {
    if (!activeChecklist || closed) return;
    if (!confirm('¿Restaurar esta versión? Se crea una nueva entrada en el historial y se regenera el PDF.')) return;
    setSaving(true);
    setMsg('');
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/restore/${versionId}`, {
        method: 'POST',
      });
      const full = await api<Checklist>(`/checklists/${activeChecklist.id}`);
      setActiveChecklist({ ...updated, versions: full.versions });
      setMsg('Versión restaurada · PDF regenerado');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al restaurar');
    } finally {
      setSaving(false);
    }
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<Checklist['dataJson']['sections'][0]['items'][0]>) {
    if (!activeChecklist) return;
    setActiveChecklist({
      ...activeChecklist,
      dataJson: {
        sections: activeChecklist.dataJson.sections.map((s) =>
          s.id !== sectionId
            ? s
            : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) },
        ),
      },
    });
  }

  async function createPo() {
    if (closed) return;
    const lines = poForm.lines.filter((l) => l.concept.trim());
    await api('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        eventId: id,
        rubro: poForm.rubro,
        vendorName: poForm.vendorName || undefined,
        description: poForm.description || undefined,
        ...(lines.length
          ? {
              lines: lines.map((l) => ({
                concept: l.concept,
                qty: Number(l.qty),
                unitPrice: Number(l.unitPrice),
              })),
            }
          : { amount: poLinesTotal }),
      }),
    });
    setPoForm({
      rubro: 'audio',
      vendorName: '',
      description: '',
      lines: [{ concept: '', qty: 1, unitPrice: 0 }],
    });
    await load();
    setTab('ocs');
  }

  async function saveCampaign() {
    if (!canCampaign || closed) return;
    setSaving(true);
    try {
      await api(`/campaigns/event/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: campaignForm.type,
          notes: campaignForm.notes || undefined,
          dataJson: {
            channels: campaignForm.channels,
            budget: campaignForm.budget ? Number(campaignForm.budget) : 0,
            mediaPlan: campaignForm.mediaPlan,
            creatives: campaignForm.creatives,
            timeline: campaignForm.timeline,
          },
        }),
      });
      setMsg('Campaña guardada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCampaignAuth(authorized: boolean) {
    await api(`/campaigns/event/${id}`, {
      method: 'POST',
      body: JSON.stringify({ authorized }),
    });
    await load();
  }

  async function saveTicketing() {
    if (!canTicketing || closed) return;
    setSaving(true);
    try {
      const payload = {
        boletera: ticketForm.boletera,
        holdUntil: ticketForm.holdUntil || undefined,
        artist: ticketForm.artist || undefined,
        promoter: ticketForm.promoter || undefined,
        notes: ticketForm.notes || undefined,
        zonesJson: ticketZones,
      };
      if (editingTicketId) {
        await api(`/ticketing/${editingTicketId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Boletera actualizada');
      } else {
        await api(`/ticketing/event/${id}`, { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Boletera creada');
      }
      setEditingTicketId(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  function editTicketing(t: TicketingSetup) {
    setEditingTicketId(t.id);
    setTicketForm({
      boletera: t.boletera,
      holdUntil: t.holdUntil ? t.holdUntil.slice(0, 10) : '',
      artist: t.artist || '',
      promoter: t.promoter || '',
      notes: t.notes || '',
    });
    setTicketZones(
      (t.zonesJson || []).map((z) => ({
        zona: z.zona,
        aforo: Number(z.aforo || 0),
        precio: Number(z.precio || 0),
      })),
    );
    setTab('ticketing');
  }

  async function deleteTicketing(tid: string) {
    await api(`/ticketing/${tid}`, { method: 'DELETE' });
    if (editingTicketId === tid) setEditingTicketId(null);
    await load();
  }

  const poLinesTotal = poForm.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

  async function setPoStatus(poId: string, status: string) {
    if (closed) return;
    await api(`/purchase-orders/${poId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  function startEditPo(po: Po) {
    setEditingPoId(po.id);
    setEditPoMeta({ vendorName: po.vendorName || '', description: po.description || '' });
    setEditPoLines(
      po.lines?.length
        ? po.lines.map((l) => ({
            concept: l.concept,
            qty: Number(l.qty),
            unitPrice: Number(l.unitPrice),
          }))
        : [{ concept: '', qty: 1, unitPrice: 0 }],
    );
  }

  async function saveEditPo() {
    if (!editingPoId || closed) return;
    const lines = editPoLines.filter((l) => l.concept.trim());
    await api(`/purchase-orders/${editingPoId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        vendorName: editPoMeta.vendorName || undefined,
        description: editPoMeta.description || undefined,
        lines: lines.map((l) => ({
          concept: l.concept,
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice),
        })),
      }),
    });
    setEditingPoId(null);
    setMsg('OC actualizada');
    await load();
  }

  async function onUpload(file: File) {
    if (closed) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('eventId', id);
    if (activeChecklist) fd.append('checklistId', activeChecklist.id);
    await api('/uploads', { method: 'POST', body: fd });
    await load();
    setMsg(`Archivo ${file.name} embebido`);
  }

  async function closeEvent() {
    if (!confirm('¿Cerrar evento? La corrida quedará bloqueada.')) return;
    await api(`/events/${id}/close`, { method: 'POST' });
    setMsg('Evento cerrado');
    await load();
  }

  async function reopenEvent() {
    await api(`/events/${id}/reopen`, { method: 'POST' });
    setMsg('Evento reabierto');
    await load();
  }

  async function saveEventNotes() {
    if (closed) return;
    await api(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes: eventNotes }),
    });
    setMsg('Notas del evento guardadas');
    await load();
  }

  async function saveEventMeta() {
    if (closed) return;
    await api(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(metaForm),
    });
    setEditingMeta(false);
    setMsg('Datos del evento actualizados');
    await load();
  }

  async function cancelEvent() {
    if (!confirm('¿Cancelar evento?')) return;
    await api(`/events/${id}/cancel`, { method: 'POST' });
    setMsg('Evento cancelado');
    await load();
  }

  async function deleteEvent() {
    if (!confirm('¿ELIMINAR evento y todo su contenido? Esta acción no se puede deshacer.')) return;
    await api(`/events/${id}`, { method: 'DELETE' });
    window.location.href = '/events';
  }

  async function deletePo(poId: string) {
    if (!confirm('¿Eliminar OC pendiente?')) return;
    await api(`/purchase-orders/${poId}`, { method: 'DELETE' });
    setMsg('OC eliminada');
    await load();
  }

  async function createVendorPin() {
    if (!pinForm.pin || pinForm.pin.length < 4) {
      setMsg('PIN mínimo 4 caracteres');
      return;
    }
    const res = await api<{ id: string; portalPath: string; pin: string }>('/vendor/pins', {
      method: 'POST',
      body: JSON.stringify({
        eventId: id,
        label: pinForm.label,
        pin: pinForm.pin,
        scopes: pinForm.scopes.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    setRevealedPin({ path: res.portalPath, pin: res.pin });
    setPinForm({ label: 'Vendor', pin: '', scopes: 'files,checklists' });
    const list = await api<typeof vendorPins>(`/vendor/event/${id}`);
    setVendorPins(list);
    setMsg('PIN vendor creado — cópialo ahora');
  }

  async function deactivatePin(pinId: string) {
    await api(`/vendor/pins/${pinId}`, { method: 'DELETE' });
    setVendorPins((prev) => prev.map((p) => (p.id === pinId ? { ...p, active: false } : p)));
  }

  async function deleteFile(fileId: string) {
    if (!confirm('¿Eliminar archivo?')) return;
    await api(`/uploads/${fileId}`, { method: 'DELETE' });
    if (previewFile?.id === fileId) setPreviewFile(null);
    setMsg('Archivo eliminado');
    await load();
  }

  async function saveFinance() {
    if (!financeId || financeLocked || !canFinance) return;
    setSaving(true);
    try {
      await api(`/finance/${financeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dataJson: financeDraft }),
      });
      setMsg('Corrida guardada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function importFinanceExcel(file: File) {
    if (!canFinance || financeLocked || closed) return;
    setSaving(true);
    setMsg('');
    try {
      const data = await importFinanceFromFile(file);
      setFinanceDraft(data);
      if (financeId) {
        await api(`/finance/${financeId}`, {
          method: 'PATCH',
          body: JSON.stringify({ dataJson: data }),
        });
        // also keep a copy of the excel on the event
        const fd = new FormData();
        fd.append('file', file);
        fd.append('eventId', id);
        fd.append('kind', 'excel');
        await api('/uploads', { method: 'POST', body: fd }).catch(() => undefined);
        setMsg(`Importadas ${data.rows.length} filas desde Excel`);
        await load();
      } else {
        setMsg(`Vista previa: ${data.rows.length} filas (guarda para persistir)`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setSaving(false);
    }
  }

  function patchFinanceRow(idx: number, patch: Partial<FinanceRow>) {
    setFinanceDraft((prev) => {
      const rows = prev.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      const totalIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);
      return { rows, totalIncome, totalExpense };
    });
  }

  async function createTask() {
    if (!taskForm.title || closed) return;
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        eventId: id,
        title: taskForm.title,
        module: taskForm.module || undefined,
        assigneeId: taskForm.assigneeId || undefined,
        dueAt: taskForm.dueAt || undefined,
      }),
    });
    setTaskForm({ title: '', module: '', assigneeId: '', dueAt: '' });
    setMsg('Tarea creada');
    await load();
  }

  async function setTaskStatus(taskId: string, status: string) {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  async function createSponsor() {
    if (!sponsorForm.name || closed) return;
    await api('/sponsors', {
      method: 'POST',
      body: JSON.stringify({
        eventId: id,
        name: sponsorForm.name,
        contact: sponsorForm.contact || undefined,
        contribution: sponsorForm.contribution || undefined,
        amount: sponsorForm.amount ? Number(sponsorForm.amount) : undefined,
        notes: sponsorForm.notes || undefined,
      }),
    });
    setSponsorForm({ name: '', contact: '', contribution: '', amount: '', notes: '' });
    setMsg('Patrocinador agregado');
    await load();
  }

  async function removeSponsor(sid: string) {
    await api(`/sponsors/${sid}`, { method: 'DELETE' });
    await load();
  }

  if (!event) {
    return (
      <AppShell title="Evento">
        <p className="muted">Cargando evento…</p>
      </AppShell>
    );
  }

  const net = Number(financeDraft.totalIncome || 0) - Number(financeDraft.totalExpense || 0);

  return (
    <AppShell title={event.name}>
      <div className="stack">
        <div className="panel">
          <div className="panel-body">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="muted" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {event.entity} · {event.status}
                </div>
                <h2 style={{ margin: '0.2rem 0 0.4rem', fontFamily: 'var(--font-display)', fontSize: '1.7rem' }}>
                  {event.name}
                </h2>
                <div className="muted">
                  {[event.artist, event.promoter, event.venue, event.city].filter(Boolean).join(' · ') || 'Sin meta'}
                </div>
              </div>
              <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className="badge">{event.campaignType}</span>
                {event.campaign?.authorized ? <span className="badge ok">Campaña autorizada</span> : null}
                {closed ? <span className="badge warn">Cerrado</span> : null}
                {!closed ? (
                  <button className="btn ghost" type="button" onClick={() => setEditingMeta((v) => !v)}>
                    {editingMeta ? 'Cerrar edición' : 'Editar datos'}
                  </button>
                ) : null}
                {!closed && canClose ? (
                  <button className="btn ghost" type="button" onClick={closeEvent}>
                    Cerrar evento
                  </button>
                ) : null}
                {!closed && canClose ? (
                  <button className="btn ghost" type="button" onClick={cancelEvent}>
                    Cancelar
                  </button>
                ) : null}
                {closed && canReopen ? (
                  <button className="btn" type="button" onClick={reopenEvent}>
                    Reabrir
                  </button>
                ) : null}
                {canDeleteEvent ? (
                  <button className="btn ghost" type="button" onClick={deleteEvent}>
                    Eliminar
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${tab === 'overview' ? '' : 'ghost'}`} type="button" onClick={() => setTab('overview')}>
            Resumen
          </button>
          {modules.map((m) => (
            <button
              key={m.key}
              className={`btn ${tab === m.key ? '' : 'ghost'}`}
              type="button"
              onClick={() => {
                setTab(m.key as Tab);
                setActiveChecklist(null);
              }}
            >
              {m.label} ({m.count})
            </button>
          ))}
        </div>

        {msg ? <div className="muted">{msg}</div> : null}
        {closed ? <div className="badge warn">Evento en solo lectura</div> : null}

        {tab === 'overview' && (
          <div className="stack">
            {editingMeta && !closed ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>Editar datos del evento</h2>
                  <button className="btn" type="button" onClick={saveEventMeta}>
                    Guardar
                  </button>
                </div>
                <div className="panel-body">
                  <div className="form" style={{ maxWidth: 720 }}>
                    <label>
                      Nombre
                      <input
                        value={metaForm.name}
                        onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        Artista
                        <input
                          value={metaForm.artist}
                          onChange={(e) => setMetaForm({ ...metaForm, artist: e.target.value })}
                        />
                      </label>
                      <label>
                        Promotor
                        <input
                          value={metaForm.promoter}
                          onChange={(e) => setMetaForm({ ...metaForm, promoter: e.target.value })}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        Venue
                        <input
                          value={metaForm.venue}
                          onChange={(e) => setMetaForm({ ...metaForm, venue: e.target.value })}
                        />
                      </label>
                      <label>
                        Ciudad
                        <input
                          value={metaForm.city}
                          onChange={(e) => setMetaForm({ ...metaForm, city: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="panel">
              <div className="panel-head">
                <h2>Notas del evento</h2>
                {!closed ? (
                  <button className="btn ghost" type="button" onClick={saveEventNotes}>
                    Guardar notas
                  </button>
                ) : null}
              </div>
              <div className="panel-body">
                <textarea
                  rows={3}
                  disabled={closed}
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Notas operativas, acuerdos, pendientes…"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {canVendorPin ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>PIN vendor / portal externo</h2>
                </div>
                <div className="panel-body stack">
                  {!closed ? (
                    <div className="form" style={{ maxWidth: 640 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <label>
                          Etiqueta
                          <input
                            value={pinForm.label}
                            onChange={(e) => setPinForm({ ...pinForm, label: e.target.value })}
                          />
                        </label>
                        <label>
                          PIN
                          <input
                            value={pinForm.pin}
                            onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value })}
                            placeholder="mín. 4"
                          />
                        </label>
                        <label>
                          Scopes
                          <input
                            value={pinForm.scopes}
                            onChange={(e) => setPinForm({ ...pinForm, scopes: e.target.value })}
                          />
                        </label>
                      </div>
                      <button className="btn" type="button" onClick={createVendorPin}>
                        Generar link + PIN
                      </button>
                    </div>
                  ) : null}
                  {revealedPin ? (
                    <div className="badge ok">
                      Portal: {revealedPin.path} · PIN: {revealedPin.pin} (cópialo ahora)
                    </div>
                  ) : null}
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Link</th>
                        <th>Scopes</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorPins.map((p) => (
                        <tr key={p.id}>
                          <td>{p.label}</td>
                          <td>
                            <a href={`/v/${p.id}`} target="_blank" rel="noreferrer">
                              /v/{p.id}
                            </a>
                          </td>
                          <td className="muted">{p.scopes.join(', ')}</td>
                          <td>
                            <span className={`badge ${p.active ? 'ok' : 'warn'}`}>
                              {p.active ? 'Activo' : 'Off'}
                            </span>
                          </td>
                          <td>
                            {p.active ? (
                              <button className="btn ghost" type="button" onClick={() => deactivatePin(p.id)}>
                                Desactivar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {!vendorPins.length ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            Sin PINs aún.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="grid-cards">
              {event.checklists.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="kpi"
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                  onClick={() => openChecklist(c)}
                >
                  <div className="label">{c.template?.key || 'CHECK'}</div>
                  <div style={{ fontWeight: 600, margin: '0.4rem 0' }}>{c.title}</div>
                  <div className="progress">
                    <span style={{ width: `${c.progressPct}%` }} />
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    {c.progressPct}%
                    {c.pdfUrl ? ' · PDF listo' : ''}
                    {c.authorizedAt ? ' · Autorizado' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'checklists' && (
          <div style={{ display: 'grid', gridTemplateColumns: activeChecklist ? '280px 1fr' : '1fr', gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h2>Formatos</h2>
              </div>
              <div className="panel-body stack">
                {event.checklists.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn ${activeChecklist?.id === c.id ? '' : 'ghost'}`}
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => openChecklist(c)}
                  >
                    {c.title} · {c.progressPct}%
                  </button>
                ))}
              </div>
            </div>

            {activeChecklist ? (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h2>{activeChecklist.title}</h2>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {activeChecklist.lastEditedBy
                        ? `Última: ${activeChecklist.lastEditedBy.fullName}`
                        : 'Sin ediciones'}
                    </div>
                  </div>
                  <div className="row">
                    {activeChecklist.pdfUrl ? (
                      <a className="btn" href={activeChecklist.pdfUrl} target="_blank" rel="noreferrer">
                        Abrir PDF
                      </a>
                    ) : (
                      <button className="btn" type="button" onClick={regeneratePdf}>
                        Generar PDF
                      </button>
                    )}
                    {activeChecklist.pdfUrl ? (
                      <button className="btn ghost" type="button" onClick={regeneratePdf}>
                        Regenerar PDF
                      </button>
                    ) : null}
                    {!closed ? (
                      <label className="btn ghost" style={{ cursor: 'pointer' }}>
                        Subir Excel/PDF
                        <input
                          type="file"
                          hidden
                          accept=".pdf,.xlsx,.xls,.csv,image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onUpload(f);
                          }}
                        />
                      </label>
                    ) : null}
                    <button className="btn" type="button" disabled={saving || closed} onClick={saveChecklist}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
                <div className="panel-body">
                  {(activeChecklist.dataJson?.sections || [])
                    .filter((section) => section.id !== 'firmas')
                    .map((section) => (
                      <div className="check-section" key={section.id}>
                        <h3>{section.title}</h3>
                        {section.items.map((item) => (
                          <div className="check-item" key={item.id}>
                            {item.type === 'check' || !item.type ? (
                              <input
                                type="checkbox"
                                disabled={closed}
                                checked={!!item.done}
                                onChange={(e) => updateItem(section.id, item.id, { done: e.target.checked })}
                              />
                            ) : (
                              <span />
                            )}
                            <div>
                              <div>{item.label}</div>
                              {item.type === 'text' || item.type === 'number' || item.type === 'date' ? (
                                <input
                                  style={{ marginTop: 6, width: '100%' }}
                                  type={item.type === 'text' ? 'text' : item.type}
                                  disabled={closed}
                                  value={item.value ?? ''}
                                  onChange={(e) =>
                                    updateItem(section.id, item.id, {
                                      value: item.type === 'number' ? Number(e.target.value) : e.target.value,
                                    })
                                  }
                                />
                              ) : null}
                              {item.type === 'select' ? (
                                <select
                                  style={{ marginTop: 6, width: '100%' }}
                                  disabled={closed}
                                  value={String(item.value ?? '')}
                                  onChange={(e) => updateItem(section.id, item.id, { value: e.target.value })}
                                >
                                  {(item.options || []).map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                  <div className="check-section">
                    <h3>Firmas digitales</h3>
                    <div className="sig-grid">
                      <SignaturePad
                        label="Entregado"
                        signerName={user?.fullName || ''}
                        existing={activeChecklist.deliveredSignature}
                        onSign={(p) => signChecklist('ENTREGADO', p)}
                      />
                      <SignaturePad
                        label="Autorizado"
                        signerName={user?.fullName || ''}
                        existing={activeChecklist.authorizedSignature}
                        onSign={(p) => signChecklist('AUTORIZADO', p)}
                      />
                    </div>
                  </div>

                  <div className="check-section">
                    <h3>PDF embebido</h3>
                    {activeChecklist.pdfUrl ? (
                      <FileViewer
                        url={activeChecklist.pdfUrl}
                        fileName={`${activeChecklist.title}.pdf`}
                        kind="pdf"
                      />
                    ) : (
                      <p className="muted">
                        Aún no hay PDF. Guarda el checklist o pulsa <strong>Generar PDF</strong> — se
                        incrusta aquí automáticamente.
                      </p>
                    )}
                  </div>

                  <div className="check-section">
                    <h3>Historial de versiones</h3>
                    {(activeChecklist.versions || []).length ? (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Editor</th>
                            <th>Nota</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {(activeChecklist.versions || []).map((v) => (
                            <tr key={v.id}>
                              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                                {new Date(v.createdAt).toLocaleString('es-MX')}
                              </td>
                              <td>{v.editedBy?.fullName || '—'}</td>
                              <td className="muted">{v.note || '—'}</td>
                              <td>
                                {!closed ? (
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    disabled={saving}
                                    onClick={() => restoreChecklistVersion(v.id)}
                                  >
                                    Restaurar
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="muted">Sin versiones guardadas aún (aparecen al editar).</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted">Elige un checklist / formato.</p>
            )}
          </div>
        )}

        {tab === 'ocs' && (
          <div className="stack">
            {!closed ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>Nueva orden de compra</h2>
                </div>
                <div className="panel-body">
                  <div className="form" style={{ maxWidth: 820 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        Rubro
                        <select value={poForm.rubro} onChange={(e) => setPoForm({ ...poForm, rubro: e.target.value })}>
                          {['audio', 'luces', 'planta_luz', 'hospedaje', 'transporte', 'catering', 'artes', 'otro'].map(
                            (r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        Vendor
                        <input
                          value={poForm.vendorName}
                          onChange={(e) => setPoForm({ ...poForm, vendorName: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Descripción
                      <input
                        value={poForm.description}
                        onChange={(e) => setPoForm({ ...poForm, description: e.target.value })}
                      />
                    </label>
                    <div>
                      <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
                        Partidas · total ${poLinesTotal.toLocaleString('es-MX')}
                      </div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Cant.</th>
                            <th>P. unit.</th>
                            <th>Total</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {poForm.lines.map((line, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  value={line.concept}
                                  onChange={(e) => {
                                    const lines = [...poForm.lines];
                                    lines[idx] = { ...line, concept: e.target.value };
                                    setPoForm({ ...poForm, lines });
                                  }}
                                  placeholder="Concepto"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={line.qty}
                                  onChange={(e) => {
                                    const lines = [...poForm.lines];
                                    lines[idx] = { ...line, qty: Number(e.target.value) };
                                    setPoForm({ ...poForm, lines });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={line.unitPrice}
                                  onChange={(e) => {
                                    const lines = [...poForm.lines];
                                    lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                                    setPoForm({ ...poForm, lines });
                                  }}
                                />
                              </td>
                              <td className="muted">
                                ${(Number(line.qty || 0) * Number(line.unitPrice || 0)).toLocaleString('es-MX')}
                              </td>
                              <td>
                                <button
                                  className="btn ghost"
                                  type="button"
                                  onClick={() =>
                                    setPoForm({
                                      ...poForm,
                                      lines: poForm.lines.filter((_, i) => i !== idx),
                                    })
                                  }
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          setPoForm({
                            ...poForm,
                            lines: [...poForm.lines, { concept: '', qty: 1, unitPrice: 0 }],
                          })
                        }
                      >
                        + Partida
                      </button>
                    </div>
                    <button className="btn" type="button" onClick={createPo}>
                      Crear OC
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="panel">
              <div className="panel-head">
                <h2>Flujo: pendiente → autorizado → pagado</h2>
              </div>
              <div className="panel-body stack">
                {event.purchaseOrders.map((po) => (
                  <div key={po.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{po.rubro}</strong> · {po.vendorName || 'Sin vendor'} · $
                        {Number(po.amount).toLocaleString('es-MX')}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {po.description || ''}
                        </div>
                      </div>
                      <div className="row">
                        <span className={`badge ${po.status === 'PAID' ? 'ok' : 'warn'}`}>{po.status}</span>
                        {!closed && po.status === 'PENDING_AUTH' ? (
                          <>
                            <button className="btn ghost" type="button" onClick={() => startEditPo(po)}>
                              Editar
                            </button>
                            <button className="btn ghost" type="button" onClick={() => setPoStatus(po.id, 'AUTHORIZED')}>
                              Autorizar
                            </button>
                            <button className="btn ghost" type="button" onClick={() => deletePo(po.id)}>
                              Eliminar
                            </button>
                          </>
                        ) : null}
                        {!closed && po.status === 'AUTHORIZED' ? (
                          <button className="btn ghost" type="button" onClick={() => setPoStatus(po.id, 'PAID')}>
                            Marcar pagado
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {editingPoId === po.id ? (
                      <div className="form" style={{ marginTop: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <label>
                            Vendor
                            <input
                              value={editPoMeta.vendorName}
                              onChange={(e) => setEditPoMeta({ ...editPoMeta, vendorName: e.target.value })}
                            />
                          </label>
                          <label>
                            Descripción
                            <input
                              value={editPoMeta.description}
                              onChange={(e) => setEditPoMeta({ ...editPoMeta, description: e.target.value })}
                            />
                          </label>
                        </div>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Concepto</th>
                              <th>Cant.</th>
                              <th>P. unit.</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {editPoLines.map((line, idx) => (
                              <tr key={idx}>
                                <td>
                                  <input
                                    value={line.concept}
                                    onChange={(e) => {
                                      const lines = [...editPoLines];
                                      lines[idx] = { ...line, concept: e.target.value };
                                      setEditPoLines(lines);
                                    }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    value={line.qty}
                                    onChange={(e) => {
                                      const lines = [...editPoLines];
                                      lines[idx] = { ...line, qty: Number(e.target.value) };
                                      setEditPoLines(lines);
                                    }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => {
                                      const lines = [...editPoLines];
                                      lines[idx] = { ...line, unitPrice: Number(e.target.value) };
                                      setEditPoLines(lines);
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={() => setEditPoLines(editPoLines.filter((_, i) => i !== idx))}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="row">
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              setEditPoLines([...editPoLines, { concept: '', qty: 1, unitPrice: 0 }])
                            }
                          >
                            + Partida
                          </button>
                          <button className="btn" type="button" onClick={saveEditPo}>
                            Guardar OC
                          </button>
                          <button className="btn ghost" type="button" onClick={() => setEditingPoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : po.lines?.length ? (
                      <table className="table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Cant.</th>
                            <th>P. unit.</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {po.lines.map((l) => (
                            <tr key={l.id || `${l.concept}-${l.qty}`}>
                              <td>{l.concept}</td>
                              <td>{Number(l.qty)}</td>
                              <td>${Number(l.unitPrice).toLocaleString('es-MX')}</td>
                              <td>${Number(l.total ?? Number(l.qty) * Number(l.unitPrice)).toLocaleString('es-MX')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                ))}
                {!event.purchaseOrders.length ? <p className="muted">Sin OC aún.</p> : null}
              </div>
            </div>
          </div>
        )}

        {tab === 'finance' && (
          <div className="panel">
            <div className="panel-head">
              <h2>Corrida financiera</h2>
              <div className="row">
                {financeLocked ? <span className="badge">LOCKED</span> : null}
                <span className="badge warn">Melissa · Chacho · Arturo</span>
                {canFinance && !financeLocked && !closed ? (
                  <>
                    <label className="btn ghost" style={{ cursor: 'pointer' }}>
                      Importar Excel
                      <input
                        type="file"
                        hidden
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) importFinanceExcel(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button className="btn" type="button" disabled={saving} onClick={saveFinance}>
                      {saving ? 'Guardando…' : 'Guardar corrida'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="panel-body stack">
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Excel: columnas Concepto / Tipo (ingreso|egreso) / Monto. Si no hay encabezado, usa las primeras 3
                columnas.
              </p>
              <div className="row" style={{ gap: 24 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Ingresos
                  </div>
                  <strong>${Number(financeDraft.totalIncome || 0).toLocaleString('es-MX')}</strong>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Egresos
                  </div>
                  <strong>${Number(financeDraft.totalExpense || 0).toLocaleString('es-MX')}</strong>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Neto
                  </div>
                  <strong style={{ color: net >= 0 ? 'var(--ok, #2a7)' : 'var(--danger)' }}>
                    ${net.toLocaleString('es-MX')}
                  </strong>
                </div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {financeDraft.rows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          disabled={!canFinance || financeLocked || closed}
                          value={row.concept}
                          onChange={(e) => patchFinanceRow(idx, { concept: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <select
                          disabled={!canFinance || financeLocked || closed}
                          value={row.type}
                          onChange={(e) => patchFinanceRow(idx, { type: e.target.value as 'income' | 'expense' })}
                        >
                          <option value="income">Ingreso</option>
                          <option value="expense">Egreso</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          disabled={!canFinance || financeLocked || closed}
                          value={row.amount}
                          onChange={(e) => patchFinanceRow(idx, { amount: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        {canFinance && !financeLocked && !closed ? (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              setFinanceDraft((prev) => ({
                                ...prev,
                                rows: prev.rows.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canFinance && !financeLocked && !closed ? (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    setFinanceDraft((prev) => ({
                      ...prev,
                      rows: [...prev.rows, { concept: '', type: 'expense', amount: 0 }],
                    }))
                  }
                >
                  + Fila
                </button>
              ) : null}
            </div>
          </div>
        )}

        {tab === 'campaign' && (
          <div className="panel">
            <div className="panel-head">
              <h2>Campaña publicitaria</h2>
              <div className="row">
                {event.campaign?.authorized ? <span className="badge ok">Autorizada</span> : <span className="badge warn">Sin autorizar</span>}
                {canCampaign && !closed ? (
                  <>
                    <button className="btn" type="button" disabled={saving} onClick={saveCampaign}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                    {!event.campaign?.authorized ? (
                      <button className="btn ghost" type="button" onClick={() => toggleCampaignAuth(true)}>
                        Autorizar
                      </button>
                    ) : (
                      <button className="btn ghost" type="button" onClick={() => toggleCampaignAuth(false)}>
                        Quitar auth
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </div>
            <div className="panel-body">
              <div className="form" style={{ maxWidth: 720 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>
                    Tipo
                    <select
                      disabled={!canCampaign || closed}
                      value={campaignForm.type}
                      onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value })}
                    >
                      <option value="INTERNAL">Interna</option>
                      <option value="EXTERNAL">Externa</option>
                      <option value="NONE">Ninguna</option>
                    </select>
                  </label>
                  <label>
                    Presupuesto
                    <input
                      type="number"
                      disabled={!canCampaign || closed}
                      value={campaignForm.budget}
                      onChange={(e) => setCampaignForm({ ...campaignForm, budget: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Canales
                  <input
                    disabled={!canCampaign || closed}
                    value={campaignForm.channels}
                    onChange={(e) => setCampaignForm({ ...campaignForm, channels: e.target.value })}
                    placeholder="Meta, Google, radio, OOH…"
                  />
                </label>
                <label>
                  Plan de medios
                  <textarea
                    rows={3}
                    disabled={!canCampaign || closed}
                    value={campaignForm.mediaPlan}
                    onChange={(e) => setCampaignForm({ ...campaignForm, mediaPlan: e.target.value })}
                  />
                </label>
                <label>
                  Creatividades / artes
                  <textarea
                    rows={2}
                    disabled={!canCampaign || closed}
                    value={campaignForm.creatives}
                    onChange={(e) => setCampaignForm({ ...campaignForm, creatives: e.target.value })}
                  />
                </label>
                <label>
                  Timeline
                  <input
                    disabled={!canCampaign || closed}
                    value={campaignForm.timeline}
                    onChange={(e) => setCampaignForm({ ...campaignForm, timeline: e.target.value })}
                    placeholder="Teaser → on sale → show week"
                  />
                </label>
                <label>
                  Notas
                  <textarea
                    rows={2}
                    disabled={!canCampaign || closed}
                    value={campaignForm.notes}
                    onChange={(e) => setCampaignForm({ ...campaignForm, notes: e.target.value })}
                  />
                </label>
                {!canCampaign ? <p className="muted">Solo Melissa y Williams editan campaña.</p> : null}
              </div>
            </div>
          </div>
        )}

        {tab === 'ticketing' && (
          <div className="stack">
            {canTicketing && !closed ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>{editingTicketId ? 'Editar boletera' : 'Nueva boletera'}</h2>
                  {editingTicketId ? (
                    <button className="btn ghost" type="button" onClick={() => setEditingTicketId(null)}>
                      Cancelar edición
                    </button>
                  ) : null}
                </div>
                <div className="panel-body">
                  <div className="form">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <label>
                        Boletera
                        <select
                          value={ticketForm.boletera}
                          onChange={(e) => setTicketForm({ ...ticketForm, boletera: e.target.value })}
                        >
                          <option>Arema</option>
                          <option>eTicket</option>
                          <option>Otra</option>
                        </select>
                      </label>
                      <label>
                        Hold hasta
                        <input
                          type="date"
                          value={ticketForm.holdUntil}
                          onChange={(e) => setTicketForm({ ...ticketForm, holdUntil: e.target.value })}
                        />
                      </label>
                      <label>
                        Artista
                        <input
                          value={ticketForm.artist}
                          onChange={(e) => setTicketForm({ ...ticketForm, artist: e.target.value })}
                        />
                      </label>
                    </div>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Zona</th>
                          <th>Aforo</th>
                          <th>Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticketZones.map((z, i) => (
                          <tr key={z.zona}>
                            <td>{z.zona}</td>
                            <td>
                              <input
                                type="number"
                                value={z.aforo}
                                onChange={(e) => {
                                  const next = [...ticketZones];
                                  next[i] = { ...z, aforo: Number(e.target.value) };
                                  setTicketZones(next);
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={z.precio}
                                onChange={(e) => {
                                  const next = [...ticketZones];
                                  next[i] = { ...z, precio: Number(e.target.value) };
                                  setTicketZones(next);
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <label>
                      Notas
                      <input
                        value={ticketForm.notes}
                        onChange={(e) => setTicketForm({ ...ticketForm, notes: e.target.value })}
                      />
                    </label>
                    <button className="btn" type="button" disabled={saving} onClick={saveTicketing}>
                      {saving ? 'Guardando…' : editingTicketId ? 'Actualizar' : 'Crear boletera'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel-head">
                <h2>Configuraciones</h2>
              </div>
              <div className="panel-body">
                {(event.ticketingSetups || []).map((t) => (
                  <div key={t.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <strong>{t.boletera}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Hold: {t.holdUntil ? new Date(t.holdUntil).toLocaleDateString('es-MX') : '—'} ·{' '}
                        {(t.zonesJson || []).map((z) => `${z.zona}:${z.aforo}`).join(' · ')}
                      </div>
                    </div>
                    <div className="row">
                      {canTicketing && !closed ? (
                        <>
                          <button className="btn ghost" type="button" onClick={() => editTicketing(t)}>
                            Editar
                          </button>
                          <button className="btn ghost" type="button" onClick={() => deleteTicketing(t.id)}>
                            Eliminar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!event.ticketingSetups?.length ? <p className="muted">Sin boletera aún.</p> : null}
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="stack">
            {!closed ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>Asignar tarea</h2>
                </div>
                <div className="panel-body">
                  <div className="form" style={{ maxWidth: 720 }}>
                    <label>
                      Título
                      <input
                        value={taskForm.title}
                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                        placeholder="Ej. Confirmar hospedaje artista"
                      />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <label>
                        Módulo
                        <input
                          value={taskForm.module}
                          onChange={(e) => setTaskForm({ ...taskForm, module: e.target.value })}
                          placeholder="producción / hospitality…"
                        />
                      </label>
                      <label>
                        Asignado a
                        <select
                          value={taskForm.assigneeId}
                          onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
                        >
                          <option value="">Sin asignar</option>
                          {directory.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Vence
                        <input
                          type="date"
                          value={taskForm.dueAt}
                          onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })}
                        />
                      </label>
                    </div>
                    <button className="btn" type="button" onClick={createTask}>
                      Crear tarea
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel-head">
                <h2>Tareas del evento</h2>
              </div>
              <div className="panel-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tarea</th>
                      <th>Módulo</th>
                      <th>Asignado</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(event.tasks || []).map((t) => (
                      <tr key={t.id}>
                        <td>{t.title}</td>
                        <td className="muted">{t.module || '—'}</td>
                        <td>{t.assignee?.fullName || '—'}</td>
                        <td>
                          <span className={`badge ${t.status === 'DONE' ? 'ok' : 'warn'}`}>{t.status}</span>
                        </td>
                        <td className="row">
                          {t.status !== 'DONE' ? (
                            <button className="btn ghost" type="button" onClick={() => setTaskStatus(t.id, 'DONE')}>
                              Hecha
                            </button>
                          ) : (
                            <button className="btn ghost" type="button" onClick={() => setTaskStatus(t.id, 'OPEN')}>
                              Reabrir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!event.tasks?.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Sin tareas aún.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'sponsors' && (
          <div className="stack">
            {!closed ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>Nuevo patrocinador</h2>
                </div>
                <div className="panel-body">
                  <div className="form" style={{ maxWidth: 720 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        Nombre
                        <input
                          value={sponsorForm.name}
                          onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                        />
                      </label>
                      <label>
                        Contacto
                        <input
                          value={sponsorForm.contact}
                          onChange={(e) => setSponsorForm({ ...sponsorForm, contact: e.target.value })}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        Aportación
                        <input
                          value={sponsorForm.contribution}
                          onChange={(e) => setSponsorForm({ ...sponsorForm, contribution: e.target.value })}
                          placeholder="especie / cash / media"
                        />
                      </label>
                      <label>
                        Monto
                        <input
                          type="number"
                          value={sponsorForm.amount}
                          onChange={(e) => setSponsorForm({ ...sponsorForm, amount: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Notas
                      <input
                        value={sponsorForm.notes}
                        onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                      />
                    </label>
                    <button className="btn" type="button" onClick={createSponsor}>
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel-head">
                <h2>Patrocinadores</h2>
              </div>
              <div className="panel-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Contacto</th>
                      <th>Aportación</th>
                      <th>Monto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(event.sponsors || []).map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.contact || '—'}</td>
                        <td>{s.contribution || '—'}</td>
                        <td>{s.amount != null ? `$${Number(s.amount).toLocaleString('es-MX')}` : '—'}</td>
                        <td>
                          {!closed ? (
                            <button className="btn ghost" type="button" onClick={() => removeSponsor(s.id)}>
                              Quitar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!event.sponsors?.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Sin patrocinadores.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <h2>Exceles y PDFs embebidos</h2>
                {!closed ? (
                  <label className="btn" style={{ cursor: 'pointer' }}>
                    Subir archivo
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.xlsx,.xls,.csv,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload(f);
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div className="panel-body">
                {!event.files.length ? (
                  <p className="muted">Sube Excel o PDF del evento para verlo embebido aquí.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Archivo</th>
                        <th>Tipo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.files.map((f) => (
                        <tr key={f.id}>
                          <td>{f.fileName}</td>
                          <td>
                            <span className="badge">{f.kind || 'file'}</span>
                          </td>
                          <td className="row">
                            <button className="btn ghost" type="button" onClick={() => setPreviewFile(f)}>
                              Ver
                            </button>
                            <a href={f.url} target="_blank" rel="noreferrer">
                              Descargar
                            </a>
                            {!closed ? (
                              <button className="btn ghost" type="button" onClick={() => deleteFile(f.id)}>
                                Eliminar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {previewFile ? (
              <div className="panel">
                <div className="panel-head">
                  <h2>{previewFile.fileName}</h2>
                  <button className="btn ghost" type="button" onClick={() => setPreviewFile(null)}>
                    Cerrar
                  </button>
                </div>
                <div className="panel-body">
                  <FileViewer url={previewFile.url} fileName={previewFile.fileName} kind={previewFile.kind} />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
