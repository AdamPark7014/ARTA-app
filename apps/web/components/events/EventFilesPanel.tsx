'use client';

import { DocEditor, FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { useEffect, useMemo, useRef, useState } from 'react';
// Solo el tipo: no arrastra el modulo al bundle.
import type { EventDocumentRow } from '@/components/files/DocEditor';
import { SectionFileCreate } from '@/components/files/SectionFileCreate';
import { pdfToBlocks } from '@/lib/pdf-to-blocks';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import {
  CAMPAIGN_FILE_MODULE,
  CHECKLIST_FILE_MODULE,
  FINANCE_FILE_MODULE,
  GENERAL_FILE_MODULE,
  fileKindLabel,
  fileModuleLabel,
  fileRoleLabel,
  isSalidaPdf,
} from '@/lib/file-modules';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import type { EventDetail } from '@/components/events/event-detail.types';

type EventFile = EventDetail['files'][0];

type EventFilesPanelProps = {
  eventId: string;
  closed: boolean;
  files: EventFile[];
  /** Para etiquetar adjuntos de checklist con el nombre del formato. */
  checklists?: Array<{ id: string; title: string }>;
  previewFile: EventFile | null;
  setPreviewFile: (file: EventFile | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onFilesChanged: () => void | Promise<void>;
};

type FileGroup = {
  key: string;
  label: string;
  hint: string;
  files: EventFile[];
};

function isSheet(f: EventFile) {
  return f.kind === 'excel' || /\.(xlsx?|csv)$/i.test(f.fileName);
}

function isPdf(f: EventFile) {
  return f.kind === 'pdf' || /\.pdf$/i.test(f.fileName);
}

function groupKey(f: EventFile): string {
  if (f.module === CAMPAIGN_FILE_MODULE) return 'campaign';
  if (f.module === FINANCE_FILE_MODULE) return 'finance';
  if (f.module === CHECKLIST_FILE_MODULE || f.checklistId) {
    return f.checklistId ? `checklist:${f.checklistId}` : 'checklist';
  }
  if (f.module === 'oc' || f.kind === 'proof') return 'oc';
  if (f.module === 'sponsors') return 'sponsors';
  if (f.module === GENERAL_FILE_MODULE || !f.module) return 'general';
  return f.module;
}

export function EventFilesPanel({
  eventId,
  closed,
  files,
  checklists = [],
  previewFile,
  setPreviewFile,
  onUpload,
  onDeleteFile,
  onFilesChanged,
}: EventFilesPanelProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<EventFile | null>(null);
  const [docs, setDocs] = useState<EventDocumentRow[]>([]);
  const [openDoc, setOpenDoc] = useState<EventDocumentRow | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const canEdit = !closed;
  const checklistTitle = useMemo(() => {
    const map = new Map(checklists.map((c) => [c.id, c.title]));
    return (id?: string | null) => (id ? map.get(id) : undefined);
  }, [checklists]);

  const groups = useMemo((): FileGroup[] => {
    const buckets = new Map<string, EventFile[]>();
    for (const f of files) {
      const k = groupKey(f);
      const list = buckets.get(k) || [];
      list.push(f);
      buckets.set(k, list);
    }

    const order = ['campaign', 'finance', 'checklist', 'sponsors', 'oc', 'general'];
    const out: FileGroup[] = [];

    const push = (key: string, label: string, hint: string, list: EventFile[]) => {
      if (!list.length) return;
      out.push({ key, label, hint, files: list });
    };

    push(
      'campaign',
      'Campaña',
      'También se editan en la pestaña Campaña del evento.',
      buckets.get('campaign') || [],
    );
    push(
      'finance',
      'Corrida financiera',
      'También se editan en la pestaña Corrida.',
      buckets.get('finance') || [],
    );

    for (const [k, list] of buckets) {
      if (!k.startsWith('checklist')) continue;
      const cid = k.includes(':') ? k.split(':')[1] : null;
      const title = checklistTitle(cid);
      push(
        k,
        title ? `Checklist · ${title}` : 'Checklists',
        'También se ven dentro del formato en la pestaña Checklists.',
        list,
      );
    }

    push(
      'sponsors',
      'Convenios y patrocinios',
      'También se generan y adjuntan en la pestaña Convenios.',
      buckets.get('sponsors') || [],
    );
    push(
      'oc',
      'Órdenes de compra',
      'Comprobantes: también se ven en la pestaña OCs.',
      buckets.get('oc') || [],
    );
    push(
      'general',
      'Documentos generales',
      'Archivos subidos desde esta pestaña.',
      buckets.get('general') || [],
    );

    // Cualquier módulo raro
    for (const [k, list] of buckets) {
      if (order.some((o) => k === o || k.startsWith('checklist'))) continue;
      push(k, fileModuleLabel(k), 'Archivo de otra sección.', list);
    }

    return out;
  }, [files, checklistTitle]);

  useEffect(() => {
    api<EventDocumentRow[]>(`/documents/event/${eventId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [eventId]);

  useEffect(() => {
    if (!previewFile && !editing) return;
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewFile?.id, editing?.id]);

  function onVer(file: EventFile) {
    setEditing(null);
    setPreviewFile(previewFile?.id === file.id ? null : file);
  }

  function onEditar(file: EventFile) {
    setPreviewFile(null);
    setEditing(editing?.id === file.id ? null : file);
  }

  async function importDocx(file: File) {
    setBusy('docx');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('module', 'general');
      fd.append('title', file.name.replace(/\.docx$/i, ''));
      const doc = await api<EventDocumentRow>('/documents/import-docx', {
        method: 'POST',
        body: fd,
      });
      setDocs((prev) => [doc, ...prev]);
      setOpenDoc(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el Word');
    } finally {
      setBusy('');
    }
  }

  async function createDoc() {
    setBusy('doc');
    setError('');
    try {
      const doc = await api<EventDocumentRow>('/documents', {
        method: 'POST',
        body: JSON.stringify({ eventId, title: 'Documento sin título' }),
      });
      setDocs((prev) => [doc, ...prev]);
      setOpenDoc(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el documento');
    } finally {
      setBusy('');
    }
  }

  async function pdfToDoc(file: EventFile) {
    setBusy(file.id);
    setError('');
    try {
      const blocks = await pdfToBlocks(file.url);
      const hasText = blocks.some((b) => b.text.trim());
      if (!hasText) {
        setError(
          `«${file.fileName}» no trae texto seleccionable (parece escaneado). No hay nada que pasar a documento.`,
        );
        return;
      }
      const doc = await api<EventDocumentRow>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          title: file.fileName.replace(/\.pdf$/i, ''),
          module: file.module || undefined,
          sourceFileId: file.id,
          blocks,
        }),
      });
      setDocs((prev) => [doc, ...prev]);
      setOpenDoc(doc);
      setEditing(null);
      setPreviewFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir el PDF');
    } finally {
      setBusy('');
    }
  }

  function renderFileCard(f: EventFile) {
    const active = previewFile?.id === f.id;
    const isEditing = editing?.id === f.id;
    const editable = isSheet(f) || isPdf(f);
    const role = fileRoleLabel(f.kind, f.fileName);
    const official = isSalidaPdf(f.fileName);
    return (
      <div key={f.id} className={`file-card ${active || isEditing ? 'file-card--active' : ''}`}>
        <div className="file-card__meta">
          <strong>{f.fileName}</strong>
          <div className="file-card__badges">
            <StatusBadge value={fileKindLabel(f.kind, f.fileName)} kind="raw" />
            {role ? (
              <StatusBadge
                value={role}
                kind="raw"
                className={official ? 'ok' : isSheet(f) ? 'warn' : undefined}
              />
            ) : null}
            <StatusBadge
              value={fileModuleLabel(f.module, checklistTitle(f.checklistId))}
              kind="raw"
              className="ok"
            />
          </div>
        </div>
        <div className="panel-head-actions">
          {editable ? (
            <button className="btn btn-sm" type="button" onClick={() => onEditar(f)}>
              {isEditing ? 'Cerrar' : isSheet(f) ? 'Editar aquí' : 'Escribir encima'}
            </button>
          ) : (
            <button
              className={active ? 'btn btn-sm' : 'btn ghost btn-sm'}
              type="button"
              onClick={() => onVer(f)}
            >
              {active ? 'Ocultar' : 'Ver'}
            </button>
          )}
          {editable && !isEditing ? (
            <button className="btn ghost btn-sm" type="button" onClick={() => onVer(f)}>
              {active ? 'Ocultar vista' : isPdf(f) ? 'Ver PDF' : 'Vista previa'}
            </button>
          ) : null}
          {isPdf(f) && canEdit ? (
            <button
              className="btn ghost btn-sm"
              type="button"
              disabled={busy === f.id}
              title="Extrae el texto del PDF a un documento que puedes reescribir"
              onClick={() => pdfToDoc(f)}
            >
              {busy === f.id ? 'Convirtiendo…' : 'Pasar a documento'}
            </button>
          ) : null}
          {isPdf(f) ? (
            <a className="btn ghost btn-sm" href={f.url} download={f.fileName}>
              Abrir PDF
            </a>
          ) : null}
          {canEdit ? (
            <button
              className="btn ghost btn-sm btn-danger"
              type="button"
              onClick={() => onDeleteFile(f.id)}
            >
              Eliminar
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {openDoc ? (
        <div className="panel" ref={previewRef}>
          <div className="panel-head">
            <div>
              <h2>Documento</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                Se escribe aquí · la salida oficial es el PDF.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <DocEditor
              doc={openDoc}
              canEdit={canEdit}
              onSaved={(saved) => {
                setOpenDoc(saved);
                setDocs((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
                void onFilesChanged();
              }}
              onDeleted={(id) => {
                setDocs((prev) => prev.filter((d) => d.id !== id));
                setOpenDoc(null);
                void onFilesChanged();
              }}
              onClose={() => setOpenDoc(null)}
            />
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="panel" ref={openDoc ? undefined : previewRef}>
          <div className="panel-head">
            <div>
              <h2>Editando · {editing.fileName}</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                Los cambios se guardan sobre el mismo archivo · sección{' '}
                {fileModuleLabel(editing.module, checklistTitle(editing.checklistId))}.
              </p>
            </div>
            <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(null)}>
              Cerrar
            </button>
          </div>
          <div className="panel-body">
            {isSheet(editing) ? (
              <SheetEditor
                key={editing.id}
                url={editing.url}
                fileName={editing.fileName}
                fileId={editing.id}
                canEdit={canEdit}
                variant={
                  editing.module === CAMPAIGN_FILE_MODULE
                    ? 'campaign'
                    : editing.module === FINANCE_FILE_MODULE
                      ? 'finance'
                      : 'default'
                }
                onSave={replaceEventFile(editing.id)}
                onSaveCells={patchEventFileCells(editing.id)}
                panelEditable={editing.panelEditable !== false}
                blockReason={editing.panelBlockReason}
                onSaved={onFilesChanged}
              />
            ) : (
              <PdfEditor
                key={editing.id}
                url={editing.url}
                fileName={editing.fileName}
                canEdit={canEdit}
                onSave={replaceEventFile(editing.id)}
                onSaved={onFilesChanged}
              />
            )}
          </div>
        </div>
      ) : null}

      {previewFile && !editing ? (
        <div className="panel" ref={openDoc ? undefined : previewRef}>
          <div className="panel-head">
            <div>
              <h2>Vista previa</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                {previewFile.fileName} ·{' '}
                {fileModuleLabel(previewFile.module, checklistTitle(previewFile.checklistId))}
              </p>
            </div>
            <button className="btn ghost btn-sm" type="button" onClick={() => setPreviewFile(null)}>
              Cerrar
            </button>
          </div>
          <div className="panel-body">
            <FileViewer
              url={previewFile.url}
              fileName={previewFile.fileName}
              kind={previewFile.kind}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Documentos · {docs.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Entra Word (.docx) o Excel (.xlsx) como copia de trabajo → se edita embebido aquí →
              sale el PDF oficial. Actas y cartas se escriben en el documento y se descargan en PDF.
            </p>
          </div>
          {canEdit && docs.length ? (
            <button className="btn btn-sm" type="button" disabled={busy === 'doc'} onClick={createDoc}>
              {busy === 'doc' ? 'Creando…' : 'Nuevo documento'}
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {canEdit ? (
            <SectionFileCreate
              staysIn="Documentos"
              busy={busy === 'doc' || busy === 'docx'}
              compact={docs.length > 0 || files.length > 0}
              hideHint
              actions={[
                {
                  id: 'doc',
                  title: 'Nuevo documento',
                  description: 'Acta o carta embebida. Se escribe aquí.',
                  after: 'Se abre el editor; al terminar sales en PDF.',
                  tone: 'doc',
                  emphasis: 'primary',
                  onClick: () => void createDoc(),
                },
                {
                  id: 'import-docx',
                  title: 'Importar Word (.docx)',
                  description: 'Entra una vez; después solo se reedita aquí.',
                  after: 'Queda como documento embebido; sale en PDF.',
                  tone: 'doc',
                  emphasis: 'secondary',
                  accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  onFile: (f) => void importDocx(f),
                },
                {
                  id: 'upload',
                  title: 'Subir Excel de trabajo',
                  description: 'Copia de trabajo .xlsx para editar embebido.',
                  after: 'Aparece en Documentos generales; el PDF se saca desde el editor.',
                  tone: 'excel',
                  emphasis: 'secondary',
                  accept: '.xlsx,.xls,.csv',
                  onFile: (f) => void onUpload(f),
                },
                {
                  id: 'upload-other',
                  title: 'Subir PDF / imagen',
                  description: 'Referencias o salidas ya en PDF.',
                  after: 'Quedan en Documentos generales.',
                  tone: 'upload',
                  emphasis: 'secondary',
                  accept: '.pdf,image/*',
                  onFile: (f) => void onUpload(f),
                },
              ]}
            />
          ) : null}
          {!docs.length ? (
            <EmptyState
              title="Sin documentos todavía"
              description="Crea un acta o importa un Word: se edita aquí y al salir queda en PDF con el formato de Arta."
            />
          ) : (
            <div className="file-card-list file-card-list--always">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className={`file-card ${openDoc?.id === d.id ? 'file-card--active' : ''}`}
                >
                  <div className="file-card__meta">
                    <strong>{d.title}</strong>
                    <div className="file-card__badges">
                      <StatusBadge value="Documento" kind="raw" />
                      {d.pdfUrl ? (
                        <StatusBadge value="PDF oficial" kind="raw" className="ok" />
                      ) : (
                        <StatusBadge value="Copia de trabajo" kind="raw" className="warn" />
                      )}
                    </div>
                    <span className="muted kpi-sub">
                      v{d.version}
                      {d.updatedBy ? ` · ${d.updatedBy.fullName}` : ''}
                    </span>
                  </div>
                  <div className="panel-head-actions">
                    <button
                      className={openDoc?.id === d.id ? 'btn btn-sm' : 'btn ghost btn-sm'}
                      type="button"
                      onClick={() => setOpenDoc(openDoc?.id === d.id ? null : d)}
                    >
                      {openDoc?.id === d.id ? 'Cerrar' : 'Editar aquí'}
                    </button>
                    {d.pdfUrl ? (
                      <a className="btn ghost btn-sm" href={d.pdfUrl} target="_blank" rel="noreferrer">
                        Ver PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Archivos del evento · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Inventario por sección. Cada archivo también vive en su pestaña (Campaña, Corrida,
              Checklists…). Excel = copia de trabajo; «(salida).pdf» = PDF oficial.
            </p>
          </div>
        </div>
        <div className="panel-body">
          {!files.length ? (
            <EmptyState
              title="Sin archivos aún"
              description="Sube desde Campaña, Corrida o un checklist — o usa las tarjetas de arriba. Así sabes en qué sección quedó."
            />
          ) : (
            <div className="stack">
              {groups.map((g) => (
                <div key={g.key} className="file-section-group">
                  <div className="file-section-group__head">
                    <h3>
                      {g.label}{' '}
                      <span className="file-section-group__count">{g.files.length}</span>
                    </h3>
                    <span className="muted kpi-sub">{g.hint}</span>
                  </div>
                  <div className="file-card-list file-card-list--always">
                    {g.files.map(renderFileCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
