'use client';

import { useEffect, useRef, useState } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
import { SheetEditor } from '@/components/files/SheetEditor';
import { PdfEditor } from '@/components/files/PdfEditor';
import { DocEditor, type EventDocumentRow } from '@/components/files/DocEditor';
import { pdfToBlocks } from '@/lib/pdf-to-blocks';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import type { EventDetail } from '@/components/events/event-detail.types';

type EventFile = EventDetail['files'][0];

type EventFilesPanelProps = {
  eventId: string;
  closed: boolean;
  files: EventFile[];
  previewFile: EventFile | null;
  setPreviewFile: (file: EventFile | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  /** Recarga el evento tras guardar un archivo editado */
  onFilesChanged: () => void | Promise<void>;
};

function kindLabel(kind?: string | null) {
  if (kind === 'excel') return 'Excel';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Imagen';
  return kind || 'Archivo';
}

/** De qué sección del evento viene el archivo (campaña, corrida…). */
function moduleLabel(module?: string | null) {
  if (module === 'campaign') return 'Campaña';
  if (module === 'finance') return 'Corrida';
  return null;
}

function isSheet(f: EventFile) {
  return f.kind === 'excel' || /\.(xlsx?|csv)$/i.test(f.fileName);
}

function isPdf(f: EventFile) {
  return f.kind === 'pdf' || /\.pdf$/i.test(f.fileName);
}

export function EventFilesPanel({
  eventId,
  closed,
  files,
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

  /** PDF → documento editable: extrae el texto y abre el editor. */
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

  return (
    <div className="stack">
      {/* ── Documento abierto ─────────────────────────────────────────────── */}
      {openDoc ? (
        <div className="panel" ref={previewRef}>
          <div className="panel-head">
            <div>
              <h2>Documento</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                Se escribe aquí y se descarga en PDF.
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

      {/* ── Archivo en edición ────────────────────────────────────────────── */}
      {editing ? (
        <div className="panel" ref={openDoc ? undefined : previewRef}>
          <div className="panel-head">
            <div>
              <h2>Editando · {editing.fileName}</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                Los cambios se guardan sobre el mismo archivo del evento.
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
                fileId={editing.id}
                url={editing.url}
                fileName={editing.fileName}
                canEdit={canEdit}
                onSaved={onFilesChanged}
              />
            ) : (
              <PdfEditor
                key={editing.id}
                fileId={editing.id}
                url={editing.url}
                fileName={editing.fileName}
                canEdit={canEdit}
                onSaved={onFilesChanged}
              />
            )}
          </div>
        </div>
      ) : null}

      {/* ── Vista previa ──────────────────────────────────────────────────── */}
      {previewFile && !editing ? (
        <div className="panel" ref={openDoc ? undefined : previewRef}>
          <div className="panel-head">
            <div>
              <h2>Vista previa</h2>
              <p className="muted kpi-sub" style={{ margin: '0.2rem 0 0' }}>
                {previewFile.fileName}
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

      {/* ── Documentos editables ──────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Documentos · {docs.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Se escriben aquí como en Word y se descargan en PDF.
            </p>
          </div>
          {canEdit ? (
            <button className="btn btn-sm" type="button" disabled={busy === 'doc'} onClick={createDoc}>
              {busy === 'doc' ? 'Creando…' : 'Nuevo documento'}
            </button>
          ) : null}
        </div>
        <div className="panel-body">
          {!docs.length ? (
            <EmptyState
              title="Sin documentos todavía"
              description="Crea un acta, un minuto a minuto o una carta: se escribe aquí y al descargarlo sale en PDF con el formato de Arta."
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
                    <StatusBadge value="Documento" kind="raw" />
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
                      {openDoc?.id === d.id ? 'Cerrar' : 'Abrir'}
                    </button>
                    {d.pdfUrl ? (
                      <a className="btn ghost btn-sm" href={d.pdfUrl} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Archivos ──────────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Archivos del evento · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Excel y PDF se abren y se editan aquí mismo; lo que guardes queda para todo el equipo.
            </p>
          </div>
          {canEdit ? (
            <label className="btn btn-sm module-upload">
              Subir archivo
              <input
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.csv,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="panel-body">
          {!files.length ? (
            <EmptyState
              title="Sin archivos aún"
              description="Sube corrida en Excel, riders en PDF o referencias visuales. Se abren embebidos y se editan sin salir del evento."
            />
          ) : (
            <div className="file-card-list file-card-list--always">
              {files.map((f) => {
                const active = previewFile?.id === f.id;
                const isEditing = editing?.id === f.id;
                const editable = isSheet(f) || isPdf(f);
                return (
                  <div
                    key={f.id}
                    className={`file-card ${active || isEditing ? 'file-card--active' : ''}`}
                  >
                    <div className="file-card__meta">
                      <strong>{f.fileName}</strong>
                      <StatusBadge value={kindLabel(f.kind)} kind="raw" />
                      {moduleLabel(f.module) ? (
                        <StatusBadge value={moduleLabel(f.module)!} kind="raw" />
                      ) : null}
                    </div>
                    <div className="panel-head-actions">
                      <button
                        className={active ? 'btn btn-sm' : 'btn ghost btn-sm'}
                        type="button"
                        onClick={() => onVer(f)}
                      >
                        {active ? 'Ocultar' : 'Ver'}
                      </button>
                      {editable ? (
                        <button
                          className={isEditing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          onClick={() => onEditar(f)}
                        >
                          {isEditing ? 'Cerrar editor' : isSheet(f) ? 'Editar hoja' : 'Escribir encima'}
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
                      <a className="btn ghost btn-sm" href={f.url} download={f.fileName}>
                        Descargar
                      </a>
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
