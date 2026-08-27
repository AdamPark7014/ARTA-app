'use client';

import { SignaturePad } from '@/components/ui/SignaturePad';
import { FileViewer } from '@/components/files/FileViewer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChecklistPicker } from '@/components/events/ChecklistPicker';
import type { Checklist, EventDetail } from '@/components/events/event-detail.types';

type EventChecklistsPanelProps = {
  event: EventDetail;
  activeChecklist: Checklist | null;
  closed: boolean;
  saving: boolean;
  userFullName: string;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onClearChecklist: () => void;
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
  onClearChecklist,
  onSaveChecklist,
  onRegeneratePdf,
  onUpload,
  onUpdateItem,
  onSignChecklist,
  onRestoreVersion,
}: EventChecklistsPanelProps) {
  const sections = (activeChecklist?.dataJson?.sections || []).filter((s) => s.id !== 'firmas');
  const doneItems = sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.type === 'check' || !i.type ? i.done : !!i.value).length,
    0,
  );
  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);

  return (
    <div className={`checklist-workspace ${activeChecklist ? 'checklist-workspace--open' : ''}`}>
      <aside className={`checklist-workspace__nav ${activeChecklist ? 'checklist-workspace__nav--collapsed' : ''}`}>
        <div className="panel">
          <div className="panel-head">
            <h2>Formatos · {event.checklists.length}</h2>
          </div>
          <div className="panel-body">
            <ChecklistPicker
              checklists={event.checklists}
              activeId={activeChecklist?.id}
              onSelect={(c) => {
                onOpenChecklist(c).catch(console.error);
              }}
            />
          </div>
        </div>
      </aside>

      <div className="checklist-workspace__main">
        {activeChecklist ? (
          <div className="panel">
            <div className="panel-head checklist-panel-head">
              <div>
                <button
                  type="button"
                  className="checklist-back btn ghost btn-sm"
                  onClick={onClearChecklist}
                >
                  ← Formatos
                </button>
                <h2>{activeChecklist.title}</h2>
                <div className="checklist-summary muted kpi-sub">
                  <span>{activeChecklist.progressPct}% completado</span>
                  {totalItems ? (
                    <span>
                      · {doneItems}/{totalItems} ítems
                    </span>
                  ) : null}
                  {activeChecklist.lastEditedBy ? (
                    <span> · Última edición: {activeChecklist.lastEditedBy.fullName}</span>
                  ) : null}
                </div>
              </div>
              <div className="panel-head-actions">
                {activeChecklist.pdfUrl ? (
                  <a className="btn btn-sm" href={activeChecklist.pdfUrl} target="_blank" rel="noreferrer">
                    Ver PDF
                  </a>
                ) : (
                  <button className="btn btn-sm" type="button" onClick={onRegeneratePdf}>
                    Generar PDF
                  </button>
                )}
                {activeChecklist.pdfUrl ? (
                  <button className="btn ghost btn-sm" type="button" onClick={onRegeneratePdf}>
                    Regenerar
                  </button>
                ) : null}
                {!closed ? (
                  <label className="btn ghost btn-sm checklist-upload">
                    Adjuntar
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
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={saving || closed}
                  onClick={onSaveChecklist}
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>

            {!closed ? (
              <div className="checklist-save-hint muted kpi-sub">
                Guarda después de editar para regenerar el PDF y registrar versión.
              </div>
            ) : null}

            <div className="panel-body">
              {sections.map((section) => (
                <div className="check-section" key={section.id}>
                  <h3>{section.title}</h3>
                  {section.items.map((item) => (
                    <div className="check-item" key={item.id}>
                      {item.type === 'check' || !item.type ? (
                        <input
                          type="checkbox"
                          disabled={closed}
                          checked={!!item.done}
                          aria-label={item.label}
                          onChange={(e) => onUpdateItem(section.id, item.id, { done: e.target.checked })}
                        />
                      ) : (
                        <span className="check-item__bullet" aria-hidden />
                      )}
                      <div className="check-item__body">
                        <div className="check-item__label">{item.label}</div>
                        {item.type === 'text' || item.type === 'number' || item.type === 'date' ? (
                          <input
                            className="field check-item__field"
                            type={item.type === 'text' ? 'text' : item.type}
                            disabled={closed}
                            value={item.value ?? ''}
                            placeholder={item.type === 'date' ? 'Fecha' : 'Respuesta…'}
                            onChange={(e) =>
                              onUpdateItem(section.id, item.id, {
                                value: item.type === 'number' ? Number(e.target.value) : e.target.value,
                              })
                            }
                          />
                        ) : null}
                        {item.type === 'select' ? (
                          (() => {
                            const opts = item.options || [];
                            const otra = opts.find((o) => /^otra$/i.test(o));
                            const raw = String(item.value ?? '');
                            const known = opts.filter((o) => !/^otra$/i.test(o));
                            const choice = known.includes(raw)
                              ? raw
                              : otra && (raw === otra || (raw && !known.includes(raw)))
                                ? otra
                                : raw || '';
                            const custom = otra && choice === otra && raw !== otra ? raw : '';
                            return (
                              <div className="check-item__field-stack">
                                <select
                                  className="field"
                                  disabled={closed}
                                  value={choice}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    if (otra && next === otra) {
                                      onUpdateItem(section.id, item.id, { value: custom || otra });
                                    } else {
                                      onUpdateItem(section.id, item.id, { value: next });
                                    }
                                  }}
                                >
                                  <option value="">Selecciona…</option>
                                  {opts.map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                                {otra && choice === otra ? (
                                  <input
                                    className="field"
                                    disabled={closed}
                                    placeholder="Especifica (ej. Ticketmaster)"
                                    value={custom}
                                    onChange={(e) =>
                                      onUpdateItem(section.id, item.id, {
                                        value: e.target.value.trim() || otra,
                                      })
                                    }
                                  />
                                ) : null}
                              </div>
                            );
                          })()
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="check-section check-section--highlight">
                <h3>Firmas digitales</h3>
                <p className="check-section__intro muted kpi-sub">
                  Primero firma quien entrega; después quien autoriza. Quedan en el PDF del formato.
                </p>
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
                <h3>Vista previa PDF</h3>
                {activeChecklist.pdfUrl ? (
                  <FileViewer
                    url={activeChecklist.pdfUrl}
                    fileName={`${activeChecklist.title}.pdf`}
                    kind="pdf"
                    cacheKey={activeChecklist.pdfGeneratedAt || undefined}
                  />
                ) : (
                  <EmptyState
                    title="Aún no hay PDF"
                    description="Completa el formato y pulsa Guardar o Generar PDF — aparecerá aquí automáticamente."
                  />
                )}
              </div>

              <div className="check-section">
                <h3>Historial de versiones</h3>
                {(activeChecklist.versions || []).length ? (
                  <div className="table-wrap">
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
                            <td className="muted kpi-sub">
                              {new Date(v.createdAt).toLocaleString('es-MX')}
                            </td>
                            <td>{v.editedBy?.fullName || '—'}</td>
                            <td className="muted">{v.note || '—'}</td>
                            <td>
                              {!closed ? (
                                <button
                                  className="btn ghost btn-sm"
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
                  </div>
                ) : (
                  <p className="muted kpi-sub">
                    Las versiones aparecen cada vez que guardas cambios en el formato.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel checklist-workspace__empty">
            <div className="panel-body">
              <EmptyState
                title="Selecciona un formato"
                description="A la izquierda están todos los checklists del evento. Empieza por los que tienen menor avance."
                steps={[
                  'Abre un formato de la lista',
                  'Marca ítems y completa campos',
                  'Guarda y firma entregado / autorizado',
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
