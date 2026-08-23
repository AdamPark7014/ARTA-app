'use client';

import { useEffect, useRef } from 'react';
import { FileViewer } from '@/components/files/FileViewer';
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
        <div className="panel" ref={previewRef} style={{ overflow: 'visible' }}>
          <div className="panel-head">
            <h2>Vista previa · {previewFile.fileName}</h2>
            <button className="btn ghost" type="button" onClick={() => setPreviewFile(null)}>
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
          <h2>Exceles y PDFs embebidos</h2>
          {!closed ? (
            <label className="btn" style={{ cursor: 'pointer' }}>
              Subir archivo
              <input
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.csv,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="panel-body">
          {!files.length ? (
            <p className="muted">Sube Excel o PDF del evento para verlo embebido aquí.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Tipo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const active = previewFile?.id === f.id;
                  return (
                    <tr key={f.id}>
                      <td>{f.fileName}</td>
                      <td>
                        <StatusBadge value={f.kind || 'file'} kind="raw" />
                      </td>
                      <td className="row">
                        <button
                          className={active ? 'btn' : 'btn ghost'}
                          type="button"
                          onClick={() => onVer(f)}
                        >
                          {active ? 'Ocultar' : 'Ver'}
                        </button>
                        <a className="btn ghost" href={f.url} target="_blank" rel="noreferrer">
                          Descargar
                        </a>
                        {!closed ? (
                          <button className="btn ghost" type="button" onClick={() => onDeleteFile(f.id)}>
                            Eliminar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
