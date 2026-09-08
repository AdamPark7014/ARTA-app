'use client';

import { ChecklistPdfEditor, FileViewer, PdfEditor } from '@/components/files/lazy';
import { useEffect, useMemo, useState } from 'react';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { createEventFile } from '@/lib/file-save';
import { EmptyState } from '@/components/ui/EmptyState';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { RevisionHistory } from '@/components/ui/RevisionHistory';
import { ChecklistPicker } from '@/components/events/ChecklistPicker';
import { SectionFileCreate } from '@/components/files/SectionFileCreate';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fileKindLabel, CHECKLIST_FILE_MODULE } from '@/lib/file-modules';
import { useAutosave } from '@/lib/use-autosave';
import { useDirtyGuard } from '@/lib/use-dirty-guard';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import { DocStatusBadge, DocStatusControl } from '@/components/ui/DocStatusControl';
import type {
  Checklist,
  ChecklistItem,
  ChecklistSection,
  DocStatus,
  EventDetail,
  EventFile,
} from '@/components/events/event-detail.types';

type Section = ChecklistSection;
type Item = ChecklistItem;

type EventChecklistsPanelProps = {
  event: EventDetail;
  activeChecklist: Checklist | null;
  closed: boolean;
  saving: boolean;
  userFullName: string;
  /** Sube cuando el checklist llega del servidor: re-sincroniza el autoguardado. */
  revision: number;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onClearChecklist: () => void;
  onSaveChecklist: () => Promise<void>;
  /** Cambiar el estado del formato (Borrador → Revisión → Aprobado → Sellado). */
  onChangeStatus?: (next: DocStatus, reason?: string) => Promise<void> | void;
  /** Rol de quien mira: decide qué botones de estado tienen sentido enseñar. */
  roleKey?: string;
  /** Guardado silencioso: sin regenerar PDF ni crear versión. */
  onAutosaveChecklist: (dataJson: Checklist['dataJson']) => Promise<void>;
  onRegeneratePdf: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<Item>) => void;
  /** Marcar o desmarcar todas las casillas de una sección. */
  onUpdateSection: (sectionId: string, done: boolean) => void;
  onSignChecklist: (
    kind: 'ENTREGADO' | 'AUTORIZADO',
    payload: { imageDataUrl: string; signerName: string },
  ) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  /** Recarga el evento cuando se guarda una copia anotada del PDF */
  onFilesChanged: () => void | Promise<void>;
};

function isCheckItem(it: Item) {
  return it.type === 'check' || !it.type;
}

function isItemDone(it: Item) {
  if (isCheckItem(it)) return !!it.done;
  return it.value !== null && it.value !== undefined && String(it.value).trim() !== '';
}

