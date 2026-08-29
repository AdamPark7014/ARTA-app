'use client';

import { useState } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
import { SheetEditor } from '@/components/files/SheetEditor';
import { PdfEditor } from '@/components/files/PdfEditor';
import { replaceEventFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlowSteps } from '@/components/ui/FlowSteps';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventDetail, EventFile } from '@/components/events/event-detail.types';

type CampaignForm = {
  type: string;
  notes: string;
  channels: string;
  budget: string;
  mediaPlan: string;
  creatives: string;
  timeline: string;
};

type EventCampaignPanelProps = {
  event: EventDetail;
  closed: boolean;
  saving: boolean;
  canCampaign: boolean;
  campaignForm: CampaignForm;
  setCampaignForm: (form: CampaignForm) => void;
  onSaveCampaign: () => Promise<void>;
  onToggleCampaignAuth: (authorized: boolean) => Promise<void>;
  /** Excel / PDF de la campaña, embebidos aquí mismo */
  files: EventFile[];
  onUploadFile: (file: File) => Promise<void>;
  onReplaceFile: (fileId: string, file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  /** Recarga el evento cuando se guarda un archivo editado en el sitio */
  onFilesChanged: () => void | Promise<void>;
};

const CAMPAIGN_FLOW = ['Borrador', 'Guardada', 'Autorizada'];

function kindLabel(kind?: string | null) {
  if (kind === 'excel') return 'Excel';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Imagen';
  return kind || 'Archivo';
}

function isSheet(name: string, kind?: string | null) {
  return kind === 'excel' || /\.(xlsx?|csv)$/i.test(name);
}

function isPdf(name: string, kind?: string | null) {
  return kind === 'pdf' || /\.pdf$/i.test(name);
}

export function EventCampaignPanel({
  event,
  closed,
  saving,
  canCampaign,
  campaignForm,
  setCampaignForm,
  onSaveCampaign,
  onToggleCampaignAuth,
  files,
  onUploadFile,
  onReplaceFile,
  onDeleteFile,
  onFilesChanged,
}: EventCampaignPanelProps) {
  const hasSaved = !!event.campaign;
  const flowIndex = event.campaign?.authorized ? 2 : hasSaved ? 1 : 0;
  // Junta 2026-08-28: la campaña se expande para ver el Excel/PDF sin descargar,
  // y desde ahí mismo se puede editar el archivo.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const canEditFiles = canCampaign && !closed;

  return (
    <div className="stack">
      <FlowSteps steps={CAMPAIGN_FLOW} activeIndex={flowIndex} />

      {!canCampaign ? (
        <div className="module-banner">
          Solo el equipo de campaña (gerencia de Arta y logística) puede editar y autorizar.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Campaña publicitaria</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Plan de medios, creativos y presupuesto. Autoriza cuando esté listo para producción.
            </p>
          </div>
          <div className="panel-head-actions">
            {event.campaign?.authorized ? (
              <StatusBadge value="Autorizada" kind="raw" className="ok" />
            ) : (
              <StatusBadge value="Sin autorizar" kind="raw" className="warn" />
            )}
            {canCampaign && !closed ? (
              <>
                <button className="btn btn-sm" type="button" disabled={saving} onClick={onSaveCampaign}>
                  {saving ? 'Guardando…' : 'Guardar campaña'}
                </button>
                {!event.campaign?.authorized ? (
                  <button className="btn ghost btn-sm" type="button" onClick={() => onToggleCampaignAuth(true)}>
                    Autorizar
                  </button>
                ) : (
                  <button className="btn ghost btn-sm" type="button" onClick={() => onToggleCampaignAuth(false)}>
                    Revocar autorización
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="panel-body">
          <div className="form panel--narrow">
            <FormGrid>
              <label>
                Tipo de campaña
                <select
                  className="field"
                  disabled={!canCampaign || closed}
                  value={campaignForm.type}
                  onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value })}
                >
                  <option value="INTERNAL">Interna (equipo Arta)</option>
                  <option value="EXTERNAL">Externa</option>
                  <option value="NONE">Sin campaña</option>
                </select>
              </label>
              <label>
                Presupuesto (MXN)
                <input
                  className="field"
                  type="number"
                  disabled={!canCampaign || closed}
                  value={campaignForm.budget}
                  onChange={(e) => setCampaignForm({ ...campaignForm, budget: e.target.value })}
                  placeholder="0"
                />
              </label>
            </FormGrid>
            <label>
              Canales
              <input
                className="field"
                disabled={!canCampaign || closed}
                value={campaignForm.channels}
                onChange={(e) => setCampaignForm({ ...campaignForm, channels: e.target.value })}
                placeholder="Meta, Google, radio, OOH, influencers…"
              />
            </label>
            <label>
              Plan de medios
              <textarea
                className="field"
                rows={3}
                disabled={!canCampaign || closed}
                value={campaignForm.mediaPlan}
                onChange={(e) => setCampaignForm({ ...campaignForm, mediaPlan: e.target.value })}
                placeholder="Fases, piezas, fechas clave…"
              />
            </label>
            <label>
              Creatividades / artes
              <textarea
                className="field"
                rows={2}
                disabled={!canCampaign || closed}
                value={campaignForm.creatives}
                onChange={(e) => setCampaignForm({ ...campaignForm, creatives: e.target.value })}
                placeholder="KV, stories, pendones, pauta…"
              />
            </label>
            <label>
              Timeline
              <input
                className="field"
                disabled={!canCampaign || closed}
                value={campaignForm.timeline}
                onChange={(e) => setCampaignForm({ ...campaignForm, timeline: e.target.value })}
                placeholder="Teaser → preventa → semana del show"
              />
            </label>
            <label>
              Notas internas
              <textarea
                className="field"
                rows={2}
                disabled={!canCampaign || closed}
                value={campaignForm.notes}
                onChange={(e) => setCampaignForm({ ...campaignForm, notes: e.target.value })}
                placeholder="Acuerdos, restricciones, contactos…"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Archivos de la campaña · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Plan de medios en Excel y presentación en PDF. Se abren aquí mismo, sin descargar.
            </p>
          </div>
          {canEditFiles ? (
            <label className="btn btn-sm module-upload">
              {busy ? 'Subiendo…' : 'Subir archivo'}
              <input
                type="file"
                hidden
                disabled={busy}
                accept=".pdf,.xlsx,.xls,.csv,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) withBusy(() => onUploadFile(f));
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="panel-body">
          {!files.length ? (
            <EmptyState
              title="Sin Excel ni PDF de campaña"
              description={
                canEditFiles
                  ? 'Sube el plan de medios (Excel) y la presentación (PDF). Quedan embebidos en esta sección y se consultan sin salir del evento.'
                  : 'Cuando el equipo de campaña suba el plan de medios o la presentación, se verán aquí sin necesidad de descargarlos.'
              }
            />
          ) : (
            <div className="campaign-files">
              {files.map((f) => {
                const open = expandedId === f.id;
                const editing = editingId === f.id;
                return (
                  <div
                    key={f.id}
                    className={`campaign-file ${open || editing ? 'campaign-file--open' : ''}`}
                  >
                    <div className="campaign-file__head">
                      <div className="campaign-file__meta">
                        <strong>{f.fileName}</strong>
                        <StatusBadge value={kindLabel(f.kind)} kind="raw" />
                        {f.createdAt ? (
                          <span className="muted kpi-sub">
                            {new Date(f.createdAt).toLocaleDateString('es-MX')}
                          </span>
                        ) : null}
                      </div>
                      <div className="panel-head-actions">
                        <button
                          className={open ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          aria-expanded={open}
                          onClick={() => {
                            setEditingId(null);
                            setExpandedId(open ? null : f.id);
                          }}
                        >
                          {open ? 'Contraer' : 'Expandir'}
                        </button>
                        {isSheet(f.fileName, f.kind) || isPdf(f.fileName, f.kind) ? (
                          <button
                            className={editing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                            type="button"
                            onClick={() => {
                              setExpandedId(null);
                              setEditingId(editing ? null : f.id);
                            }}
                          >
                            {editing
                              ? 'Cerrar editor'
                              : isSheet(f.fileName, f.kind)
                                ? 'Editar hoja'
                                : 'Escribir encima'}
                          </button>
                        ) : null}
                        {canEditFiles ? (
                          <label className="btn ghost btn-sm module-upload">
                            Actualizar
                            <input
                              type="file"
                              hidden
                              disabled={busy}
                              accept=".pdf,.xlsx,.xls,.csv,image/*"
                              onChange={(e) => {
                                const next = e.target.files?.[0];
                                e.target.value = '';
                                if (next) withBusy(() => onReplaceFile(f.id, next));
                              }}
                            />
                          </label>
                        ) : null}
                        <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                          Descargar
                        </a>
                        {canEditFiles ? (
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            disabled={busy}
                            onClick={() => withBusy(() => onDeleteFile(f.id))}
                          >
                            Eliminar
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <div className="campaign-file__body">
                        <FileViewer
                          url={f.url}
                          fileName={f.fileName}
                          kind={f.kind}
                          cacheKey={f.createdAt}
                        />
                      </div>
                    ) : null}

                    {editing ? (
                      <div className="campaign-file__body">
                        {isSheet(f.fileName, f.kind) ? (
                          <SheetEditor
                            key={f.id}
                            url={f.url}
                            fileName={f.fileName}
                            canEdit={canEditFiles}
                            onSave={replaceEventFile(f.id)}
                            onSaved={onFilesChanged}
                          />
                        ) : (
                          <PdfEditor
                            key={f.id}
                            url={f.url}
                            fileName={f.fileName}
                            canEdit={canEditFiles}
                            onSave={replaceEventFile(f.id)}
                            onSaved={onFilesChanged}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
