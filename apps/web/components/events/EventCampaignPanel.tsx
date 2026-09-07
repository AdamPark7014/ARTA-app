'use client';

import { useEffect, useState } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
import { SheetEditor } from '@/components/files/SheetEditor';
import { PdfEditor } from '@/components/files/PdfEditor';
import {
  buildCampaignExpensesWorkbook,
  campaignExpensesFileName,
  catalogFromPageConcepts,
  defaultCampaignConceptRows,
  workbookToXlsxBlob,
  type CampaignConceptPageRow,
} from '@/lib/campaign-sheet-template';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import { SectionFileCreate } from '@/components/files/SectionFileCreate';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlowSteps } from '@/components/ui/FlowSteps';
import { FormGrid } from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventDetail, EventFile } from '@/components/events/event-detail.types';
import { fileKindLabel, fileRoleLabel, isSalidaPdf } from '@/lib/file-modules';

type CampaignForm = {
  type: string;
  notes: string;
  channels: string;
  budget: string;
  mediaPlan: string;
  creatives: string;
  timeline: string;
  concepts: CampaignConceptPageRow[];
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

function kindLabel(kind?: string | null, fileName?: string) {
  return fileKindLabel(kind, fileName);
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
  /** Tras «Nueva hoja de gastos», abrir el Excel recién creado */
  const [openNewestSheet, setOpenNewestSheet] = useState(false);

  useEffect(() => {
    if (!openNewestSheet || !files.length) return;
    const sheets = files
      .filter((f) => isSheet(f.fileName, f.kind))
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    const newest = sheets[0];
    if (newest) {
      setExpandedId(null);
      setEditingId(newest.id);
    }
    setOpenNewestSheet(false);
  }, [files, openNewestSheet]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function createExpensesSheet() {
    await withBusy(async () => {
      const wb = buildCampaignExpensesWorkbook(
        {
          eventName: event.name,
          venue: event.venue,
          city: event.city,
          startsAt: event.startsAt,
          promoter: event.promoter || 'ARTA PRODUCCIONES',
        },
        {
          campaignType: campaignForm.type || event.campaign?.type,
          catalog: catalogFromPageConcepts(campaignForm.concepts),
        },
      );
      const blob = workbookToXlsxBlob(wb);
      const name = campaignExpensesFileName(event.name);
      const file = new File([blob], name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await onUploadFile(file);
      setOpenNewestSheet(true);
    });
  }

  function patchConcept(idx: number, patch: Partial<CampaignConceptPageRow>) {
    const concepts = campaignForm.concepts.map((row, i) =>
      i === idx ? { ...row, ...patch } : row,
    );
    setCampaignForm({ ...campaignForm, concepts });
  }

  function addConcept() {
    setCampaignForm({
      ...campaignForm,
      concepts: [
        ...campaignForm.concepts,
        {
          concept: '',
          included: true,
          convenio: false,
          precioInterno: null,
          precioExterno: null,
        },
      ],
    });
  }

  function removeConcept(idx: number) {
    setCampaignForm({
      ...campaignForm,
      concepts: campaignForm.concepts.filter((_, i) => i !== idx),
    });
  }

  function resetConceptsFromCatalog() {
    setCampaignForm({
      ...campaignForm,
      concepts: defaultCampaignConceptRows(),
    });
  }

  const canEditFiles = canCampaign && !closed;
  const canEditConcepts = canEditFiles;

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
              Encabezado y formato fijos (como el PDF). Los conceptos cambian por show — aquí van
              con precio interno y externo para armar la hoja automáticamente.
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
            <h2>Conceptos · precio interno / externo</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Lista en página: cada concepto con su precio. Al crear la hoja, el COSTO se toma del
              precio interno (campaña Interna) o externo (Externa). Marca cuáles van en este show.
            </p>
          </div>
          {canEditConcepts ? (
            <div className="panel-head-actions">
              <button className="btn ghost btn-sm" type="button" onClick={addConcept}>
                + Concepto
              </button>
              <button className="btn ghost btn-sm" type="button" onClick={resetConceptsFromCatalog}>
                Restaurar catálogo base
              </button>
            </div>
          ) : null}
        </div>
        <div className="panel-body">
          {!campaignForm.concepts.length ? (
            <EmptyState
              title="Sin conceptos"
              description="Carga el catálogo base del PDF o agrega conceptos a mano. Después podrás pegar precios interno/externo."
            >
              {canEditConcepts ? (
                <button
                  className="btn btn-sm"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={resetConceptsFromCatalog}
                >
                  Cargar catálogo base
                </button>
              ) : null}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '2.5rem' }}>Show</th>
                    <th>Concepto</th>
                    <th style={{ width: '5.5rem' }}>Convenio</th>
                    <th style={{ width: '8rem' }}>Precio interno</th>
                    <th style={{ width: '8rem' }}>Precio externo</th>
                    <th>Descripción (convenios)</th>
                    {canEditConcepts ? <th style={{ width: '4rem' }} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {campaignForm.concepts.map((row, idx) => (
                    <tr key={`${idx}-${row.concept.slice(0, 12)}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.included !== false}
                          disabled={!canEditConcepts}
                          title="Incluir en la hoja de este show"
                          onChange={(e) => patchConcept(idx, { included: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          disabled={!canEditConcepts}
                          value={row.concept}
                          onChange={(e) => patchConcept(idx, { concept: e.target.value })}
                          placeholder="CONCEPTO"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!row.convenio}
                          disabled={!canEditConcepts}
                          title="Convenio / medio (cortesías en lugar de costo monetario)"
                          onChange={(e) => patchConcept(idx, { convenio: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          type="number"
                          disabled={!canEditConcepts || !!row.convenio}
                          value={row.precioInterno ?? ''}
                          onChange={(e) =>
                            patchConcept(idx, {
                              precioInterno: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          type="number"
                          disabled={!canEditConcepts || !!row.convenio}
                          value={row.precioExterno ?? ''}
                          onChange={(e) =>
                            patchConcept(idx, {
                              precioExterno: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          className="field"
                          disabled={!canEditConcepts || !row.convenio}
                          value={row.description || ''}
                          onChange={(e) => patchConcept(idx, { description: e.target.value })}
                          placeholder={row.convenio ? 'Detalle del acuerdo…' : ''}
                        />
                      </td>
                      {canEditConcepts ? (
                        <td>
                          <button
                            className="btn ghost btn-sm btn-danger"
                            type="button"
                            onClick={() => removeConcept(idx)}
                          >
                            Quitar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted kpi-sub" style={{ marginTop: '0.75rem' }}>
            Guarda la campaña para persistir precios. «Nueva hoja de gastos» usa esta lista (solo
            filas marcadas) y el tipo Interna/Externa para el COSTO.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Campaña · Excel de gastos · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Formato «GASTOS DE PUBLICIDAD Y CONVENIOS». La hoja (.xlsx) es la copia de trabajo;
              el PDF oficial se genera desde el editor. Todo queda en esta pestaña.
            </p>
          </div>
        </div>
        <div className="panel-body">
          {canEditFiles ? (
            <SectionFileCreate
              staysIn="Campaña"
              busy={busy}
              compact={files.length > 0}
              hideHint={files.length > 0}
              actions={[
                {
                  id: 'new-sheet',
                  title: 'Nueva hoja de gastos',
                  description: 'Plantilla con conceptos, costos y cortesías del show.',
                  after: 'Se abre aquí para editar. Luego puedes sacar el PDF oficial.',
                  tone: 'excel',
                  emphasis: 'primary',
                  onClick: () => void createExpensesSheet(),
                },
                {
                  id: 'upload',
                  title: 'Subir mi Excel o PDF',
                  description: 'Si ya tienen el archivo del show, súbelo aquí.',
                  after: 'Queda listado abajo, en Campaña.',
                  tone: 'upload',
                  emphasis: 'secondary',
                  accept: '.pdf,.xlsx,.xls,.csv,image/*',
                  onFile: (f) => void withBusy(() => onUploadFile(f)),
                },
              ]}
            />
          ) : null}
          {!files.length ? (
            <EmptyState
              title="Sin Excel de campaña"
              description={
                canEditFiles
                  ? 'Crea la hoja con los conceptos o sube el Excel/PDF del show. Todo queda en esta pestaña.'
                  : 'Cuando el equipo de campaña suba el plan, se verá aquí embebido.'
              }
            />
          ) : (
            <div className="campaign-files">
              {files.map((f) => {
                const open = expandedId === f.id;
                const editing = editingId === f.id;
                const sheet = isSheet(f.fileName, f.kind);
                const pdf = isPdf(f.fileName, f.kind);
                const editable = sheet || pdf;
                const role = fileRoleLabel(f.kind, f.fileName);
                const official = isSalidaPdf(f.fileName);
                return (
                  <div
                    key={f.id}
                    className={`campaign-file ${open || editing ? 'campaign-file--open' : ''}`}
                  >
                    <div className="campaign-file__head">
                      <div className="campaign-file__meta">
                        <strong>{f.fileName}</strong>
                        <StatusBadge value={kindLabel(f.kind, f.fileName)} kind="raw" />
                        {role ? (
                          <StatusBadge
                            value={role}
                            kind="raw"
                            className={official ? 'ok' : sheet ? 'warn' : undefined}
                          />
                        ) : null}
                        <StatusBadge value="Campaña" kind="raw" className="ok" />
                        {f.createdAt ? (
                          <span className="muted kpi-sub">
                            {new Date(f.createdAt).toLocaleDateString('es-MX')}
                          </span>
                        ) : null}
                      </div>
                      <div className="panel-head-actions">
                        {editable ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => {
                              setExpandedId(null);
                              setEditingId(editing ? null : f.id);
                            }}
                          >
                            {editing
                              ? 'Cerrar editor'
                              : sheet
                                ? 'Editar aquí'
                                : 'Anotar PDF'}
                          </button>
                        ) : null}
                        <button
                          className={open ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          aria-expanded={open}
                          onClick={() => {
                            setEditingId(null);
                            setExpandedId(open ? null : f.id);
                          }}
                        >
                          {open ? 'Contraer' : pdf ? 'Ver PDF' : 'Vista previa'}
                        </button>
                        {canEditFiles ? (
                          <label className="btn ghost btn-sm module-upload">
                            Reemplazar
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
                        {pdf ? (
                          <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                            Abrir PDF
                          </a>
                        ) : null}
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
                            fileId={f.id}
                            canEdit={canEditFiles}
                            variant="campaign"
                            onSave={replaceEventFile(f.id)}
                            onSaveCells={patchEventFileCells(f.id)}
                            panelEditable={f.panelEditable !== false}
                            blockReason={f.panelBlockReason}
                            onSaved={onFilesChanged}
                          />
                        ) : (
                          <div className="stack">
                            <div className="module-banner">
                              Un PDF de campaña (como el de gastos) no se reescribe celda a celda.
                              Usa <strong>Nueva hoja de gastos</strong> o <strong>Editar aquí</strong>{' '}
                              en el Excel para agregar/quitar conceptos y totales. Aquí solo puedes
                              anotar texto encima del PDF.
                            </div>
                            <PdfEditor
                              key={f.id}
                              url={f.url}
                              fileName={f.fileName}
                              canEdit={canEditFiles}
                              onSave={replaceEventFile(f.id)}
                              onSaved={onFilesChanged}
                            />
                          </div>
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
