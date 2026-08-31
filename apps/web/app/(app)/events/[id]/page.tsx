'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EventDetailSkeleton } from '@/components/events/EventDetailSkeleton';
import { EventContextHint } from '@/components/events/EventContextHint';
import { EventTabBar } from '@/components/events/EventTabBar';
import { useEventTab } from '@/components/events/useEventTab';
import { EventHero } from '@/components/ui/EventHero';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlashMessage } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { importFinanceFromFile } from '@/lib/finance-import';
import { fetchPoWindow, type PoWindowState } from '@/lib/po-window';
import { EventOverviewPanel } from '@/components/events/EventOverviewPanel';
import { EventChecklistsPanel } from '@/components/events/EventChecklistsPanel';
import { EventPurchaseOrdersPanel } from '@/components/events/EventPurchaseOrdersPanel';
import { EventFinancePanel } from '@/components/events/EventFinancePanel';
import { EventCampaignPanel } from '@/components/events/EventCampaignPanel';
import { EventTicketingPanel } from '@/components/events/EventTicketingPanel';
import { EventTasksPanel } from '@/components/events/EventTasksPanel';
import { EventSponsorsPanel } from '@/components/events/EventSponsorsPanel';
import { EventFilesPanel } from '@/components/events/EventFilesPanel';
import {
  asFinance,
  CAMPAIGN_FILE_MODULE,
  emptyFinance,
  type Checklist,
  type DirUser,
  type EventDetail,
  type FinanceRow,
  type FinanceData,
  type CampaignData,
  type PoLine,
  type Po,
  type Tab,
  type TicketingSetup,
} from '@/components/events/event-detail.types';

export default function EventDetailPage() {
  return (
    <Suspense fallback={<EventDetailSkeleton />}>
      <EventDetailInner />
    </Suspense>
  );
}

function EventDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user } = useUser();
  const { tab, selectTab } = useEventTab();
  const checklistBootRef = useRef(false);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [saving, setSaving] = useState(false);
  const [poForm, setPoForm] = useState({
    rubro: 'audio',
    vendorName: '',
    description: '',
    lines: [{ concept: '', qty: 1, unitPrice: 0 }] as PoLine[],
  });
  const [msg, setMsg] = useState('');
  const [msgVariant, setMsgVariant] = useState<'success' | 'error' | 'info' | 'warn'>('success');
  const [financeDraft, setFinanceDraft] = useState<FinanceData>(emptyFinance());
  const [financeId, setFinanceId] = useState<string | null>(null);
  const [financeLocked, setFinanceLocked] = useState(false);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [taskForm, setTaskForm] = useState({ title: '', module: '', assigneeId: '', dueAt: '', detail: '' });
  const [sponsorForm, setSponsorForm] = useState({ name: '', contact: '', contribution: '', amount: '', notes: '' });
  const [previewFile, setPreviewFile] = useState<EventDetail['files'][0] | null>(null);
  const [poWindow, setPoWindow] = useState<PoWindowState | null>(null);
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
    logoUrl: '',
    holdUntil: '',
    artist: '',
    promoter: '',
    notes: '',
  });
  const [ticketZones, setTicketZones] = useState([
    { zona: 'Diamante', aforo: 0, precio: 0, sold: 0 },
    { zona: 'Oro', aforo: 0, precio: 0, sold: 0 },
    { zona: 'Plata', aforo: 0, precio: 0, sold: 0 },
    { zona: 'Bronce', aforo: 0, precio: 0, sold: 0 },
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
  const [pinForm, setPinForm] = useState({
    label: 'Proveedor',
    pin: '',
    scopes: ['files', 'checklists'] as string[],
    expiresAt: '',
  });
  const [revealedPin, setRevealedPin] = useState<{ path: string; pin: string } | null>(null);

  const closed = event?.status === 'CLOSED' || event?.status === 'CANCELLED';
  const canClose = userHasPermission(user?.roleKey || '', user?.permissions || [], ['event.close', 'everything']);
  const canFinance = userHasPermission(user?.roleKey || '', user?.permissions || [], ['finance.edit', 'everything']);
  const canSeeFinance = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'finance.view',
    'finance.edit',
    'everything',
  ]);
  const canCampaign = userHasPermission(user?.roleKey || '', user?.permissions || [], ['campaign.edit', 'everything']);
  const canSeeCampaign = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'campaign.view',
    'campaign.edit',
    'everything',
  ]);
  const canTicketing = userHasPermission(user?.roleKey || '', user?.permissions || [], ['ticketing.edit', 'everything']);
  const canVendorPin = userHasPermission(user?.roleKey || '', user?.permissions || [], ['vendor.pin', 'everything']);
  const canAuthorize = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'po.authorize',
    'everything',
  ]);
  const canMarkPaid = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'po.mark_paid',
    'everything',
  ]);
  const canChecklistEdit = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'checklist.edit',
    'everything',
  ]);
  const canSponsors = canChecklistEdit;
  const canPo = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'checklist.edit',
    'po.authorize',
    'po.mark_paid',
    'everything',
  ]);
  const canReopen = user?.roleKey === 'dir_general' || user?.roleKey === 'super_admin';
  const canDeleteEvent = user?.roleKey === 'dir_general' || user?.roleKey === 'super_admin';

  const load = useCallback(async () => {
    const data = await api<EventDetail>(`/events/${id}`);
    setEvent(data);
    setLoadError('');
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
    setLoading(true);
    load()
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el evento'))
      .finally(() => setLoading(false));
    api<DirUser[]>('/users/directory').then(setDirectory).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function openChecklist(c: Checklist) {
    selectTab('checklists', { checklist: c.id });
    setActiveChecklist(c);
    try {
      const full = await api<Checklist>(`/checklists/${c.id}`);
      setActiveChecklist(full);
    } catch {
      /* keep list payload */
    }
  }

  function selectModule(next: Tab) {
    if (next !== 'checklists') setActiveChecklist(null);
    selectTab(next);
  }

  // Deep-link: ?checklist=
  useEffect(() => {
    if (!event || checklistBootRef.current) return;
    const qChecklist = searchParams.get('checklist');
    if (!qChecklist) return;
    const found = event.checklists.find((c) => c.id === qChecklist);
    if (!found) return;
    checklistBootRef.current = true;
    openChecklist(found).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, searchParams]);

  // Ventana de solicitud de OC: se consulta una vez por visita al hub.
  useEffect(() => {
    fetchPoWindow()
      .then(setPoWindow)
      .catch(() => setPoWindow(null));
  }, []);

  useEffect(() => {
    if (!canVendorPin) return;
    api<typeof vendorPins>(`/vendor/event/${id}`)
      .then(setVendorPins)
      .catch(() => undefined);
  }, [id, canVendorPin]);

  /** Excel / PDF que cuelgan de la campaña (module=campaign). */
  const campaignFiles = useMemo(
    () => (event?.files || []).filter((f) => f.module === CAMPAIGN_FILE_MODULE),
    [event],
  );

  const modules = useMemo(() => {
    if (!event) return [];
    const all = [
      { key: 'checklists', label: 'Checklists', count: event.checklists.length },
      { key: 'ocs', label: 'Órdenes de compra', count: event.purchaseOrders.length },
      { key: 'finance', label: 'Corrida', count: event.financeRuns.length },
      {
        key: 'campaign',
        label: 'Campaña',
        count: (event.campaign ? 1 : 0) + campaignFiles.length,
      },
      { key: 'ticketing', label: 'Boletera', count: event.ticketingSetups?.length || 0 },
      { key: 'tasks', label: 'Tareas', count: event.tasks?.length || 0 },
      { key: 'sponsors', label: 'Convenios y patrocinios', count: event.sponsors?.length || 0 },
      { key: 'files', label: 'Documentos', count: event.files.length },
    ] as const;
    return all.filter((m) => {
      if (m.key === 'ocs') return canPo;
      if (m.key === 'finance') return canSeeFinance;
      if (m.key === 'campaign') return canSeeCampaign;
      if (m.key === 'ticketing') return canTicketing;
      if (m.key === 'sponsors') return canSponsors;
      return true;
    });
  }, [event, campaignFiles, canPo, canSeeFinance, canSeeCampaign, canTicketing, canSponsors]);

  const heroStats = useMemo(() => {
    if (!event) return undefined;
    const avgProgress = event.checklists.length
      ? Math.round(
          event.checklists.reduce((s, c) => s + (c.progressPct || 0), 0) / event.checklists.length,
        )
      : 0;
    const showLabel = event.startsAt
      ? new Date(event.startsAt).toLocaleDateString('es-MX', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : undefined;
    let daysLabel: string | undefined;
    if (event.startsAt) {
      const days = Math.ceil((new Date(event.startsAt).getTime() - Date.now()) / 86400000);
      if (days < 0) daysLabel = 'Show pasado';
      else if (days === 0) daysLabel = 'Show hoy';
      else if (days === 1) daysLabel = 'Show mañana';
      else daysLabel = `Faltan ${days} días`;
    }
    return { avgProgress, showLabel, daysLabel };
  }, [event]);

  function flash(text: string, variant: 'success' | 'error' | 'info' | 'warn' = 'success') {
    setMsg(text);
    setMsgVariant(variant);
  }

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
      flash('Checklist guardado · PDF regenerado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function signChecklist(kind: 'ENTREGADO' | 'AUTORIZADO', payload: { imageDataUrl: string; signerName: string }) {
    if (!activeChecklist || closed) return;
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({ kind, ...payload }),
      });
      setActiveChecklist(updated);
      flash(`Firma ${kind.toLowerCase()} guardada`);
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al firmar', 'error');
    }
  }

  async function regeneratePdf() {
    if (!activeChecklist) return;
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/pdf`, { method: 'POST' });
      setActiveChecklist(updated);
      flash('PDF regenerado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al regenerar PDF', 'error');
    }
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
      flash('Versión restaurada · PDF regenerado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al restaurar', 'error');
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
    setMsg('');
    try {
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
    } catch (e) {
      // Fuera de la ventana de OC el servidor responde 403 con el horario.
      flash(e instanceof Error ? e.message : 'No se pudo crear la OC', 'error');
      fetchPoWindow()
        .then(setPoWindow)
        .catch(() => undefined);
      return;
    }
    setPoForm({
      rubro: 'audio',
      vendorName: '',
      description: '',
      lines: [{ concept: '', qty: 1, unitPrice: 0 }],
    });
    flash('OC creada');
    await load();
    selectTab('ocs');
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
      flash('Campaña guardada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al guardar campaña', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCampaignAuth(authorized: boolean) {
    try {
      await api(`/campaigns/event/${id}`, {
        method: 'POST',
        body: JSON.stringify({ authorized }),
      });
      flash(authorized ? 'Campaña autorizada' : 'Autorización retirada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al autorizar campaña', 'error');
    }
  }

  async function saveTicketing() {
    if (!canTicketing || closed) return;
    setSaving(true);
    try {
      const payload = {
        boletera: ticketForm.boletera,
        logoUrl: ticketForm.logoUrl || '',
        holdUntil: ticketForm.holdUntil || undefined,
        artist: ticketForm.artist || undefined,
        promoter: ticketForm.promoter || undefined,
        notes: ticketForm.notes || undefined,
        zonesJson: ticketZones,
      };
      if (editingTicketId) {
        await api(`/ticketing/${editingTicketId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        flash('Boletera actualizada');
      } else {
        await api(`/ticketing/event/${id}`, { method: 'POST', body: JSON.stringify(payload) });
        flash('Boletera creada');
      }
      setEditingTicketId(null);
      setTicketForm((f) => ({ ...f, boletera: 'Arema', logoUrl: '', holdUntil: '', notes: '' }));
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al guardar boletera', 'error');
    } finally {
      setSaving(false);
    }
  }

  function editTicketing(t: TicketingSetup) {
    setEditingTicketId(t.id);
    setTicketForm({
      boletera: t.boletera,
      logoUrl: t.logoUrl || '',
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
        sold: Number(z.sold || 0),
      })),
    );
    selectTab('ticketing');
  }

  async function deleteTicketing(tid: string) {
    try {
      await api(`/ticketing/${tid}`, { method: 'DELETE' });
      if (editingTicketId === tid) setEditingTicketId(null);
      flash('Boletera eliminada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar boletera', 'error');
    }
  }

  const poLinesTotal = poForm.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);

  async function setPoStatus(poId: string, status: string) {
    if (closed) return;
    try {
      await api(`/purchase-orders/${poId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      flash('Estado de OC actualizado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al cambiar estado de OC', 'error');
    }
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
    try {
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
      flash('OC actualizada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al actualizar OC', 'error');
    }
  }

  async function onUpload(file: File) {
    if (closed) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', id);
      if (activeChecklist) fd.append('checklistId', activeChecklist.id);
      await api('/uploads', { method: 'POST', body: fd });
      await load();
      flash(`Archivo ${file.name} embebido`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al subir archivo', 'error');
    }
  }

  /**
   * Junta 2026-08-28: el Excel y/o PDF de la campaña se suben, se actualizan y
   * se consultan desde el propio evento. Se etiquetan con `module=campaign`
   * para que la sección de Campaña los liste aparte.
   */
  async function uploadCampaignFile(file: File) {
    if (closed || !canCampaign) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', id);
      fd.append('module', CAMPAIGN_FILE_MODULE);
      await api('/uploads', { method: 'POST', body: fd });
      await load();
      flash(`${file.name} agregado a la campaña`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al subir archivo de campaña', 'error');
    }
  }

  /** Actualizar = subir la versión nueva y retirar la anterior. */
  async function replaceCampaignFile(fileId: string, file: File) {
    if (closed || !canCampaign) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', id);
      fd.append('module', CAMPAIGN_FILE_MODULE);
      await api('/uploads', { method: 'POST', body: fd });
      await api(`/uploads/${fileId}`, { method: 'DELETE' }).catch(() => undefined);
      await load();
      flash(`Campaña actualizada con ${file.name}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al actualizar archivo de campaña', 'error');
    }
  }

  async function deleteCampaignFile(fileId: string) {
    if (closed || !canCampaign) return;
    if (!confirm('¿Eliminar este archivo de la campaña?')) return;
    try {
      await api(`/uploads/${fileId}`, { method: 'DELETE' });
      await load();
      flash('Archivo de campaña eliminado');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar archivo', 'error');
    }
  }

  async function closeEvent() {
    if (!confirm('¿Cerrar evento? La corrida quedará bloqueada.')) return;
    try {
      await api(`/events/${id}/close`, { method: 'POST' });
      flash('Evento cerrado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al cerrar evento', 'error');
    }
  }

  async function reopenEvent() {
    try {
      await api(`/events/${id}/reopen`, { method: 'POST' });
      flash('Evento reabierto');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al reabrir evento', 'error');
    }
  }

  async function saveEventNotes() {
    if (closed) return;
    try {
      await api(`/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: eventNotes }),
      });
      flash('Notas del evento guardadas');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al guardar notas', 'error');
    }
  }

  async function saveEventMeta() {
    if (closed) return;
    try {
      await api(`/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(metaForm),
      });
      setEditingMeta(false);
      flash('Datos del evento actualizados');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al actualizar datos', 'error');
    }
  }

  async function cancelEvent() {
    if (!confirm('¿Cancelar evento?')) return;
    try {
      await api(`/events/${id}/cancel`, { method: 'POST' });
      flash('Evento cancelado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al cancelar evento', 'error');
    }
  }

  async function deleteEvent() {
    if (!confirm('¿ELIMINAR evento y todo su contenido? Esta acción no se puede deshacer.')) return;
    try {
      await api(`/events/${id}`, { method: 'DELETE' });
      window.location.href = '/events';
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar evento', 'error');
    }
  }

  async function deletePo(poId: string) {
    if (!confirm('¿Eliminar OC pendiente?')) return;
    try {
      await api(`/purchase-orders/${poId}`, { method: 'DELETE' });
      flash('OC eliminada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar OC', 'error');
    }
  }

  async function createVendorPin() {
    if (!pinForm.pin || pinForm.pin.length < 4) {
      flash('PIN mínimo 4 caracteres', 'warn');
      return;
    }
    if (!pinForm.scopes.length) {
      flash('Elige al menos un scope', 'warn');
      return;
    }
    try {
      const res = await api<{ id: string; portalPath: string; pin: string }>('/vendor/pins', {
        method: 'POST',
        body: JSON.stringify({
          eventId: id,
          label: pinForm.label,
          pin: pinForm.pin,
          scopes: pinForm.scopes,
          expiresAt: pinForm.expiresAt || undefined,
        }),
      });
      setRevealedPin({ path: res.portalPath, pin: res.pin });
      setPinForm({ label: 'Proveedor', pin: '', scopes: ['files', 'checklists'], expiresAt: '' });
      const list = await api<typeof vendorPins>(`/vendor/event/${id}`);
      setVendorPins(list);
      flash('PIN de proveedor creado — cópialo ahora');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al crear PIN', 'error');
    }
  }

  async function deactivatePin(pinId: string) {
    try {
      await api(`/vendor/pins/${pinId}`, { method: 'DELETE' });
      setVendorPins((prev) => prev.map((p) => (p.id === pinId ? { ...p, active: false } : p)));
      flash('PIN desactivado');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al desactivar PIN', 'error');
    }
  }

  async function deleteFile(fileId: string) {
    if (!confirm('¿Eliminar archivo?')) return;
    try {
      await api(`/uploads/${fileId}`, { method: 'DELETE' });
      if (previewFile?.id === fileId) setPreviewFile(null);
      flash('Archivo eliminado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar archivo', 'error');
    }
  }

  async function saveFinance() {
    if (!financeId || financeLocked || !canFinance) return;
    setSaving(true);
    try {
      await api(`/finance/${financeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dataJson: financeDraft }),
      });
      flash('Corrida guardada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al guardar corrida', 'error');
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
        flash(`Importadas ${data.rows.length} filas desde Excel`);
        await load();
      } else {
        flash(`Vista previa: ${data.rows.length} filas (guarda para persistir)`, 'info');
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al importar', 'error');
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
    try {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          eventId: id,
          title: taskForm.title,
          module: taskForm.module || undefined,
          detail: taskForm.detail || undefined,
          assigneeId: taskForm.assigneeId || undefined,
          dueAt: taskForm.dueAt || undefined,
        }),
      });
      const who = directory.find((d) => d.id === taskForm.assigneeId)?.fullName;
      setTaskForm({ title: '', module: '', assigneeId: '', dueAt: '', detail: '' });
      flash(who ? `Tarea asignada a ${who} — le llega el aviso en su panel` : 'Tarea creada');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al crear tarea', 'error');
    }
  }

  async function setTaskStatus(taskId: string, status: string) {
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al actualizar tarea', 'error');
    }
  }

  /** Pasar la tarea a otra persona sin salir del evento. */
  async function reassignTask(taskId: string, assigneeId: string) {
    try {
      await api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      flash(assigneeId ? 'Tarea reasignada — se envió el aviso' : 'Tarea sin asignar');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al reasignar tarea', 'error');
    }
  }

  async function createSponsor() {
    if (!sponsorForm.name || closed) return;
    try {
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
      flash('Patrocinador agregado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al agregar patrocinador', 'error');
    }
  }

  async function removeSponsor(sid: string) {
    try {
      await api(`/sponsors/${sid}`, { method: 'DELETE' });
      flash('Patrocinador eliminado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al eliminar patrocinador', 'error');
    }
  }

  async function updateSponsor(
    sid: string,
    patch: { name?: string; contact?: string; contribution?: string; amount?: number; notes?: string },
  ) {
    try {
      await api(`/sponsors/${sid}`, { method: 'PATCH', body: JSON.stringify(patch) });
      flash('Patrocinador actualizado');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al actualizar patrocinador', 'error');
    }
  }

  if (loading && !event) {
    return <EventDetailSkeleton />;
  }

  if (loadError && !event) {
    return (
      <AppShell title="Evento">
        <EmptyState
          title="No se pudo cargar el evento"
          description={loadError}
          actionHref="/events"
          actionLabel="Volver al pipeline"
        />
      </AppShell>
    );
  }

  if (!event) {
    return <EventDetailSkeleton />;
  }

  return (
    <AppShell title={event.name}>
      <div className="stack page-workspace">
        <EventHero
          entity={event.entity}
          status={event.status}
          name={event.name}
          meta={[event.artist, event.promoter, event.venue, event.city].filter(Boolean).join(' · ') || 'Sin meta'}
          campaignType={event.campaignType}
          campaignAuthorized={!!event.campaign?.authorized}
          closed={closed}
          stats={heroStats}
          actions={
            <>
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
              {closed && canReopen ? (
                <button className="btn" type="button" onClick={reopenEvent}>
                  Reabrir
                </button>
              ) : null}
            </>
          }
          dangerActions={
            <>
              {!closed && canClose ? (
                <button className="btn ghost btn-danger" type="button" onClick={cancelEvent}>
                  Cancelar evento
                </button>
              ) : null}
              {canDeleteEvent ? (
                <button className="btn ghost btn-danger" type="button" onClick={deleteEvent}>
                  Eliminar evento
                </button>
              ) : null}
            </>
          }
        />

        <EventTabBar tab={tab} modules={modules} onSelect={selectModule} />

        <EventContextHint tab={tab} />

        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}
        {closed ? <FlashMessage variant="warn">Evento en solo lectura — no se pueden editar datos.</FlashMessage> : null}

        {tab === 'overview' && (
          <EventOverviewPanel
            event={event}
            closed={closed}
            editingMeta={editingMeta}
            metaForm={metaForm}
            setMetaForm={setMetaForm}
            saveEventMeta={saveEventMeta}
            eventNotes={eventNotes}
            setEventNotes={setEventNotes}
            saveEventNotes={saveEventNotes}
            canVendorPin={canVendorPin}
            vendorPins={vendorPins}
            pinForm={pinForm}
            setPinForm={setPinForm}
            createVendorPin={createVendorPin}
            revealedPin={revealedPin}
            deactivatePin={deactivatePin}
            onOpenChecklist={openChecklist}
            onGoModule={selectModule}
          />
        )}

        {tab === 'checklists' && (
          <EventChecklistsPanel
            event={event}
            activeChecklist={activeChecklist}
            closed={closed || !canChecklistEdit}
            saving={saving}
            userFullName={user?.fullName || ''}
            onOpenChecklist={openChecklist}
            onClearChecklist={() => setActiveChecklist(null)}
            onSaveChecklist={saveChecklist}
            onRegeneratePdf={regeneratePdf}
            onUpload={onUpload}
            onUpdateItem={updateItem}
            onSignChecklist={signChecklist}
            onRestoreVersion={restoreChecklistVersion}
            onFilesChanged={load}
          />
        )}

        {tab === 'ocs' && (
          <EventPurchaseOrdersPanel
            closed={closed}
            canAuthorize={canAuthorize}
            canMarkPaid={canMarkPaid}
            poForm={poForm}
            setPoForm={setPoForm}
            poLinesTotal={poLinesTotal}
            onCreatePo={createPo}
            purchaseOrders={event.purchaseOrders}
            editingPoId={editingPoId}
            setEditingPoId={setEditingPoId}
            editPoMeta={editPoMeta}
            setEditPoMeta={setEditPoMeta}
            editPoLines={editPoLines}
            setEditPoLines={setEditPoLines}
            onStartEditPo={startEditPo}
            onSaveEditPo={saveEditPo}
            onSetPoStatus={setPoStatus}
            onDeletePo={deletePo}
            onProofsChange={load}
            eventId={id}
            poWindow={poWindow}
          />
        )}

        {tab === 'finance' && (
          <EventFinancePanel
            financeLocked={financeLocked}
            canFinance={canFinance}
            closed={closed}
            saving={saving}
            financeDraft={financeDraft}
            setFinanceDraft={setFinanceDraft}
            onImportExcel={importFinanceExcel}
            onSaveFinance={saveFinance}
            onPatchRow={patchFinanceRow}
          />
        )}

        {tab === 'campaign' && (
          <EventCampaignPanel
            event={event}
            closed={closed}
            saving={saving}
            canCampaign={canCampaign}
            campaignForm={campaignForm}
            setCampaignForm={setCampaignForm}
            onSaveCampaign={saveCampaign}
            onToggleCampaignAuth={toggleCampaignAuth}
            files={campaignFiles}
            onUploadFile={uploadCampaignFile}
            onReplaceFile={replaceCampaignFile}
            onDeleteFile={deleteCampaignFile}
            onFilesChanged={load}
          />
        )}

        {tab === 'ticketing' && (
          <EventTicketingPanel
            closed={closed}
            saving={saving}
            canTicketing={canTicketing}
            eventId={id}
            ticketingSetups={event.ticketingSetups || []}
            ticketForm={ticketForm}
            setTicketForm={setTicketForm}
            ticketZones={ticketZones}
            setTicketZones={setTicketZones}
            editingTicketId={editingTicketId}
            setEditingTicketId={setEditingTicketId}
            onSaveTicketing={saveTicketing}
            onEditTicketing={editTicketing}
            onDeleteTicketing={deleteTicketing}
            onSynced={load}
          />
        )}

        {tab === 'tasks' && (
          <EventTasksPanel
            closed={closed}
            tasks={event.tasks || []}
            directory={directory}
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            onCreateTask={createTask}
            onSetTaskStatus={setTaskStatus}
            onReassignTask={reassignTask}
          />
        )}

        {tab === 'sponsors' && (
          <EventSponsorsPanel
            closed={closed}
            canEdit={canSponsors}
            sponsors={event.sponsors || []}
            sponsorForm={sponsorForm}
            setSponsorForm={setSponsorForm}
            onCreateSponsor={createSponsor}
            onRemoveSponsor={removeSponsor}
            onUpdateSponsor={updateSponsor}
          />
        )}

        {tab === 'files' && (
          <EventFilesPanel
            eventId={id}
            closed={closed || !canChecklistEdit}
            files={event.files}
            previewFile={previewFile}
            setPreviewFile={setPreviewFile}
            onUpload={onUpload}
            onDeleteFile={deleteFile}
            onFilesChanged={load}
          />
        )}
      </div>
    </AppShell>
  );
}
