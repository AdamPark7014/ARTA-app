'use client';

import { SignaturePad } from '@/components/ui/SignaturePad';
import { FileViewer } from '@/components/files/FileViewer';
import type { Checklist, EventDetail } from '@/components/events/event-detail.types';

type EventChecklistsPanelProps = {
  event: EventDetail;
  activeChecklist: Checklist | null;
  closed: boolean;
  saving: boolean;
  userFullName: string;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onSaveChecklist: () => Promise<void>;
  onRegeneratePdf: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onUpdateItem: (
    sectionId: string,
    itemId: string,
    patch: Partial<Checklist['dataJson']['sections'][0]['items'][0]>,
  ) => void;
  onSignChecklist: (
    kind: 'ENTREGADO' | 'AUTORIZADO',
    payload: { imageDataUrl: string; signerName: string },
  ) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
};

export function EventChecklistsPanel({
  event,
  activeChecklist,
  closed,
  saving,
  userFullName,
  onOpenChecklist,
  onSaveChecklist,
  onRegeneratePdf,
  onUpload,
  onUpdateItem,
  onSignChecklist,
  onRestoreVersion,
}: EventChecklistsPanelProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeChecklist ? '280px 1fr' : '1fr', gap: 16 }}>
      <div className="panel">
        <div className="panel-head">
          <h2>Formatos</h2>
        </div>
        <div className="panel-body stack">
          {event.checklists.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`btn ${activeChecklist?.id === c.id ? '' : 'ghost'}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => onOpenChecklist(c)}
            >
              {c.title} · {c.progressPct}%
            </button>
          ))}
        </div>
      </div>

      {activeChecklist ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>{activeChecklist.title}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {activeChecklist.lastEditedBy
                  ? `Última: ${activeChecklist.lastEditedBy.fullName}`
                  : 'Sin ediciones'}
              </div>
            </div>
            <div className="row">
              {activeChecklist.pdfUrl ? (
                <a className="btn" href={activeChecklist.pdfUrl} target="_blank" rel="noreferrer">
                  Abrir PDF
                </a>
              ) : (
                <button className="btn" type="button" onClick={onRegeneratePdf}>
                  Generar PDF
                </button>
              )}
              {activeChecklist.pdfUrl ? (
                <button className="btn ghost" type="button" onClick={onRegeneratePdf}>
                  Regenerar PDF
                </button>
              ) : null}
              {!closed ? (
                <label className="btn ghost" style={{ cursor: 'pointer' }}>
                  Subir Excel/PDF
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
              <button className="btn" type="button" disabled={saving || closed} onClick={onSaveChecklist}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
          <div className="panel-body">
            {(activeChecklist.dataJson?.sections || [])
              .filter((section) => section.id !== 'firmas')
              .map((section) => (
                <div className="check-section" key={section.id}>
                  <h3>{section.title}</h3>
                  {section.items.map((item) => (
                    <div className="check-item" key={item.id}>
                      {item.type === 'check' || !item.type ? (
                        <input
                          type="checkbox"
                          disabled={closed}
                          checked={!!item.done}
                          onChange={(e) => onUpdateItem(section.id, item.id, { done: e.target.checked })}
                        />
                      ) : (
                        <span />
                      )}
                      <div>
                        <div>{item.label}</div>
                        {item.type === 'text' || item.type === 'number' || item.type === 'date' ? (
                          <input
                            style={{ marginTop: 6, width: '100%' }}
                            type={item.type === 'text' ? 'text' : item.type}
                            disabled={closed}
                            value={item.value ?? ''}
                            onChange={(e) =>
                              onUpdateItem(section.id, item.id, {
                                value: item.type === 'number' ? Number(e.target.value) : e.target.value,
                              })
                            }
                          />
                        ) : null}
                        {item.type === 'select' ? (
                          <select
                            style={{ marginTop: 6, width: '100%' }}
                            disabled={closed}
                            value={String(item.value ?? '')}
                            onChange={(e) => onUpdateItem(section.id, item.id, { value: e.target.value })}
                          >
                            {(item.options || []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

            <div className="check-section">
              <h3>Firmas digitales</h3>
              <div className="sig-grid">
                <SignaturePad
                  label="Entregado"
                  signerName={userFullName}
                  existing={activeChecklist.deliveredSignature}
                  onSign={(p) => onSignChecklist('ENTREGADO', p)}
                />
                <SignaturePad
                  label="Autorizado"
                  signerName={userFullName}
                  existing={activeChecklist.authorizedSignature}
                  onSign={(p) => onSignChecklist('AUTORIZADO', p)}
                />
              </div>
            </div>

            <div className="check-section">
              <h3>PDF embebido</h3>
              {activeChecklist.pdfUrl ? (
                <FileViewer
                  url={activeChecklist.pdfUrl}
                  fileName={`${activeChecklist.title}.pdf`}
                  kind="pdf"
                />
              ) : (
                <p className="muted">
                  Aún no hay PDF. Guarda el checklist o pulsa <strong>Generar PDF</strong> — se
                  incrusta aquí automáticamente.
                </p>
              )}
            </div>

            <div className="check-section">
              <h3>Historial de versiones</h3>
              {(activeChecklist.versions || []).length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Editor</th>
                      <th>Nota</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(activeChecklist.versions || []).map((v) => (
                      <tr key={v.id}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {new Date(v.createdAt).toLocaleString('es-MX')}
                        </td>
                        <td>{v.editedBy?.fullName || '—'}</td>
                        <td className="muted">{v.note || '—'}</td>
                        <td>
                          {!closed ? (
                            <button
                              className="btn ghost"
                              type="button"
                              disabled={saving}
                              onClick={() => onRestoreVersion(v.id)}
                            >
                              Restaurar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Sin versiones guardadas aún (aparecen al editar).</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">Elige un checklist / formato.</p>
      )}
    </div>
  );
}