export function EventChecklistsPanel({
  event,
  activeChecklist,
  closed,
  saving,
  userFullName,
  revision,
  onOpenChecklist,
  onClearChecklist,
  onSaveChecklist,
  onChangeStatus,
  roleKey = '',
  onAutosaveChecklist,
  onRegeneratePdf,
  onUpload,
  onUpdateItem,
  onUpdateSection,
  onSignChecklist,
  onRestoreVersion,
  onFilesChanged,
}: EventChecklistsPanelProps) {
  const [annotating, setAnnotating] = useState(false);
  /** Vista previa PDF solo a demanda — evita capas blancas encima del formulario. */
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  /**
   * Cómo se captura el formato: escribiendo sobre el PDF (por defecto, si el
   * generador ya dejó el mapa de campos) o en el formulario clásico.
   */
  const [mode, setMode] = useState<'pdf' | 'form'>('form');
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [previewAttach, setPreviewAttach] = useState<EventFile | null>(null);

  const checklistFiles = useMemo(() => {
    if (!activeChecklist) return [] as EventFile[];
    return (event.files || []).filter(
      (f) =>
        f.checklistId === activeChecklist.id ||
        (f.module === CHECKLIST_FILE_MODULE && f.checklistId === activeChecklist.id),
    );
  }, [event.files, activeChecklist]);

  const fieldMap = activeChecklist?.pdfFieldsJson;
  const canWriteOnPdf = !!activeChecklist?.pdfUrl && !!fieldMap?.fields?.length;
  /*
   * Un formato aprobado o sellado no se edita. `REVIEW` sí: es una bandera
   * para pedir revisión, no un candado — si bloqueara, nadie cerraría su
   * formato de noche porque quien aprueba está dormido.
   */
  const status = (activeChecklist?.status || 'DRAFT') as DocStatus;
  const lockedByStatus = status === 'APPROVED' || status === 'SEALED';
  const readOnly = closed || lockedByStatus;

  // Al cambiar de formato se vuelve al modo que corresponda.
  useEffect(() => {
    setAnnotating(false);
    setShowPdfPreview(false);
    setQ('');
    setOnlyPending(false);
    setCollapsed(new Set());
    setShowHistory(false);
    // Formulario primero: más claro y profesional. PDF overlay es opcional.
    setMode('form');
    // Solo al cambiar de formato: el detalle completo llega en una segunda
    // petición y, si `canWriteOnPdf` disparara este efecto, sacaría al usuario
    // del modo «Sobre el PDF» que acaba de elegir.
  }, [activeChecklist?.id]);

  const sections = useMemo(
    () => (activeChecklist?.dataJson?.sections || []).filter((s) => s.id !== 'firmas'),
    [activeChecklist],
  );

  const stats = useMemo(() => {
    const perSection = sections.map((s) => {
      const total = s.items.length;
      const done = s.items.filter(isItemDone).length;
      return { id: s.id, title: s.title, total, done };
    });
    return {
      perSection,
      done: perSection.reduce((n, s) => n + s.done, 0),
      total: perSection.reduce((n, s) => n + s.total, 0),
    };
  }, [sections]);

  /** Solo lo que falta / lo que coincide con la búsqueda. */
  const visibleSections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle && !onlyPending) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (it) =>
            (!onlyPending || !isItemDone(it)) &&
            (!needle ||
              it.label.toLowerCase().includes(needle) ||
              s.title.toLowerCase().includes(needle)),
        ),
      }))
      .filter((s) => s.items.length);
  }, [sections, q, onlyPending]);

  const autosave = useAutosave<Checklist['dataJson'] | null>({
    value: activeChecklist?.dataJson ?? null,
    enabled: !!activeChecklist && !readOnly,
    save: async (data) => {
      if (data) await onAutosaveChecklist(data);
    },
  });

  // Cada vez que el servidor manda el checklist, esa pasa a ser la línea base.
  useEffect(() => {
    autosave.reset(activeChecklist?.dataJson ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const confirmLeave = useDirtyGuard(
    autosave.dirty,
    'El formato tiene cambios sin guardar. ¿Salir de todas formas?',
  );

  useSaveHotkey(!!activeChecklist && !readOnly && !saving, async () => {
    await onSaveChecklist();
    autosave.reset(activeChecklist?.dataJson ?? null);
  });

  async function saveNow() {
    await onSaveChecklist();
    autosave.reset(activeChecklist?.dataJson ?? null);
  }

  function jumpTo(sectionId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`chk-sec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function toggleSection(sectionId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function collapseCompleted() {
    setCollapsed(new Set(stats.perSection.filter((s) => s.total && s.done === s.total).map((s) => s.id)));
  }

  const progressPct = stats.total ? Math.round((stats.done / stats.total) * 100) : activeChecklist?.progressPct || 0;

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
                if (c.id !== activeChecklist?.id && !confirmLeave()) return;
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
                  onClick={() => {
                    if (confirmLeave()) onClearChecklist();
                  }}
                >
                  ← Formatos
                </button>
                <h2>
                  {activeChecklist.title} <DocStatusBadge status={status} />
                </h2>
                {onChangeStatus && !closed ? (
                  <div className="checklist-status-row">
                    <DocStatusControl
                      status={status}
                      roleKey={roleKey}
                      busy={saving}
                      onChange={onChangeStatus}
                    />
                    {activeChecklist.sealedAt ? (
                      <span className="muted kpi-sub">
                        Sellado el{' '}
                        {new Date(activeChecklist.sealedAt).toLocaleDateString('es-MX', {
                          dateStyle: 'medium',
                        })}
                        {activeChecklist.sealedBy ? ` por ${activeChecklist.sealedBy.fullName}` : ''}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="checklist-progress">
                  <div className="progress">
                    <span style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="muted kpi-sub">
                    {progressPct}% · {stats.done}/{stats.total} campos
                    {activeChecklist.lastEditedBy ? ` · última edición ${activeChecklist.lastEditedBy.fullName}` : ''}
                  </span>
                </div>
              </div>
              <div className="panel-head-actions">
                {!readOnly ? (
                  <SaveStatus status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} />
                ) : null}
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={saving || readOnly}
                  onClick={saveNow}
                  title="Ctrl+S / ⌘S — guarda y regenera el PDF"
                >
                  {saving ? 'Guardando…' : 'Guardar y generar PDF'}
                </button>
                {activeChecklist.pdfUrl ? (
                  <a className="btn ghost btn-sm" href={activeChecklist.pdfUrl} target="_blank" rel="noreferrer">
                    Ver PDF
                  </a>
                ) : (
                  <button className="btn ghost btn-sm" type="button" onClick={onRegeneratePdf}>
                    Generar PDF
                  </button>
                )}
              </div>
            </div>

            {lockedByStatus ? (
              <div className="module-banner module-banner--warn" role="status">
                {status === 'SEALED'
                  ? 'Formato sellado: queda como evidencia y no se edita. Solo dirección puede reabrirlo, dejando el motivo.'
                  : 'Formato aprobado: para editarlo hay que devolverlo a borrador.'}
              </div>
            ) : null}

            {!readOnly ? (
              <div className="checklist-save-hint muted kpi-sub">
                Se guarda solo mientras escribes. «Guardar y generar PDF» deja el formato firmado en
                el expediente y crea una versión en el historial.
              </div>
            ) : null}

            <div className="panel-body">
              <div className="checklist-toolbar">
                <input
                  className="field field--search"
                  placeholder="Buscar campo dentro del formato…"
                  aria-label="Buscar campo"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  className={`chip ${onlyPending ? 'is-on' : ''}`}
                  type="button"
                  aria-pressed={onlyPending}
                  onClick={() => setOnlyPending((v) => !v)}
                >
                  Solo pendientes
                </button>
                <button className="chip" type="button" onClick={collapseCompleted}>
                  Contraer completadas
                </button>
                <button className="chip" type="button" onClick={() => setCollapsed(new Set())}>
                  Abrir todas
                </button>
                <div className="checklist-toolbar__spacer" />
                <div className="checklist-mode">
                  <button
                    className={mode === 'form' ? 'btn btn-sm' : 'btn ghost btn-sm'}
                    type="button"
                    onClick={() => setMode('form')}
                  >
                    Formulario rápido
                  </button>
                  <button
                    className={mode === 'pdf' ? 'btn btn-sm' : 'btn ghost btn-sm'}
                    type="button"
                    disabled={!canWriteOnPdf}
                    title={
                      canWriteOnPdf
                        ? 'Escribe sobre la hoja (pantalla completa, Tab al siguiente)'
                        : 'Pulsa «Generar PDF» para habilitar esta vista'
                    }
                    onClick={() => setMode('pdf')}
                  >
                    Sobre el PDF
                  </button>
                </div>
              </div>

              {mode === 'pdf' && canWriteOnPdf ? (
                <ChecklistPdfEditor
                  key={activeChecklist.id}
                  url={activeChecklist.pdfUrl!}
                  cacheKey={activeChecklist.pdfGeneratedAt || undefined}
                  fieldMap={fieldMap!}
                  sections={sections}
                  canEdit={!readOnly}
                  onUpdateItem={onUpdateItem}
                />
              ) : null}

              {mode === 'form' ? (
                <div className="checklist-form-layout">
                  {stats.perSection.length > 1 ? (
                    <nav className="checklist-index" aria-label="Secciones del formato">
                      <span className="checklist-index__title muted kpi-sub">Secciones</span>
                      {stats.perSection.map((s) => {
                        const complete = s.total > 0 && s.done === s.total;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`checklist-index__item ${complete ? 'is-complete' : ''}`}
                            onClick={() => jumpTo(s.id)}
                          >
                            <span className="checklist-index__label">{s.title}</span>
                            <span className={`checklist-index__count ${complete ? 'ok' : ''}`}>
                              {s.done}/{s.total}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  ) : null}

                  <div className="checklist-sections">
                    {!visibleSections.length ? (
                      <EmptyState
                        title={onlyPending ? 'No queda nada pendiente' : 'Sin coincidencias'}
                        description={
                          onlyPending
                            ? 'Todos los campos de este formato están completos. Guarda para regenerar el PDF y firmar.'
                            : 'Prueba otro término de búsqueda o quita el filtro de pendientes.'
                        }
                      />
                    ) : (
                      visibleSections.map((section) => {
                        const stat = stats.perSection.find((s) => s.id === section.id);
                        const isCollapsed = collapsed.has(section.id);
                        const checkItems = section.items.filter(isCheckItem);
                        const allChecked = checkItems.length > 0 && checkItems.every((it) => it.done);
                        return (
                          <div className="check-section" key={section.id} id={`chk-sec-${section.id}`}>
                            <div className="check-section__head">
                              <button
                                type="button"
                                className="check-section__toggle"
                                aria-expanded={!isCollapsed}
                                onClick={() => toggleSection(section.id)}
                              >
                                <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span>
                                <h3>{section.title}</h3>
                                {stat ? (
                                  <span
                                    className={`badge ${stat.total && stat.done === stat.total ? 'ok' : 'muted-tone'}`}
                                  >
                                    {stat.done}/{stat.total}
                                  </span>
                                ) : null}
                              </button>
                              {checkItems.length > 1 && !closed ? (
                                <button
                                  className="btn ghost btn-sm"
                                  type="button"
                                  onClick={() => onUpdateSection(section.id, !allChecked)}
                                >
                                  {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
                                </button>
                              ) : null}
                            </div>

                            {!isCollapsed
                              ? section.items.map((item) => (
                                  <div className="check-item" key={item.id}>
                                    {isCheckItem(item) ? (
                                      <input
                                        type="checkbox"
                                        disabled={readOnly}
                                        checked={!!item.done}
                                        aria-label={item.label}
                                        onChange={(e) =>
                                          onUpdateItem(section.id, item.id, { done: e.target.checked })
                                        }
                                      />
                                    ) : (
                                      <span className="check-item__bullet" aria-hidden />
                                    )}
                                    <div className="check-item__body">
                                      <div className="check-item__label">{item.label}</div>
                                      {item.type === 'text' || item.type === 'number' || item.type === 'date' ? (
                                        item.type === 'text' ? (
                                          <textarea
                                            className="field check-item__field check-item__field--grow"
                                            disabled={readOnly}
                                            rows={2}
                                            value={item.value ?? ''}
                                            placeholder="Respuesta… (el campo crece al escribir)"
                                            onChange={(e) => {
                                              onUpdateItem(section.id, item.id, {
                                                value: e.target.value,
                                              });
                                              const el = e.target;
                                              el.style.height = 'auto';
                                              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                                            }}
                                            onFocus={(e) => {
                                              const el = e.target;
                                              el.style.height = 'auto';
                                              el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                                            }}
                                          />
                                        ) : (
                                          <input
                                            className="field check-item__field"
                                            type={item.type}
                                            disabled={readOnly}
                                            value={item.value ?? ''}
                                            placeholder={item.type === 'date' ? 'Fecha' : 'Respuesta…'}
                                            onChange={(e) =>
                                              onUpdateItem(section.id, item.id, {
                                                value:
                                                  item.type === 'number'
                                                    ? Number(e.target.value)
                                                    : e.target.value,
                                              })
                                            }
                                          />
                                        )
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
                                                disabled={readOnly}
                                                value={choice}
                                                onChange={(e) => {
                                                  const next = e.target.value;
                                                  if (otra && next === otra) {
                                                    onUpdateItem(section.id, item.id, {
                                                      value: custom || otra,
                                                    });
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
                                                  disabled={readOnly}
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
                                ))
                              : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

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

              <div className={`check-section ${mode === 'pdf' ? 'is-hidden' : ''}`}>
                <div className="check-section__head">
                  <h3>{annotating ? 'Escribiendo sobre el PDF' : 'Vista previa PDF'}</h3>
                  {activeChecklist.pdfUrl && !closed ? (
                    <div className="row row--tight">
                      {!annotating ? (
                        <button
                          className={showPdfPreview ? 'btn btn-sm' : 'btn ghost btn-sm'}
                          type="button"
                          onClick={() => setShowPdfPreview((v) => !v)}
                        >
                          {showPdfPreview ? 'Ocultar PDF' : 'Ver PDF'}
                        </button>
                      ) : null}
                      <button
                        className={annotating ? 'btn btn-sm' : 'btn ghost btn-sm'}
                        type="button"
                        onClick={() => {
                          setAnnotating((v) => !v);
                          if (!annotating) setShowPdfPreview(false);
                        }}
                      >
                        {annotating ? 'Volver a la vista' : 'Escribir encima'}
                      </button>
                    </div>
                  ) : null}
                </div>

                {!activeChecklist.pdfUrl ? (
                  <EmptyState
                    title="Aún no hay PDF"
                    description="Completa el formato y pulsa «Guardar y generar PDF» — aparecerá aquí automáticamente."
                  />
                ) : annotating ? (
                  <PdfEditor
                    key={activeChecklist.id}
                    url={activeChecklist.pdfUrl}
                    fileName={`${activeChecklist.title} — anotado.pdf`}
                    canEdit={!readOnly}
                    saveLabel="Guardar copia anotada"
                    note={
                      'La copia anotada se guarda en este checklist (y también aparece en Documentos ' +
                      'bajo «Checklists»). Así no se borra cuando regeneras el PDF del formato.'
                    }
                    onSave={createEventFile({
                      eventId: event.id,
                      checklistId: activeChecklist.id,
                      module: 'checklist',
                    })}
                    onSaved={async () => {
                      await onFilesChanged();
                      setAnnotating(false);
                    }}
                  />
                ) : showPdfPreview ? (
                  <FileViewer
                    url={activeChecklist.pdfUrl}
                    fileName={`${activeChecklist.title}.pdf`}
                    kind="pdf"
                    cacheKey={activeChecklist.pdfGeneratedAt || undefined}
                  />
                ) : (
                  <p className="muted kpi-sub">
                    Pulsa «Ver PDF» si quieres la vista previa. El formato se edita arriba sin tapar
                    las opciones.
                  </p>
                )}
              </div>

              <div className="check-section">
                <div className="check-section__head">
                  <h3>Archivos de este checklist · {checklistFiles.length}</h3>
                </div>
                <p className="muted kpi-sub" style={{ margin: '0 0 0.75rem' }}>
                  Adjuntos ligados a este formato: evidencias, Excel de apoyo o una copia anotada
                  del PDF. También aparecen en Documentos bajo Checklists.
                </p>
                {!closed ? (
                  <SectionFileCreate
                    staysIn={`el checklist «${activeChecklist.title}»`}
                    compact={checklistFiles.length > 0}
                    hideHint
                    actions={[
                      {
                        id: 'upload',
                        title: 'Subir archivo',
                        description: 'PDF, Excel o imagen de apoyo para este formato.',
                        after: 'Queda ligado a este checklist y listado abajo.',
                        tone: 'upload',
                        emphasis: 'primary',
                        accept: '.pdf,.xlsx,.xls,.csv,image/*',
                        onFile: (f) => void onUpload(f),
                      },
                      {
                        id: 'annotate',
                        title: 'Copia anotada del PDF',
                        description: 'Escribe encima del PDF del formato y guárdala aquí.',
                        after: activeChecklist.pdfUrl
                          ? 'Abre el editor de anotaciones sobre el PDF.'
                          : 'Primero genera el PDF del formato.',
                        tone: 'pdf',
                        emphasis: 'secondary',
                        disabled: !activeChecklist.pdfUrl,
                        onClick: () => {
                          setAnnotating(true);
                          setShowPdfPreview(false);
                        },
                      },
                    ]}
                  />
                ) : null}
                {!checklistFiles.length ? (
                  <EmptyState
                    title="Todavía sin adjuntos"
                    description={
                      closed
                        ? 'Este formato no tiene archivos ligados.'
                        : 'Sube una evidencia o anota el PDF del formato. Queda aquí — no se pierde en Documentos.'
                    }
                  />
                ) : (
                  <div className="file-card-list file-card-list--always" style={{ marginTop: '0.75rem' }}>
                    {checklistFiles.map((f) => {
                      const pdf = f.kind === 'pdf' || /\.pdf$/i.test(f.fileName);
                      return (
                        <div
                          key={f.id}
                          className={`file-card ${previewAttach?.id === f.id ? 'file-card--active' : ''}`}
                        >
                          <div className="file-card__meta">
                            <strong>{f.fileName}</strong>
                            <StatusBadge value={fileKindLabel(f.kind, f.fileName)} kind="raw" />
                          </div>
                          <div className="panel-head-actions">
                            <button
                              className={previewAttach?.id === f.id ? 'btn btn-sm' : 'btn ghost btn-sm'}
                              type="button"
                              onClick={() =>
                                setPreviewAttach(previewAttach?.id === f.id ? null : f)
                              }
                            >
                              {previewAttach?.id === f.id
                                ? 'Ocultar'
                                : pdf
                                  ? 'Ver PDF'
                                  : 'Ver aquí'}
                            </button>
                            <a
                              className="btn ghost btn-sm"
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {pdf ? 'Abrir PDF' : 'Abrir'}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {previewAttach ? (
                  <div className="campaign-file__body" style={{ marginTop: '0.75rem' }}>
                    <FileViewer
                      url={previewAttach.url}
                      fileName={previewAttach.fileName}
                      kind={previewAttach.kind}
                      cacheKey={previewAttach.createdAt}
                    />
                  </div>
                ) : null}
              </div>

              <div className="check-section">
                <div className="check-section__head">
                  <h3>Historial de versiones</h3>
                  <button
                    className="btn ghost btn-sm"
                    type="button"
                    aria-expanded={showHistory}
                    onClick={() => setShowHistory((v) => !v)}
                  >
                    {showHistory ? 'Ocultar' : 'Ver quién cambió qué'}
                  </button>
                </div>
                {showHistory ? (
                  <div className="stack">
                    {/* Quién cambió qué campo, no solo quién tocó el formato. */}
                    <RevisionHistory
                      path={`/checklists/${activeChecklist.id}/revisions`}
                      reloadKey={revision}
                      emptyHint="Las revisiones se crean con «Guardar y generar PDF», no con el autoguardado."
                    />
                    {(activeChecklist.versions || []).length && !closed ? (
                      <details className="revision-restore">
                        <summary className="muted kpi-sub">Restaurar una versión anterior</summary>
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
                                    <button
                                      className="btn ghost btn-sm"
                                      type="button"
                                      disabled={saving}
                                      onClick={() => onRestoreVersion(v.id)}
                                    >
                                      Restaurar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
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
                  'Marca ítems y completa campos — se guarda solo',
                  'Guarda y genera el PDF, luego firma entregado / autorizado',
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
