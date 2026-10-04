'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EventDetailSkeleton } from '@/components/events/EventDetailSkeleton';
import { EventTabBar } from '@/components/events/EventTabBar';
import { useEventTab } from '@/components/events/useEventTab';
import { EventHero, type HeroMenuItem } from '@/components/ui/EventHero';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlashMessage } from '@/components/ui/PageChrome';
import { api, isRevisionConflict, type RevisionConflict } from '@/lib/api';
import { ConflictNotice } from '@/components/ui/ConflictNotice';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { REVIEW_APPROVER_ROLES } from '@/lib/review-flow';
import { EventOverviewPanel } from '@/components/events/EventOverviewPanel';
import {
  EventCampaignPanel,
  EventChecklistsPanel,
  EventFilesPanel,
  EventFinancePanel,
  EventPurchaseOrdersPanel,
  EventSponsorsPanel,
  EventTasksPanel,
  EventTicketingPanel,
} from '@/components/events/lazy-panels';
import {
  CHECKLIST_FILE_MODULE,
  FINANCE_FILE_MODULE,
  GENERAL_FILE_MODULE,
  type Checklist,
  type ChecklistItem,
  type DirUser,
  type DocStatus,
  type EventDetail,
  type EventFile,
  type Tab,
  type Task,
} from '@/components/events/event-detail.types';

export default function EventDetailPage() {
  return (
    <Suspense fallback={<EventDetailSkeleton />}>
      <EventDetailInner />
    </Suspense>
  );
}

type FlashVariant = 'success' | 'error' | 'info' | 'warn';

