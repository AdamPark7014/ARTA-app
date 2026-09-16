'use client';

import { DocEditor, FileViewer, PdfEditor, SheetEditor } from '@/components/files/lazy';
import { useEffect, useMemo, useState } from 'react';
// Solo el tipo: no arrastra el módulo al bundle.
import type { EventDocumentRow } from '@/components/files/DocEditor';
import { pdfToBlocks } from '@/lib/pdf-to-blocks';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import {
  CAMPAIGN_FILE_MODULE,
  CHECKLIST_FILE_MODULE,
  FINANCE_FILE_MODULE,
} from '@/lib/file-modules';
import { EmptyLite, FileRow, SectionHead, Seg } from '@/components/ui/Lite';
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

type SectionKey = 'all' | 'campaign' | 'finance' | 'checklist' | 'sponsors' | 'oc' | 'general';

const SECTION_LABEL: Record<Exclude<SectionKey, 'all'>, string> = {
  campaign: 'Campaña',
  finance: 'Corrida',
  checklist: 'Formatos',
  sponsors: 'Convenios',
  oc: 'Órdenes de compra',
  general: 'Generales',
};

function isSheet(f: EventFile) {
  return f.kind === 'excel' || /\.(xlsx?|csv)$/i.test(f.fileName);
}

function isPdf(f: EventFile) {
  return f.kind === 'pdf' || /\.pdf$/i.test(f.fileName);
}

function sectionOf(f: EventFile): Exclude<SectionKey, 'all'> {
  if (f.module === CAMPAIGN_FILE_MODULE) return 'campaign';
  if (f.module === FINANCE_FILE_MODULE) return 'finance';
  if (f.module === CHECKLIST_FILE_MODULE || f.checklistId) return 'checklist';
  if (f.module === 'oc' || f.kind === 'proof') return 'oc';
  if (f.module === 'sponsors') return 'sponsors';
  return 'general';
}

function fileKind(f: EventFile): 'xlsx' | 'pdf' | 'file' {
  return isSheet(f) ? 'xlsx' : isPdf(f) ? 'pdf' : 'file';
}

