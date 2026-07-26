'use client';

import { FileViewer } from '@/components/files/FileViewer';
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
  return (
    <div className="stack">
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
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.fileName}</td>
                    <td>
                      <span className="badge">{f.kind || 'file'}</span>
                    </td>
                    <td className="row">
                      <button className="btn ghost" type="button" onClick={() => setPreviewFile(f)}>
                        Ver
                      </button>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        Descargar
                      </a>
                      {!closed ? (
                        <button className="btn ghost" type="button" onClick={() => onDeleteFile(f.id)}>
                          Eliminar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {previewFile ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{previewFile.fileName}</h2>
            <button className="btn ghost" type="button" onClick={() => setPreviewFile(null)}>
              Cerrar
            </button>
          </div>
          <div className="panel-body">
            <FileViewer url={previewFile.url} fileName={previewFile.fileName} kind={previewFile.kind} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