/**
 * Hub del evento.
 *
 * Junta 11-09-2026: cada pestaña es un panel autónomo que guarda por su cuenta
 * y avisa con `onChanged`. Aquí quedan solo lo que cruza pestañas —el evento,
 * los permisos, los mensajes— y los formatos y tareas, que ya funcionaban así.
 */
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
  /** Sube cada vez que el checklist viene del servidor: el autoguardado del
   * panel usa esto para volver a tomar la línea base y no reenviar lo mismo. */
  const [checklistRevision, setChecklistRevision] = useState(0);
  /** Choque de edición concurrente pendiente de resolver por la persona. */
  const [conflict, setConflict] = useState<RevisionConflict | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgVariant, setMsgVariant] = useState<FlashVariant>('success');
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [taskForm, setTaskForm] = useState({
    title: '',
    module: '',
    assigneeIds: [] as string[],
    dueAt: '',
    detail: '',
  });
  const [previewFile, setPreviewFile] = useState<EventDetail['files'][0] | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);

  const closed = event?.status === 'CLOSED' || event?.status === 'CANCELLED';
  const role = user?.roleKey || '';
  const has = (perms: string[]) => userHasPermission(role, user?.permissions || [], [...perms, 'everything']);
  const canClose = has(['event.close']);
  const canFinance = has(['finance.edit']);
  const canSeeFinance = has(['finance.view', 'finance.edit']);
  const canCampaign = has(['campaign.edit']);
  const canSeeCampaign = has(['campaign.view', 'campaign.edit']);
  const canTicketing = has(['ticketing.edit']);
  const canVendorPin = has(['vendor.pin']);
  const canAuthorize = has(['po.authorize']);
  const canMarkPaid = has(['po.mark_paid']);
  const canChecklistEdit = has(['checklist.edit']);
  const canPo = has(['checklist.edit', 'po.authorize', 'po.mark_paid']);
  const canApproveCampaign = REVIEW_APPROVER_ROLES.has(role);
  const canReopen = role === 'dir_general' || role === 'dir_adjunta' || role === 'super_admin';
  const canDeleteEvent = canReopen;

  const load = useCallback(async () => {
    const data = await api<EventDetail>(`/events/${id}`);
    setEvent(data);
    setLoadError('');
    if (activeChecklist) {
      try {
        const full = await api<Checklist>(`/checklists/${activeChecklist.id}`);
        setActiveChecklist(full);
        setChecklistRevision((r) => r + 1);
      } catch {
        const refreshed = data.checklists.find((c) => c.id === activeChecklist.id);
        if (refreshed) {
          setActiveChecklist(refreshed);
          setChecklistRevision((r) => r + 1);
        }
      }
    }
  }, [id, activeChecklist?.id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el evento'))
      .finally(() => setLoading(false));
    api<DirUser[]>('/users/directory').then(setDirectory).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flash = useCallback((text: string, variant: FlashVariant = 'success') => {
    setMsg(text);
    setMsgVariant(variant);
  }, []);

  async function openChecklist(c: Checklist) {
    selectTab('checklists', { checklist: c.id });
    setActiveChecklist(c);
    setChecklistRevision((r) => r + 1);
    try {
      const full = await api<Checklist>(`/checklists/${c.id}`);
      setActiveChecklist(full);
      setChecklistRevision((r) => r + 1);
    } catch {
      /* keep list payload */
    }
  }

  function selectModule(next: Tab) {
    if (next !== 'checklists') setActiveChecklist(null);
    setMsg('');
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

  const modules = useMemo(() => {
    if (!event) return [];
    const concepts = event.campaign?.dataJson?.concepts?.length || 0;
    const convenios = event.campaign?.dataJson?.convenios?.length || 0;
    const all: Array<{ key: Tab; label: string; count: number; show: boolean }> = [
      { key: 'checklists', label: 'Formatos', count: event.checklists.length, show: true },
      {
        key: 'ocs',
        label: 'Órdenes de compra',
        count: event.purchaseOrders.filter((p) => p.status === 'PENDING_AUTH' || p.status === 'AUTHORIZED').length,
        show: canPo,
      },
      {
        key: 'finance',
        label: 'Corrida',
        count: event.files.some((f) => f.module === FINANCE_FILE_MODULE) ? 1 : 0,
        show: canSeeFinance,
      },
      { key: 'campaign', label: 'Campaña', count: concepts, show: canSeeCampaign },
      { key: 'sponsors', label: 'Convenios', count: convenios + (event.sponsors?.length || 0), show: canChecklistEdit || canSeeCampaign },
      { key: 'ticketing', label: 'Boletera', count: event.ticketingSetups?.length || 0, show: canTicketing },
      { key: 'tasks', label: 'Tareas', count: (event.tasks || []).filter((t) => t.status !== 'DONE').length, show: true },
      { key: 'files', label: 'Documentos', count: event.files.length, show: true },
    ];
    return all.filter((m) => m.show).map(({ key, label, count }) => ({ key, label, count }));
  }, [event, canPo, canSeeFinance, canSeeCampaign, canChecklistEdit, canTicketing]);

  const visibleTabs = useMemo(() => new Set<Tab>(modules.map((m) => m.key)), [modules]);

  /**
   * Refleja en la lista lateral lo que cambió del formato abierto, sin volver
   * a pedir el evento completo (checklists + OC + finanzas + boletera).
   */
  function mergeChecklistIntoEvent(c: Checklist) {
    setEvent((prev) =>
      prev
        ? {
            ...prev,
            checklists: prev.checklists.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    progressPct: c.progressPct,
                    pdfUrl: c.pdfUrl ?? x.pdfUrl,
                    pdfGeneratedAt: c.pdfGeneratedAt ?? x.pdfGeneratedAt,
                    deliveredAt: c.deliveredAt ?? x.deliveredAt,
                    authorizedAt: c.authorizedAt ?? x.authorizedAt,
                    lastEditedBy: c.lastEditedBy ?? x.lastEditedBy,
                  }
                : x,
            ),
          }
        : prev,
    );
  }

  /** Checklist recién traído del servidor: re-sincroniza el autoguardado. */
  function applyChecklist(c: Checklist) {
    setActiveChecklist(c);
    setChecklistRevision((r) => r + 1);
    mergeChecklistIntoEvent(c);
  }

  /**
   * Autoguardado: guarda el JSON sin regenerar el PDF ni crear versión. Solo
   * se refleja el avance, nunca se pisa lo que la persona sigue escribiendo.
   */
  async function saveChecklistDraft(dataJson: Checklist['dataJson']) {
    if (!activeChecklist || closed) return;
    /*
     * `baseRevision` es lo que convierte el autoguardado en seguro: si alguien
     * guardó mientras tanto, el servidor responde 409 con el diff en vez de
     * dejar que se pisen. Y hay que quedarse con la revisión que devuelve, o
     * el siguiente autoguardado chocaría contra uno mismo.
     */
    const updated = await api<Checklist>(`/checklists/${activeChecklist.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        dataJson,
        draft: true,
        baseRevision: activeChecklist.revision,
      }),
    }).catch((e) => {
      // Se relanza a propósito: así la píldora de estado no dice «guardado».
      if (isRevisionConflict(e)) setConflict(e.body);
      throw e;
    });
    setActiveChecklist((prev) =>
      prev && prev.id === updated.id
        ? {
            ...prev,
            revision: updated.revision,
            progressPct: updated.progressPct,
            lastEditedAt: updated.lastEditedAt,
            lastEditedBy: updated.lastEditedBy,
          }
        : prev,
    );
    mergeChecklistIntoEvent(updated);
  }

  async function saveChecklist(options?: { overwrite?: boolean }) {
    // El contenido llega en una segunda petición: guardar antes de que aterrice
    // mandaría el formato sin datos.
    if (!activeChecklist?.dataJson || closed) return;
    setSaving(true);
    setMsg('');
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dataJson: activeChecklist.dataJson,
          // Al pisar a propósito se manda la revisión del servidor, no la mía.
          baseRevision: options?.overwrite ? conflict?.currentRevision : activeChecklist.revision,
        }),
      });
      applyChecklist({ ...updated, versions: activeChecklist.versions });
      setConflict(null);
      flash('Checklist guardado · PDF regenerado');
    } catch (e) {
      if (isRevisionConflict(e)) {
        // Nada de pisar ni de perder lo tecleado: decide la persona.
        setConflict(e.body);
        return;
      }
      flash(e instanceof Error ? e.message : 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  /** Borrador → Revisión → Aprobado → Sellado, y reabrir con motivo. */
  async function changeChecklistStatus(next: DocStatus, reason?: string) {
    if (!activeChecklist) return;
    setSaving(true);
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next, reason }),
      });
      applyChecklist({ ...updated, versions: activeChecklist.versions });
      flash(
        next === 'SEALED'
          ? 'Formato sellado — queda en solo lectura'
          : next === 'APPROVED'
            ? 'Formato aprobado'
            : next === 'REVIEW'
              ? 'Mandado a revisión'
              : 'De vuelta en borrador',
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo cambiar el estado', 'error');
    } finally {
      setSaving(false);
    }
  }

  /** Descartar lo mío y quedarme con lo que hay guardado. */
  async function takeTheirs() {
    if (!activeChecklist) return;
    setResolvingConflict(true);
    try {
      const full = await api<Checklist>(`/checklists/${activeChecklist.id}`);
      applyChecklist(full);
      setConflict(null);
      flash('Se cargó la versión guardada');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo recargar', 'error');
    } finally {
      setResolvingConflict(false);
    }
  }

  /** Guardar lo mío encima, con constancia en el historial. */
  async function keepMine() {
    setResolvingConflict(true);
    try {
      await saveChecklist({ overwrite: true });
    } finally {
      setResolvingConflict(false);
    }
  }

  async function signChecklist(kind: 'ENTREGADO' | 'AUTORIZADO', payload: { imageDataUrl: string; signerName: string }) {
    if (!activeChecklist || closed) return;
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({ kind, ...payload }),
      });
      applyChecklist(updated);
      flash(`Firma ${kind.toLowerCase()} guardada`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al firmar', 'error');
    }
  }

  async function regeneratePdf() {
    if (!activeChecklist) return;
    try {
      const updated = await api<Checklist>(`/checklists/${activeChecklist.id}/pdf`, { method: 'POST' });
      applyChecklist({ ...updated, versions: activeChecklist.versions });
      flash('PDF regenerado');
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
      applyChecklist({ ...updated, versions: full.versions });
      flash('Versión restaurada · PDF regenerado');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al restaurar', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<ChecklistItem>) {
    // Actualización funcional: «marcar toda la sección» dispara N cambios en
    // el mismo tick y con la forma anterior solo sobrevivía el último.
    setActiveChecklist((prev) =>
      prev?.dataJson
        ? {
            ...prev,
            dataJson: {
              sections: prev.dataJson.sections.map((s) =>
                s.id !== sectionId
                  ? s
                  : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) },
              ),
            },
          }
        : prev,
    );
  }

  /** Marcar / desmarcar de un golpe todas las casillas de una sección. */
  function updateSection(sectionId: string, done: boolean) {
    setActiveChecklist((prev) =>
      prev?.dataJson
        ? {
            ...prev,
            dataJson: {
              sections: prev.dataJson.sections.map((s) =>
                s.id !== sectionId
                  ? s
                  : {
                      ...s,
                      items: s.items.map((it) =>
                        it.type === 'check' || !it.type ? { ...it, done } : it,
                      ),
                    },
              ),
            },
          }
        : prev,
    );
  }

  /** Sube un adjunto; devuelve el archivo creado para que un campo del formato lo enlace. */
  async function onUpload(file: File): Promise<EventFile | void> {
    if (closed) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', id);
      if (activeChecklist) {
        fd.append('checklistId', activeChecklist.id);
        fd.append('module', CHECKLIST_FILE_MODULE);
      } else {
        fd.append('module', GENERAL_FILE_MODULE);
      }
      const created = await api<EventFile>('/uploads', { method: 'POST', body: fd });
      await load();
      flash(
        activeChecklist
          ? `${file.name} quedó en el checklist «${activeChecklist.title}»`
          : `${file.name} quedó en Documentos generales`,
      );
      return created;
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al subir archivo', 'error');
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

  async function eventAction(path: string, ok: string, question?: string) {
    if (question && !confirm(question)) return;
    try {
      await api(`/events/${id}/${path}`, { method: 'POST' });
      flash(ok);
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo completar', 'error');
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

  /**
   * Las acciones de tareas tocan una fila: recargar el evento completo
   * (checklists, OC, finanzas, boletera…) por un clic era el mayor
   * desperdicio de la pantalla.
   */
  function patchTaskInPlace(task: Task) {
    setEvent((prev) =>
      prev ? { ...prev, tasks: (prev.tasks || []).map((t) => (t.id === task.id ? task : t)) } : prev,
    );
  }

  async function createTask() {
    if (!taskForm.title || closed) return;
    try {
      const created = await api<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          eventId: id,
          title: taskForm.title,
          module: taskForm.module || undefined,
          detail: taskForm.detail || undefined,
          assigneeIds: taskForm.assigneeIds,
          dueAt: taskForm.dueAt || undefined,
        }),
      });
      const who = taskForm.assigneeIds
        .map((pid) => directory.find((d) => d.id === pid)?.fullName)
        .filter(Boolean)
        .join(', ');
      // Se conservan responsables y fecha: casi siempre se cargan varias seguidas.
      setTaskForm({ ...taskForm, title: '', detail: '' });
      flash(who ? `Tarea asignada a ${who} — le llega el aviso en su panel` : 'Tarea creada');
      setEvent((prev) => (prev ? { ...prev, tasks: [created, ...(prev.tasks || [])] } : prev));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error al crear tarea', 'error');
    }
  }

  /** Cambio optimista de una tarea con vuelta atrás si el servidor lo rechaza. */
  async function patchTask(taskId: string, local: Partial<Task>, body: Record<string, unknown>, ok?: string) {
    const snapshot = event?.tasks || [];
    setEvent((prev) =>
      prev ? { ...prev, tasks: (prev.tasks || []).map((t) => (t.id === taskId ? { ...t, ...local } : t)) } : prev,
    );
    try {
      patchTaskInPlace(await api<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) }));
      if (ok) flash(ok);
    } catch (e) {
      setEvent((prev) => (prev ? { ...prev, tasks: snapshot } : prev));
      flash(e instanceof Error ? e.message : 'Error al actualizar la tarea', 'error');
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
          actionLabel="Volver a eventos"
        />
      </AppShell>
    );
  }

  if (!event) {
    return <EventDetailSkeleton />;
  }

  const menu: HeroMenuItem[] = [
    ...(!closed && canClose
      ? [
          {
            label: 'Cerrar evento',
            onClick: () => void eventAction('close', 'Evento cerrado', '¿Cerrar el evento? Queda en solo lectura.'),
          },
          {
            label: 'Cancelar evento',
            danger: true,
            onClick: () => void eventAction('cancel', 'Evento cancelado', '¿Cancelar el evento?'),
          },
        ]
      : []),
    ...(canDeleteEvent ? [{ label: 'Eliminar evento', danger: true, onClick: () => void deleteEvent() }] : []),
  ];

  const panel = { event, closed, onChanged: load, flash };

  return (
    <AppShell title={event.name}>
      <div className="stack page-workspace">
        <EventHero
          event={event}
          actions={
            <>
              {!closed ? (
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setEditingMeta(true);
                    if (tab !== 'overview') selectTab('overview');
                  }}
                >
                  Editar datos
                </button>
              ) : null}
              {closed && canReopen ? (
                <button className="btn btn-sm" type="button" onClick={() => void eventAction('reopen', 'Evento reabierto')}>
                  Reabrir
                </button>
              ) : null}
            </>
          }
          menu={menu}
        />

        <EventTabBar tab={tab} modules={modules} onSelect={selectModule} />

        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}
        {closed ? <FlashMessage variant="warn">Evento cerrado: todo queda en solo lectura.</FlashMessage> : null}

        {tab === 'overview' && (
          <EventOverviewPanel
            {...panel}
            editing={editingMeta}
            setEditing={setEditingMeta}
            canVendorPin={canVendorPin}
            onOpenChecklist={openChecklist}
            onGoModule={selectModule}
            visibleTabs={visibleTabs}
          />
        )}

        {conflict && tab === 'checklists' ? (
          <ConflictNotice
            conflict={conflict}
            busy={resolvingConflict || saving}
            onTakeTheirs={takeTheirs}
            onKeepMine={keepMine}
            onDismiss={() => setConflict(null)}
          />
        ) : null}

        {tab === 'checklists' && (
          <EventChecklistsPanel
            event={event}
            activeChecklist={activeChecklist}
            closed={closed || !canChecklistEdit}
            saving={saving}
            userFullName={user?.fullName || ''}
            revision={checklistRevision}
            onOpenChecklist={openChecklist}
            onClearChecklist={() => setActiveChecklist(null)}
            onSaveChecklist={saveChecklist}
            onChangeStatus={changeChecklistStatus}
            roleKey={role}
            onAutosaveChecklist={saveChecklistDraft}
            onRegeneratePdf={regeneratePdf}
            onUpload={onUpload}
            onUpdateItem={updateItem}
            onUpdateSection={updateSection}
            onSignChecklist={signChecklist}
            onRestoreVersion={restoreChecklistVersion}
            onFilesChanged={load}
          />
        )}

        {tab === 'ocs' && canPo && (
          <EventPurchaseOrdersPanel
            {...panel}
            canCreate={canChecklistEdit}
            canAuthorize={canAuthorize}
            canMarkPaid={canMarkPaid}
            currentUserName={user?.fullName || ''}
          />
        )}

        {tab === 'finance' && canSeeFinance && <EventFinancePanel {...panel} canEdit={canFinance} />}

        {tab === 'campaign' && canSeeCampaign && (
          <EventCampaignPanel
            {...panel}
            canEdit={canCampaign}
            canApprove={canApproveCampaign}
            canMarkPaid={canMarkPaid}
            onCreatePo={canPo && canChecklistEdit ? () => selectModule('ocs') : undefined}
          />
        )}

        {tab === 'sponsors' && (
          <EventSponsorsPanel
            {...panel}
            canEdit={canChecklistEdit}
            canCampaignEdit={canCampaign}
            canApprove={canApproveCampaign}
            canMarkPaid={canMarkPaid}
          />
        )}

        {tab === 'ticketing' && canTicketing && <EventTicketingPanel {...panel} canEdit={canTicketing} />}

        {tab === 'tasks' && (
          <EventTasksPanel
            closed={closed}
            tasks={event.tasks || []}
            directory={directory}
            currentUserId={user?.id}
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            onCreateTask={createTask}
            onSetTaskStatus={(taskId, status) => patchTask(taskId, { status }, { status })}
            onReassignTask={(taskId, assigneeIds) => {
              const people = assigneeIds
                .map((pid) => directory.find((d) => d.id === pid))
                .filter(Boolean)
                .map((p) => ({ id: p!.id, fullName: p!.fullName }));
              return patchTask(
                taskId,
                {
                  assigneeId: people[0]?.id ?? null,
                  assignee: people[0] ?? null,
                  assigneeIds: people.map((p) => p.id),
                  assignees: people,
                },
                { assigneeIds },
                people.length ? 'Responsables actualizados — se avisó a quien se sumó' : 'Tarea sin asignar',
              );
            }}
            onSetTaskDue={(taskId, dueAt) => patchTask(taskId, { dueAt: dueAt || null }, { dueAt: dueAt || null })}
            onEditTask={(taskId, next) =>
              patchTask(taskId, next, { title: next.title, detail: next.detail }, 'Tarea actualizada')
            }
            onTaskUpdated={patchTaskInPlace}
          />
        )}

        {tab === 'files' && (
          <EventFilesPanel
            eventId={id}
            closed={closed || !canChecklistEdit}
            files={event.files}
            checklists={event.checklists.map((c) => ({ id: c.id, title: c.title }))}
            previewFile={previewFile}
            setPreviewFile={setPreviewFile}
            onUpload={async (f) => {
              await onUpload(f);
            }}
            onDeleteFile={deleteFile}
            onFilesChanged={load}
          />
        )}
      </div>
    </AppShell>
  );
}
