'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { importFinanceFromFile } from '@/lib/finance-import';
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
    label: 'Vendor',
    pin: '',
    scopes: ['files', 'checklists'] as string[],
    expiresAt: '',
  });
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
        logoUrl: ticketForm.logoUrl || '',
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
      setTicketForm((f) => ({ ...f, boletera: 'Arema', logoUrl: '', holdUntil: '', notes: '' }));
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
    if (!pinForm.scopes.length) {
      setMsg('Elige al menos un scope');
      return;
    }
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
    setPinForm({ label: 'Vendor', pin: '', scopes: ['files', 'checklists'], expiresAt: '' });
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

        <nav className="tab-bar" aria-label="Módulos del evento">
          <button
            className={`tab-bar__btn ${tab === 'overview' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setTab('overview')}
          >
            Resumen
          </button>
          {modules.map((m) => (
            <button
              key={m.key}
              className={`tab-bar__btn ${tab === m.key ? 'is-active' : ''}`}
              type="button"
              onClick={() => {
                setTab(m.key as Tab);
                setActiveChecklist(null);
              }}
            >
              {m.label}
              <span className="tab-bar__count">{m.count}</span>
            </button>
          ))}
        </nav>

        {msg ? <div className="muted">{msg}</div> : null}
        {closed ? <div className="badge warn">Evento en solo lectura</div> : null}

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
            onGoChecklists={() => setTab('checklists')}
          />
        )}

        {tab === 'checklists' && (
          <EventChecklistsPanel
            event={event}
            activeChecklist={activeChecklist}
            closed={closed}
            saving={saving}
            userFullName={user?.fullName || ''}
            onOpenChecklist={openChecklist}
            onSaveChecklist={saveChecklist}
            onRegeneratePdf={regeneratePdf}
            onUpload={onUpload}
            onUpdateItem={updateItem}
            onSignChecklist={signChecklist}
            onRestoreVersion={restoreChecklistVersion}
          />
        )}

        {tab === 'ocs' && (
          <EventPurchaseOrdersPanel
            closed={closed}
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
          />
        )}

        {tab === 'sponsors' && (
          <EventSponsorsPanel
            closed={closed}
            sponsors={event.sponsors || []}
            sponsorForm={sponsorForm}
            setSponsorForm={setSponsorForm}
            onCreateSponsor={createSponsor}
            onRemoveSponsor={removeSponsor}
          />
        )}

        {tab === 'files' && (
          <EventFilesPanel
            closed={closed}
            files={event.files}
            previewFile={previewFile}
            setPreviewFile={setPreviewFile}
            onUpload={onUpload}
            onDeleteFile={deleteFile}
          />
        )}
      </div>
    </AppShell>
  );
}
