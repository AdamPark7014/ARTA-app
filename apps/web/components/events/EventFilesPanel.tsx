'use client';

import { useEffect, useRef } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { EventDetail } from '@/components/events/event-detail.types';

type EventFile = EventDetail['files'][0];

type EventFilesPanelProps = {
  closed: boolean;
  files: EventFile[];
  previewFile: EventFile | null;
  setPreviewFile: (file: EventFile | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
};

function kindLabel(kind?: string | null) {
  if (kind === 'excel') return 'Excel';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Imagen';
  return kind || 'Archivo';
}

export function EventFilesPanel({
  closed,
  files,
  previewFile,
  setPreviewFile,
  onUpload,
  onDeleteFile,
}: EventFilesPanelProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewFile) return;
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewFile?.id]);

  function onVer(file: EventFile) {
    if (previewFile?.id === file.id) {
      setPreviewFile(null);
      return;
    }
    setPreviewFile(file);
  }

  return (
    <div className="stack">
      {previewFile ? (
        <div className="panel" ref={previewRef}>
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
            <FileViewer url={previewFile.url} fileName={previewFile.fileName} kind={previewFile.kind} />
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Archivos del evento · {files.length}</h2>
            <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
              Excel, PDF e imágenes embebidos para consulta rápida del equipo.
            </p>
          </div>
          {!closed ? (
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
              description="Sube corrida en Excel, riders en PDF o referencias visuales. Se verán embebidos aquí."
            />
          ) : (
            <>
              <div className="file-card-list">
                {files.map((f) => {
                  const active = previewFile?.id === f.id;
                  return (
                    <div key={f.id} className={`file-card ${active ? 'file-card--active' : ''}`}>
                      <div className="file-card__meta">
                        <strong>{f.fileName}</strong>
                        <StatusBadge value={kindLabel(f.kind)} kind="raw" />
                      </div>
                      <div className="panel-head-actions">
                        <button
                          className={active ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          onClick={() => onVer(f)}
                        >
                          {active ? 'Ocultar' : 'Ver aquí'}
                        </button>
                        <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                          Descargar
                        </a>
                        {!closed ? (
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
              <div className="table-wrap files-table-desktop">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Tipo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => {
                      const active = previewFile?.id === f.id;
                      return (
                        <tr key={f.id}>
                          <td>{f.fileName}</td>
                          <td>
                            <StatusBadge value={kindLabel(f.kind)} kind="raw" />
                          </td>
                          <td>
                            <div className="panel-head-actions">
                              <button
                                className={active ? 'btn btn-sm' : 'btn ghost btn-sm'}
                                type="button"
                                onClick={() => onVer(f)}
                              >
                                {active ? 'Ocultar' : 'Ver'}
                              </button>
                              <a className="btn ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                                Descargar
                              </a>
                              {!closed ? (
                                <button
                                  className="btn ghost btn-sm btn-danger"
                                  type="button"
                                  onClick={() => onDeleteFile(f.id)}
                                >
                                  Eliminar
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