function when(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Documentos del evento.
 *
 * Una lista con filtro por sección; el editor o la vista previa se abren bajo
 * el archivo. Antes había tres paneles apilados arriba (documento, editor,
 * vista previa), cuatro tarjetas de creación con su microcopy y el inventario
 * agrupado repitiendo la sección en cada tarjeta.
 */
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
  const [section, setSection] = useState<SectionKey>('all');
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

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of files) {
      const k = sectionOf(f);
      acc[k] = (acc[k] || 0) + 1;
    }
    return acc;
  }, [files]);

  const visible = useMemo(
    () => (section === 'all' ? files : files.filter((f) => sectionOf(f) === section)),
    [files, section],
  );

  useEffect(() => {
    api<EventDocumentRow[]>(`/documents/event/${eventId}`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [eventId]);

  async function importDocx(file: File) {
    setBusy('docx');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', eventId);
      fd.append('module', 'general');
      fd.append('title', file.name.replace(/\.docx$/i, ''));
      const doc = await api<EventDocumentRow>('/documents/import-docx', { method: 'POST', body: fd });
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
      if (!blocks.some((b) => b.text.trim())) {
        setError(`«${file.fileName}» no trae texto seleccionable (parece escaneado).`);
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

  const segOptions = [
    { key: 'all' as const, label: 'Todos', count: files.length },
    ...(Object.keys(SECTION_LABEL) as Array<Exclude<SectionKey, 'all'>>)
      .filter((k) => counts[k])
      .map((k) => ({ key: k, label: SECTION_LABEL[k], count: counts[k] })),
  ];

  return (
    <div className="sx-stack">
      <SectionHead
        title="Documentos"
        sub={`${docs.length ? `${docs.length} escritos · ` : ''}${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`}
      >
        {canEdit ? (
          <>
            <label className="btn ghost btn-sm hub-upload">
              Subir archivo
              <input
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.csv,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onUpload(f);
                }}
              />
            </label>
            <label className="btn-quiet hub-upload">
              Importar Word
              <input
                type="file"
                hidden
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importDocx(f);
                }}
              />
            </label>
            <button className="btn btn-sm" type="button" disabled={busy === 'doc'} onClick={createDoc}>
              {busy === 'doc' ? 'Creando…' : '+ Documento'}
            </button>
          </>
        ) : null}
      </SectionHead>

      {error ? (
        <p className="hub-error" role="alert">
          {error}
        </p>
      ) : null}

      {!docs.length && !files.length ? (
        <div className="surface">
          <EmptyLite
            icon="▤"
            title="Sin documentos"
            text={canEdit ? 'Escribe un acta, importa un Word o sube un archivo.' : undefined}
          />
        </div>
      ) : null}

      {docs.length ? (
        <div className="hub-list">
          {docs.map((d) => {
            const open = openDoc?.id === d.id;
            return (
              <div key={d.id} className={`hub-item ${open ? 'is-open' : ''}`}>
                <FileRow
                  kind="file"
                  name={d.title}
                  meta={`Documento · v${d.version}${d.updatedBy ? ` · ${d.updatedBy.fullName}` : ''}`}
                >
                  <button className="btn-quiet" type="button" onClick={() => setOpenDoc(open ? null : d)}>
                    {open ? 'Cerrar' : canEdit ? 'Escribir' : 'Ver'}
                  </button>
                  {d.pdfUrl ? (
                    <a className="btn-quiet" href={d.pdfUrl} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  ) : null}
                </FileRow>
                {open ? (
                  <div className="surface hub-pane">
                    <div className="hub-pane__body">
                      <DocEditor
                        doc={d}
                        canEdit={canEdit}
                        onSaved={(saved) => {
                          setOpenDoc(saved);
                          setDocs((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
                          void onFilesChanged();
                        }}
                        onDeleted={(id) => {
                          setDocs((prev) => prev.filter((x) => x.id !== id));
                          setOpenDoc(null);
                          void onFilesChanged();
                        }}
                        onClose={() => setOpenDoc(null)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {files.length ? (
        <>
          {segOptions.length > 2 ? (
            <Seg label="Sección de los archivos" value={section} onChange={setSection} options={segOptions} />
          ) : null}

          <div className="hub-list">
            {visible.map((f) => {
              const previewing = previewFile?.id === f.id;
              const isEditing = editing?.id === f.id;
              const editable = canEdit && (isSheet(f) || isPdf(f));
              const label = checklistTitle(f.checklistId) || SECTION_LABEL[sectionOf(f)];
              return (
                <div key={f.id} className={`hub-item ${previewing || isEditing ? 'is-open' : ''}`}>
                  <FileRow
                    kind={fileKind(f)}
                    name={f.fileName}
                    meta={[label, when(f.createdAt)].filter(Boolean).join(' · ')}
                  >
                    <button
                      className="btn-quiet"
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setPreviewFile(previewing ? null : f);
                      }}
                    >
                      {previewing ? 'Ocultar' : 'Ver'}
                    </button>
                    {editable ? (
                      <button
                        className="btn-quiet"
                        type="button"
                        onClick={() => {
                          setPreviewFile(null);
                          setEditing(isEditing ? null : f);
                        }}
                      >
                        {isEditing ? 'Cerrar' : isSheet(f) ? 'Editar' : 'Escribir encima'}
                      </button>
                    ) : null}
                    {isPdf(f) && canEdit ? (
                      <button
                        className="btn-quiet"
                        type="button"
                        disabled={busy === f.id}
                        title="Pasa el texto del PDF a un documento editable"
                        onClick={() => pdfToDoc(f)}
                      >
                        {busy === f.id ? 'Convirtiendo…' : 'A documento'}
                      </button>
                    ) : null}
                    <a className="btn-quiet" href={f.url} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                    {canEdit ? (
                      <button
                        className="icon-btn icon-btn--danger"
                        type="button"
                        aria-label={`Eliminar ${f.fileName}`}
                        onClick={() => onDeleteFile(f.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </FileRow>

                  {isEditing ? (
                    <div className="surface hub-pane">
                      <div className="hub-pane__head">
                        <p className="hub-pane__title">Editando · {f.fileName}</p>
                        <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditing(null)}>
                          ×
                        </button>
                      </div>
                      <div className="hub-pane__body">
                        {isSheet(f) ? (
                          <SheetEditor
                            key={f.id}
                            url={f.url}
                            fileName={f.fileName}
                            fileId={f.id}
                            canEdit={canEdit}
                            variant={
                              f.module === CAMPAIGN_FILE_MODULE
                                ? 'campaign'
                                : f.module === FINANCE_FILE_MODULE
                                  ? 'finance'
                                  : 'default'
                            }
                            onSave={replaceEventFile(f.id)}
                            onSaveCells={patchEventFileCells(f.id)}
                            panelEditable={f.panelEditable !== false}
                            blockReason={f.panelBlockReason}
                            onSaved={onFilesChanged}
                          />
                        ) : (
                          <PdfEditor
                            key={f.id}
                            url={f.url}
                            fileName={f.fileName}
                            canEdit={canEdit}
                            onSave={replaceEventFile(f.id)}
                            onSaved={onFilesChanged}
                          />
                        )}
                      </div>
                    </div>
                  ) : null}

                  {previewing && !isEditing ? (
                    <div className="surface hub-pane">
                      <div className="hub-pane__body">
                        <FileViewer url={f.url} fileName={f.fileName} kind={f.kind} cacheKey={f.createdAt} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!visible.length ? <p className="t-muted t-small">Sin archivos en esta sección.</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
