'use client';

import Link from 'next/link';
import { FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { money } from '@/components/charts/SparkBars';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import { BulkBar, SelectCheck } from '@/components/ui/BulkBar';
import { SaveStatus } from '@/components/ui/SaveStatus';
import {
  ActionLink,
  FieldSearch,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useAutosave } from '@/lib/use-autosave';
import { useDirtyGuard } from '@/lib/use-dirty-guard';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import { useStickyState } from '@/lib/use-sticky-state';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

type CampaignData = {
  channels?: string;
  budget?: number;
  mediaPlan?: string;
  creatives?: string;
  timeline?: string;
};

type CampaignFile = {
  id: string;
  fileName: string;
  url: string;
  kind?: string | null;
  /** `false` si el libro trae gráficas o tablas dinámicas: se ve, no se edita. */
  panelEditable?: boolean;
  panelBlockReason?: string | null;
  createdAt?: string;
};

type CampaignRow = {
  id: string;
  type: string;
  authorized: boolean;
  notes?: string | null;
  dataJson?: CampaignData | null;
  event: { id: string; name: string; entity: string; artist?: string | null; status: string };
  /** Excel / PDF de la campaña (junta 2026-08-28) */
  files?: CampaignFile[];
};

type CampaignForm = {
  type: string;
  notes: string;
  channels: string;
  budget: string;
  mediaPlan: string;
  creatives: string;
  timeline: string;
};

type Scope = 'all' | 'pending' | 'authorized';

/** Etiqueta con la que viajan los adjuntos de campaña en EventFile.module */
const CAMPAIGN_MODULE = 'campaign';

const TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'Interna',
  EXTERNAL: 'Externa',
  NONE: 'Sin campaña',
};

/** Autorizar campaña queda en gerencia de Arta y dirección (regla del API). */
const AUTH_ROLES = new Set(['gerente_arta', 'dir_general', 'super_admin']);

const emptyForm: CampaignForm = {
  type: 'INTERNAL',
  notes: '',
  channels: '',
  budget: '',
  mediaPlan: '',
  creatives: '',
  timeline: '',
};

function isSheetFile(name: string, kind?: string | null) {
  return kind === 'excel' || /\.(xlsx?|csv)$/i.test(name);
}

function formOf(r: CampaignRow): CampaignForm {
  const dj = r.dataJson || {};
  return {
    type: r.type,
    notes: r.notes || '',
    channels: dj.channels || '',
    budget: dj.budget != null ? String(dj.budget) : '',
    mediaPlan: dj.mediaPlan || '',
    creatives: dj.creatives || '',
    timeline: dj.timeline || '',
  };
}

