'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { money } from '@/components/charts/SparkBars';
import { FileViewer } from '@/components/files/FileViewer';
import { SheetEditor } from '@/components/files/SheetEditor';
import { PdfEditor } from '@/components/files/PdfEditor';
import { replaceEventFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
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

/** Etiqueta con la que viajan los adjuntos de campaña en EventFile.module */
const CAMPAIGN_MODULE = 'campaign';

function isSheetFile(name: string, kind?: string | null) {
  return kind === 'excel' || /\.(xlsx?|csv)$/i.test(name);
}

export default function CampaignsPage() {
  const { user, entity } = useUser();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignRow | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    type: 'INTERNAL',
    notes: '',
    channels: '',
    budget: '',
    mediaPlan: '',
    creatives: '',
    timeline: '',
  });
  const [msg, setMsg] = useState('');
  // Junta 2026-08-28: la fila se expande para ver el Excel/PDF sin descargarlo.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['campaign.edit', 'everything'])
    : false;

  async function load() {
    setLoading(true);
    try {
      const data = await api<CampaignRow[]>('/campaigns');
      const filtered = data.filter((r) => r.event.entity === entity);
      setRows(filtered);
      if (selected) {
        const refreshed = filtered.find((r) => r.id === selected.id);
        if (refreshed) openEditor(refreshed);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const n = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.event.name.toLowerCase().includes(n) ||
        (r.event.artist || '').toLowerCase().includes(n) ||
        r.type.toLowerCase().includes(n),
    );
  }, [rows, q]);

  const pendingAuth = rows.filter((r) => !r.authorized).length;
  const budgetTotal = rows.reduce((s, r) => s + Number(r.dataJson?.budget || 0), 0);
  const msgVariant =
    msg === 'Campaña guardada' ? 'success' : msg.toLowerCase().includes('error') ? 'error' : 'info';

  function openEditor(r: CampaignRow) {
    setSelected(r);
    const dj = r.dataJson || {};
    setForm({
      type: r.type,
      notes: r.notes || '',
      channels: dj.channels || '',
      budget: dj.budget != null ? String(dj.budget) : '',
      mediaPlan: dj.mediaPlan || '',
      creatives: dj.creatives || '',
      timeline: dj.timeline || '',
    });
  }

  async function save() {
    if (!selected || !canEdit) return;
    setMsg('');
    try {
      await api(`/campaigns/event/${selected.event.id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          notes: form.notes || undefined,
          dataJson: {
            channels: form.channels,
            budget: form.budget ? Number(form.budget) : 0,
            mediaPlan: form.mediaPlan,
            creatives: form.creatives,
            timeline: form.timeline,
          },
        }),
      });
      setMsg('Campaña guardada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function toggleAuth(eventId: string, authorized: boolean) {
    await api(`/campaigns/event/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({ authorized }),
    });
    await load();
  }

  /** Subir Excel / PDF de la campaña sin salir de esta pantalla. */
  async function uploadCampaignFile(eventId: string, file: File) {
    if (!canEdit) return;
    setUploading(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('module', CAMPAIGN_MODULE);
      await api('/uploads', { method: 'POST', body: fd });
      setMsg(`${file.name} agregado a la campaña`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteCampaignFile(fileId: string) {
    if (!canEdit) return;
    if (!confirm('¿Eliminar este archivo de la campaña?')) return;
    await api(`/uploads/${fileId}`, { method: 'DELETE' }).catch(() => undefined);
    await load();
  }

  return (
    <AppShell title="Campañas">
      <div className="stack page-workspace">
        <PageHeader
          description={`Plan de medios y presupuesto por evento. ${pendingAuth} campaña${pendingAuth === 1 ? '' : 's'} pendiente${pendingAuth === 1 ? '' : 's'} de autorización en ${entity === 'ARTA' ? 'Arta' : 'Auditorio'}.`}
          hint="Selecciona una fila para editar. Autoriza solo cuando el plan de medios y presupuesto estén completos."
        >
          <ActionLink href="/events" variant="ghost">
            Ir a eventos
          </ActionLink>
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
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
              <div className="kpi">
                <div className="label">Campañas</div>
                <div className="value">{rows.length}</div>
                <div className="kpi-sub muted">En la entidad activa</div>
              </div>
              <div className="kpi">
                <div className="label">Autorizadas</div>
                <div className="value">{rows.filter((r) => r.authorized).length}</div>
                <div className="kpi-sub muted">Listas para ejecutar</div>
              </div>
              <div className={`kpi ${pendingAuth ? 'kpi--danger' : ''}`}>
                <div className="label">Pend. autorización</div>
                <div className="value">{pendingAuth}</div>
                <div className="kpi-sub muted">Requieren revisión</div>
              </div>
              <div className="kpi">
                <div className="label">Presupuesto total</div>
                <div className="value value--money">{money(budgetTotal)}</div>
                <div className="kpi-sub muted">Suma de presupuestos</div>
              </div>
            </div>

            <FilterBar meta={`${filtered.length} campañas`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento, artista, tipo…"
                label="Buscar campaña"
                maxWidth={300}
              />
            </FilterBar>

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
                          <th>Evento</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Auth</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const files = r.files || [];
                          const open = expandedId === r.id;
                          return (
                            <Fragment key={r.id}>
                              <tr>
                                <td>
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => openEditor(r)}
                                  >
                                    <strong>{r.event.name}</strong>
                                  </button>
                                  <div className="muted kpi-sub">{r.event.artist || '—'}</div>
                                </td>
                                <td className="muted kpi-sub">{r.type}</td>
                                <td>
                                  <StatusBadge value={r.event.status} kind="event" />
                                </td>
                                <td>
                                  <StatusBadge
                                    value={r.authorized ? 'healthy' : 'watch'}
                                    kind="risk"
                                  />
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
                                    {canEdit && !r.authorized ? (
                                      <button
                                        className="btn btn-sm"
                                        type="button"
                                        onClick={() => toggleAuth(r.event.id, true)}
                                      >
                                        Autorizar
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                              {open ? (
                                <tr className="campaign-expand">
                                  <td colSpan={5}>
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
                                          const editing = editingFileId === f.id;
                                          return (
                                            <div key={f.id} className="campaign-file">
                                              <div className="campaign-file__head">
                                                <div className="campaign-file__meta">
                                                  <strong>{f.fileName}</strong>
                                                </div>
                                                <div className="panel-head-actions">
                                                  {canEdit ? (
                                                    <button
                                                      className={editing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                                      type="button"
                                                      onClick={() =>
                                                        setEditingFileId(editing ? null : f.id)
                                                      }
                                                    >
                                                      {editing
                                                        ? 'Cerrar editor'
                                                        : isSheetFile(f.fileName, f.kind)
                                                          ? 'Editar hoja'
                                                          : 'Escribir encima'}
                                                    </button>
                                                  ) : null}
                                                  {canEdit ? (
                                                    <button
                                                      className="btn ghost btn-sm btn-danger"
                                                      type="button"
                                                      onClick={() => deleteCampaignFile(f.id)}
                                                    >
                                                      Eliminar
                                                    </button>
                                                  ) : null}
                                                </div>
                                              </div>
                                              <div className="campaign-file__body">
                                                {editing ? (
                                                  isSheetFile(f.fileName, f.kind) ? (
                                                    <SheetEditor
                                                      key={f.id}
                                                      url={f.url}
                                                      fileName={f.fileName}
                                                      canEdit={canEdit}
                                                      onSave={replaceEventFile(f.id)}
                                                      onSaved={load}
                                                    />
                                                  ) : (
                                                    <PdfEditor
                                                      key={f.id}
                                                      url={f.url}
                                                      fileName={f.fileName}
                                                      canEdit={canEdit}
                                                      onSave={replaceEventFile(f.id)}
                                                      onSaved={load}
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
                            <td colSpan={5}>
                              <EmptyState
                                title={
                                  rows.length === 0
                                    ? 'Sin campañas en esta entidad'
                                    : 'Sin campañas en este filtro'
                                }
                                description={
                                  rows.length === 0
                                    ? 'Las campañas nacen al crear un evento con tipo interna/externa. Abre un evento para editar media plan y presupuesto.'
                                    : 'Limpia la búsqueda para ver todas las campañas.'
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
                                {rows.length && q.trim() ? (
                                  <button
                                    className="btn ghost btn-sm"
                                    type="button"
                                    onClick={() => setQ('')}
                                  >
                                    Limpiar búsqueda
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
                    <h2>{selected.event.name}</h2>
                    <button className="btn ghost btn-sm" type="button" onClick={() => setSelected(null)}>
                      Cerrar
                    </button>
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
                          onChange={(e) => setForm({ ...form, channels: e.target.value })}
                        />
                      </label>
                      <label>
                        Plan de medios
                        <textarea
                          rows={3}
                          disabled={!canEdit}
                          value={form.mediaPlan}
                          onChange={(e) => setForm({ ...form, mediaPlan: e.target.value })}
                        />
                      </label>
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
                          onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                        />
                      </label>
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
                          <button className="btn" type="button" onClick={save}>
                            Guardar campaña
                          </button>
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