export default function CampaignsPage() {
  const { user, entity } = useUser();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [scope, setScope] = useStickyState<Scope>('campaigns.scope', 'all');
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [msg, setMsg] = useState<{ text: string; variant: 'info' | 'success' | 'error' | 'warn' } | null>(null);
  // Junta 2026-08-28: la fila se expande para ver el Excel/PDF sin descargarlo.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['campaign.edit', 'everything'])
    : false;
  const canAuthorize = canEdit && AUTH_ROLES.has(user?.roleKey || '');

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  function flash(text: string, variant: 'info' | 'success' | 'error' | 'warn' = 'info') {
    setMsg({ text, variant });
  }

  /** Guardado del editor — se usa igual por el autoguardado y por Ctrl+S. */
  const persist = useCallback(
    async (value: CampaignForm) => {
      if (!selected || !canEdit) return;
      const dataJson: CampaignData = {
        channels: value.channels,
        budget: value.budget ? Number(value.budget) : 0,
        mediaPlan: value.mediaPlan,
        creatives: value.creatives,
        timeline: value.timeline,
      };
      await api(`/campaigns/event/${selected.event.id}`, {
        method: 'POST',
        body: JSON.stringify({ type: value.type, notes: value.notes || undefined, dataJson }),
      });
      // Sin recargar las demás campañas: se actualiza la fila editada.
      setRows((prev) =>
        prev.map((r) =>
          r.id === selected.id ? { ...r, type: value.type, notes: value.notes, dataJson } : r,
        ),
      );
    },
    [selected, canEdit],
  );

  const autosave = useAutosave<CampaignForm>({
    value: form,
    enabled: !!selected && canEdit,
    save: persist,
  });
  const confirmLeave = useDirtyGuard(autosave.dirty);
  useSaveHotkey(!!selected && canEdit, () => {
    void autosave.flush().then((saved) => saved && flash('Campaña guardada', 'success'));
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<CampaignRow[]>('/campaigns');
      setRows(data.filter((r) => r.event.entity === entity));
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    load().catch(console.error);
    setSelectedId(null);
    setPicked(new Set());
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (scope === 'pending') list = list.filter((r) => !r.authorized);
    if (scope === 'authorized') list = list.filter((r) => r.authorized);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.event.name.toLowerCase().includes(n) ||
          (r.event.artist || '').toLowerCase().includes(n) ||
          (TYPE_LABEL[r.type] || r.type).toLowerCase().includes(n),
      );
    }
    return list;
  }, [rows, scope, q]);

  const pendingAuth = rows.filter((r) => !r.authorized).length;
  const budgetTotal = rows.reduce((s, r) => s + Number(r.dataJson?.budget || 0), 0);
  const noPlan = rows.filter((r) => !(r.dataJson?.mediaPlan || '').trim()).length;

  function openEditor(r: CampaignRow) {
    if (r.id === selectedId) return;
    if (!confirmLeave()) return;
    const next = formOf(r);
    setSelectedId(r.id);
    setForm(next);
    autosave.reset(next);
  }

  function closeEditor() {
    if (!confirmLeave()) return;
    setSelectedId(null);
  }

  async function toggleAuth(row: CampaignRow, authorized: boolean) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, authorized } : r)));
    try {
      await api(`/campaigns/event/${row.event.id}`, {
        method: 'POST',
        body: JSON.stringify({ authorized }),
      });
      flash(
        authorized ? `${row.event.name}: campaña autorizada` : `${row.event.name}: autorización retirada`,
        'success',
      );
    } catch (e) {
      setRows(prev);
      flash(e instanceof Error ? e.message : 'No se pudo cambiar la autorización', 'error');
    }
  }

  async function bulkAuthorize() {
    const targets = rows.filter((r) => picked.has(r.id) && !r.authorized);
    if (!targets.length) {
      flash('Las campañas seleccionadas ya están autorizadas', 'info');
      return;
    }
    setBulkBusy(true);
    const results = await Promise.allSettled(
      targets.map((r) =>
        api(`/campaigns/event/${r.event.id}`, {
          method: 'POST',
          body: JSON.stringify({ authorized: true }),
        }),
      ),
    );
    const okIds = new Set(targets.filter((_, i) => results[i].status === 'fulfilled').map((r) => r.id));
    const failed = results.length - okIds.size;
    setRows((rs) => rs.map((r) => (okIds.has(r.id) ? { ...r, authorized: true } : r)));
    setPicked(new Set());
    setBulkBusy(false);
    flash(
      failed ? `${okIds.size} autorizadas, ${failed} con error` : `${okIds.size} campañas autorizadas`,
      failed ? 'warn' : 'success',
    );
  }

  /** Solo los archivos de esa campaña — no toda la lista. */
  async function refreshFiles(eventId: string) {
    try {
      const files = await api<CampaignFile[]>(`/campaigns/event/${eventId}/files`);
      setRows((rs) => rs.map((r) => (r.event.id === eventId ? { ...r, files } : r)));
    } catch {
      /* si falla, la fila conserva la lista previa */
    }
  }

  async function uploadCampaignFile(eventId: string, file: File) {
    if (!canEdit) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('module', CAMPAIGN_MODULE);
      await api('/uploads', { method: 'POST', body: fd });
      flash(`${file.name} agregado a la campaña`, 'success');
      await refreshFiles(eventId);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo subir el archivo', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteCampaignFile(eventId: string, file: CampaignFile) {
    if (!canEdit) return;
    if (!confirm(`¿Eliminar «${file.fileName}» de la campaña?`)) return;
    try {
      await api(`/uploads/${file.id}`, { method: 'DELETE' });
      setRows((rs) =>
        rs.map((r) =>
          r.event.id === eventId ? { ...r, files: (r.files || []).filter((f) => f.id !== file.id) } : r,
        ),
      );
      flash('Archivo eliminado', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
    }
  }

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell title="Campañas">
      <div className="stack page-workspace">
        <PageHeader
          description={`Plan de medios y presupuesto por evento. ${pendingAuth} campaña${pendingAuth === 1 ? '' : 's'} pendiente${pendingAuth === 1 ? '' : 's'} de autorización en ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}.`}
          hint="Abre una campaña para editarla: se guarda sola al dejar de escribir. Autoriza cuando el plan de medios y el presupuesto estén completos."
        >
          <ActionLink href="/events" variant="ghost">
            Ir a eventos
          </ActionLink>
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msg.variant} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Cargando campañas…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <button
                type="button"
                className={`kpi kpi--action ${scope === 'all' ? 'kpi--on' : ''}`}
                onClick={() => setScope('all')}
              >
                <div className="label">Campañas</div>
                <div className="value">{rows.length}</div>
                <div className="kpi-sub muted">En la entidad activa</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${scope === 'authorized' ? 'kpi--on' : ''}`}
                onClick={() => setScope('authorized')}
              >
                <div className="label">Autorizadas</div>
                <div className="value">{rows.filter((r) => r.authorized).length}</div>
                <div className="kpi-sub muted">Listas para ejecutar</div>
              </button>
              <button
                type="button"
                className={`kpi kpi--action ${pendingAuth ? 'kpi--danger' : ''} ${scope === 'pending' ? 'kpi--on' : ''}`}
                onClick={() => setScope('pending')}
              >
                <div className="label">Pend. autorización</div>
                <div className="value">{pendingAuth}</div>
                <div className="kpi-sub muted">Requieren revisión</div>
              </button>
              <div className="kpi">
                <div className="label">Presupuesto total</div>
                <div className="value value--money">{money(budgetTotal)}</div>
                <div className="kpi-sub muted">
                  {noPlan ? `${noPlan} sin plan de medios` : 'Todas con plan de medios'}
                </div>
              </div>
            </div>

            <FilterBar meta={`${filtered.length} de ${rows.length}`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento, artista, tipo…"
                label="Buscar campaña"
                maxWidth={300}
              />
              <div className="chip-row" role="group" aria-label="Filtrar campañas">
                {(
                  [
                    { key: 'all', label: 'Todas' },
                    { key: 'pending', label: 'Pendientes' },
                    { key: 'authorized', label: 'Autorizadas' },
                  ] as Array<{ key: Scope; label: string }>
                ).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`chip ${scope === s.key ? 'is-on' : ''}`}
                    aria-pressed={scope === s.key}
                    onClick={() => setScope(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </FilterBar>

            {canAuthorize ? (
              <BulkBar count={picked.size} noun="campaña" busy={bulkBusy} onClear={() => setPicked(new Set())}>
                <button className="btn btn-sm" type="button" disabled={bulkBusy} onClick={bulkAuthorize}>
                  Autorizar seleccionadas
                </button>
              </BulkBar>
            ) : null}

            <div className={selected ? 'dash-split' : 'stack'}>
              <div className="panel">
                <div className="panel-head">
                  <h2>Campañas · {entity === 'ARTA' ? 'Arta' : 'Auditorio'}</h2>
                </div>
                <div className="panel-body">
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          {canAuthorize ? <th className="col-check" /> : null}
                          <th>Evento</th>
                          <th>Tipo</th>
                          <th>Presupuesto</th>
                          <th>Plan</th>
                          <th>Autorización</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const files = r.files || [];
                          const open = expandedId === r.id;
                          const hasPlan = !!(r.dataJson?.mediaPlan || '').trim();
                          const isSelected = selectedId === r.id;
                          return (
                            <Fragment key={r.id}>
                              <tr className={isSelected ? 'row--selected' : ''}>
                                {canAuthorize ? (
                                  <td className="col-check">
                                    <SelectCheck
                                      checked={picked.has(r.id)}
                                      onChange={() => togglePicked(r.id)}
                                      label={`Seleccionar campaña de ${r.event.name}`}
                                    />
                                  </td>
                                ) : null}
                                <td>
                                  <button
                                    className="link-cell"
                                    type="button"
                                    onClick={() => openEditor(r)}
                                  >
                                    <strong>{r.event.name}</strong>
                                  </button>
                                  <div className="muted kpi-sub">
                                    {r.event.artist || 'Sin artista'} ·{' '}
                                    <StatusBadge value={r.event.status} kind="event" />
                                  </div>
                                </td>
                                <td className="muted kpi-sub">{TYPE_LABEL[r.type] || r.type}</td>
                                <td className="value--money">{money(Number(r.dataJson?.budget || 0))}</td>
                                <td>
                                  <span className={`badge ${hasPlan ? 'ok' : 'warn'}`}>
                                    {hasPlan ? 'Con plan' : 'Falta plan'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${r.authorized ? 'ok' : 'warn'}`}>
                                    {r.authorized ? 'Autorizada' : 'Pendiente'}
                                  </span>
                                </td>
                                <td>
                                  <div className="row row--tight">
                                    <button
                                      className={open ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                      type="button"
                                      aria-expanded={open}
                                      onClick={() => setExpandedId(open ? null : r.id)}
                                    >
                                      {open ? 'Contraer' : `Archivos (${files.length})`}
                                    </button>
                                    <Link
                                      className="btn ghost btn-sm"
                                      href={`/events/${r.event.id}?tab=campaign`}
                                    >
                                      Evento
                                    </Link>
                                    {canAuthorize ? (
                                      <button
                                        className={r.authorized ? 'btn ghost btn-sm' : 'btn btn-sm'}
                                        type="button"
                                        onClick={() => toggleAuth(r, !r.authorized)}
                                      >
                                        {r.authorized ? 'Quitar' : 'Autorizar'}
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                              {open ? (
                                <tr className="campaign-expand">
                                  <td colSpan={canAuthorize ? 7 : 6}>
                                    <div className="stack">
                                      <div className="row row--tight">
                                        <span className="muted kpi-sub">
                                          Excel y PDF de la campaña, embebidos aquí mismo.
                                        </span>
                                        {canEdit ? (
                                          <label className="btn btn-sm module-upload">
                                            {uploading ? 'Subiendo…' : 'Subir archivo'}
                                            <input
                                              type="file"
                                              hidden
                                              disabled={uploading}
                                              accept=".pdf,.xlsx,.xls,.csv,image/*"
                                              onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                e.target.value = '';
                                                if (f) uploadCampaignFile(r.event.id, f);
                                              }}
                                            />
                                          </label>
                                        ) : null}
                                      </div>
                                      {!files.length ? (
                                        <p className="muted kpi-sub">
                                          Esta campaña todavía no tiene plan de medios ni
                                          presentación cargados.
                                        </p>
                                      ) : (
                                        files.map((f) => {
                                          const editingFile = editingFileId === f.id;
                                          return (
                                            <div key={f.id} className="campaign-file">
                                              <div className="campaign-file__head">
                                                <div className="campaign-file__meta">
                                                  <strong>{f.fileName}</strong>
                                                </div>
                                                <div className="panel-head-actions">
                                                  {canEdit ? (
                                                    <button
                                                      className={editingFile ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                                      type="button"
                                                      onClick={() =>
                                                        setEditingFileId(editingFile ? null : f.id)
                                                      }
                                                    >
                                                      {editingFile
                                                        ? 'Cerrar editor'
                                                        : isSheetFile(f.fileName, f.kind)
                                                          ? 'Editar aquí'
                                                          : 'Escribir encima'}
                                                    </button>
                                                  ) : null}
                                                  {canEdit ? (
                                                    <button
                                                      className="btn ghost btn-sm btn-danger"
                                                      type="button"
                                                      onClick={() => deleteCampaignFile(r.event.id, f)}
                                                    >
                                                      Eliminar
                                                    </button>
                                                  ) : null}
                                                </div>
                                              </div>
                                              <div className="campaign-file__body">
                                                {editingFile ? (
                                                  isSheetFile(f.fileName, f.kind) ? (
                                                    <SheetEditor
                                                      key={f.id}
                                                      url={f.url}
                                                      fileName={f.fileName}
                                                      fileId={f.id}
                                                      canEdit={canEdit}
                                                      onSave={replaceEventFile(f.id)}
                                                      onSaveCells={patchEventFileCells(f.id)}
                                                      panelEditable={f.panelEditable !== false}
                                                      blockReason={f.panelBlockReason}
                                                      onSaved={() => refreshFiles(r.event.id)}
                                                    />
                                                  ) : (
                                                    <PdfEditor
                                                      key={f.id}
                                                      url={f.url}
                                                      fileName={f.fileName}
                                                      canEdit={canEdit}
                                                      onSave={replaceEventFile(f.id)}
                                                      onSaved={() => refreshFiles(r.event.id)}
                                                    />
                                                  )
                                                ) : (
                                                  <FileViewer
                                                    url={f.url}
                                                    fileName={f.fileName}
                                                    kind={f.kind}
                                                    cacheKey={f.createdAt}
                                                  />
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                        {!filtered.length ? (
                          <tr>
                            <td colSpan={canAuthorize ? 7 : 6}>
                              <EmptyState
                                title={
                                  rows.length === 0
                                    ? 'Sin campañas en esta entidad'
                                    : 'Sin campañas en este filtro'
                                }
                                description={
                                  rows.length === 0
                                    ? 'Las campañas nacen al crear un evento con tipo interna/externa. Abre un evento para editar media plan y presupuesto.'
                                    : 'Cambia el filtro o limpia la búsqueda para ver todas las campañas.'
                                }
                                steps={
                                  rows.length === 0
                                    ? [
                                        'Crea o abre un evento',
                                        'Configura campaña en el panel del evento',
                                        'Autoriza desde aquí cuando el plan esté listo',
                                      ]
                                    : undefined
                                }
                                actionHref={rows.length === 0 ? '/events' : undefined}
                                actionLabel={rows.length === 0 ? 'Ir a eventos' : undefined}
                              >
                                {rows.length ? (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => {
                                      setQ('');
                                      setScope('all');
                                    }}
                                  >
                                    Limpiar filtros
                                  </button>
                                ) : null}
                              </EmptyState>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selected ? (
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>{selected.event.name}</h2>
                      <div className="muted kpi-sub">
                        {selected.event.artist || 'Sin artista'} ·{' '}
                        {selected.authorized ? 'Autorizada' : 'Pendiente de autorización'}
                      </div>
                    </div>
                    <div className="panel-head-actions">
                      {canEdit ? <SaveStatus status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} /> : null}
                      <button className="btn ghost btn-sm" type="button" onClick={closeEditor}>
                        Cerrar
                      </button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="form">
                      <FormGrid cols={2}>
                        <label>
                          Tipo
                          <select
                            disabled={!canEdit}
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
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
                            inputMode="decimal"
                            disabled={!canEdit}
                            value={form.budget}
                            onChange={(e) => setForm({ ...form, budget: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <label>
                        Canales
                        <input
                          disabled={!canEdit}
                          value={form.channels}
                          placeholder="Radio, Facebook, Instagram, espectaculares…"
                          onChange={(e) => setForm({ ...form, channels: e.target.value })}
                        />
                      </label>
                      <label>
                        Plan de medios
                        <textarea
                          rows={4}
                          disabled={!canEdit}
                          value={form.mediaPlan}
                          placeholder="Pauta por medio, fechas y alcance esperado…"
                          onChange={(e) => setForm({ ...form, mediaPlan: e.target.value })}
                        />
                      </label>
                      <FormGrid cols={2}>
                        <label>
                          Creatividades
                          <textarea
                            rows={2}
                            disabled={!canEdit}
                            value={form.creatives}
                            onChange={(e) => setForm({ ...form, creatives: e.target.value })}
                          />
                        </label>
                        <label>
                          Timeline
                          <input
                            disabled={!canEdit}
                            value={form.timeline}
                            placeholder="Arranque, refuerzo, cierre…"
                            onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <label>
                        Notas
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                      </label>
                      {canEdit ? (
                        <div className="form-actions">
                          <button
                            className="btn"
                            type="button"
                            disabled={autosave.status === 'saving'}
                            onClick={() =>
                              void autosave.flush().then((saved) => {
                                if (saved) flash('Campaña guardada', 'success');
                              })
                            }
                          >
                            {autosave.status === 'saving' ? 'Guardando…' : 'Guardar ahora'}
                          </button>
                          {canAuthorize ? (
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => toggleAuth(selected, !selected.authorized)}
                            >
                              {selected.authorized ? 'Quitar autorización' : 'Autorizar campaña'}
                            </button>
                          ) : null}
                          <span className="muted kpi-sub">Ctrl+S / ⌘S también guarda.</span>
                        </div>
                      ) : (
                        <p className="muted kpi-sub">
                          Solo lectura — el equipo de marketing edita campañas.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
