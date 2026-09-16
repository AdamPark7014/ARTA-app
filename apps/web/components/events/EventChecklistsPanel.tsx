'use client';

import { ChecklistPdfEditor, FileViewer, PdfEditor } from '@/components/files/lazy';
import { useEffect, useMemo, useState } from 'react';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { createEventFile } from '@/lib/file-save';
import { EmptyLite, FileRow, SectionHead, Seg } from '@/components/ui/Lite';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { RevisionHistory } from '@/components/ui/RevisionHistory';
import { ChecklistPicker, checklistBucket, type ChecklistBucket } from '@/components/events/ChecklistPicker';
import { CHECKLIST_FILE_MODULE } from '@/lib/file-modules';
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

/** Cajón abierto bajo el formato: firmas, PDF, adjuntos o historial. */
type Drawer = 'firmas' | 'pdf' | 'archivos' | 'historial' | null;

function isCheckItem(it: Item) {
  return it.type === 'check' || !it.type;
}

function isItemDone(it: Item) {
  if (isCheckItem(it)) return !!it.done;
  return it.value !== null && it.value !== undefined && String(it.value).trim() !== '';
}

/**
 * Formatos del evento.
 *
 * Dos pantallas y nada más: la lista de formatos con su avance, y el formato
 * abierto con sus secciones. Lo demás —firmas, PDF, adjuntos e historial—
 * vive en «Más» y se abre como un cajón bajo el formato, para que capturar no
 * compita con cuatro bloques siempre desplegados.
 */
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
  const [bucket, setBucket] = useState<ChecklistBucket | 'all'>('all');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [annotating, setAnnotating] = useState(false);
  /** Captura sobre el PDF (si el generador ya dejó el mapa de campos). */
  const [mode, setMode] = useState<'pdf' | 'form'>('form');
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [previewAttach, setPreviewAttach] = useState<EventFile | null>(null);

  const checklistFiles = useMemo(() => {
    if (!activeChecklist) return [] as EventFile[];
    return (event.files || []).filter((f) => f.checklistId === activeChecklist.id);
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

  // Al cambiar de formato se vuelve al principio.
  useEffect(() => {
    setAnnotating(false);
    setQ('');
    setOnlyPending(false);
    setCollapsed(new Set());
    setDrawer(null);
    setPreviewAttach(null);
    setMode('form');
    // Solo al cambiar de formato: el detalle llega en una segunda petición y
    // `canWriteOnPdf` sacaría a la persona del modo que acaba de elegir.
  }, [activeChecklist?.id]);

  const sections = useMemo(
    () => (activeChecklist?.dataJson?.sections || []).filter((s: Section) => s.id !== 'firmas'),
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
            (!needle || it.label.toLowerCase().includes(needle) || s.title.toLowerCase().includes(needle)),
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

  function toggleSection(sectionId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function jumpTo(sectionId: string) {
    if (!sectionId) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`chk-sec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function openDrawer(next: Drawer) {
    setDrawer((cur) => (cur === next ? null : next));
  }

  /* ── Lista de formatos ──────────────────────────────────────────────── */

  if (!activeChecklist) {
    const all = event.checklists || [];
    const counts = {
      all: all.length,
      todo: all.filter((c) => checklistBucket(c) === 'todo').length,
      review: all.filter((c) => checklistBucket(c) === 'review').length,
      ready: all.filter((c) => checklistBucket(c) === 'ready').length,
    };
    const list = bucket === 'all' ? all : all.filter((c) => checklistBucket(c) === bucket);

    return (
      <div className="sx-stack">
        <SectionHead
          title="Formatos"
          sub={
            all.length
              ? `${counts.ready} de ${all.length} listos${counts.review ? ` · ${counts.review} por autorizar` : ''}`
              : undefined
          }
        />
        {all.length ? (
          <Seg
            label="Filtrar formatos"
            value={bucket}
            onChange={setBucket}
            options={[
              { key: 'all', label: 'Todos', count: counts.all },
              { key: 'todo', label: 'Por completar', count: counts.todo },
              { key: 'review', label: 'En revisión', count: counts.review },
              { key: 'ready', label: 'Listos', count: counts.ready },
            ]}
          />
        ) : null}
        <div className="surface surface--pad">
          <ChecklistPicker
            checklists={list}
            onSelect={(c) => {
              onOpenChecklist(c).catch(console.error);
            }}
          />
        </div>
      </div>
    );
  }

  /* ── Formato abierto ────────────────────────────────────────────────── */

  const progressPct = stats.total
    ? Math.round((stats.done / stats.total) * 100)
    : activeChecklist.progressPct || 0;

  return (
    <div className="sx-stack">
      <header className="hub-doc">
        <button
          type="button"
          className="btn-quiet hub-back"
          onClick={() => {
            if (confirmLeave()) onClearChecklist();
          }}
        >
          ← Formatos
        </button>

        <div className="hub-doc__row">
          <div className="hub-doc__title">
            <h2 className="sx-head__title">{activeChecklist.title}</h2>
            <DocStatusBadge status={status} />
          </div>
          <div className="sx-actions">
            {!readOnly ? (
              <SaveStatus status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} />
            ) : null}
            <button
              className="btn btn-sm"
              type="button"
              disabled={saving || readOnly}
              onClick={saveNow}
              title="Ctrl+S · guarda y regenera el PDF"
            >
              {saving ? 'Guardando…' : 'Guardar y generar PDF'}
            </button>
            <details className="ev-more hub-more">
              <summary className="btn ghost btn-sm">Más</summary>
              <div className="ev-more__menu" role="menu">
                <button type="button" onClick={() => openDrawer('firmas')}>
                  Firmas
                </button>
                <button type="button" onClick={() => openDrawer('pdf')}>
                  {activeChecklist.pdfUrl ? 'Ver el PDF' : 'Generar el PDF'}
                </button>
                <button type="button" onClick={() => openDrawer('archivos')}>
                  Adjuntos ({checklistFiles.length})
                </button>
                <button type="button" onClick={() => openDrawer('historial')}>
                  Historial de versiones
                </button>
                {activeChecklist.pdfUrl ? (
                  <a href={activeChecklist.pdfUrl} target="_blank" rel="noreferrer" role="menuitem">
                    <button type="button">Abrir PDF en otra pestaña</button>
                  </a>
                ) : null}
              </div>
            </details>
          </div>
        </div>

        <div className="hub-doc__meta">
          <span className="hub-doc__progress">
            <span className={`hub-bar ${progressPct >= 100 ? 'is-done' : ''}`} aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </span>
            {progressPct}% · {stats.done}/{stats.total} campos
          </span>
          {activeChecklist.lastEditedBy ? <span>Última edición: {activeChecklist.lastEditedBy.fullName}</span> : null}
          {activeChecklist.sealedAt ? (
            <span>
              Sellado el{' '}
              {new Date(activeChecklist.sealedAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
              {activeChecklist.sealedBy ? ` por ${activeChecklist.sealedBy.fullName}` : ''}
            </span>
          ) : null}
          {onChangeStatus && !closed ? (
            <span className="hub-doc__status">
              <DocStatusControl status={status} roleKey={roleKey} busy={saving} onChange={onChangeStatus} />
            </span>
          ) : null}
        </div>
      </header>

      {lockedByStatus ? (
        <p className="inline-note">
          {status === 'SEALED'
            ? 'Sellado: queda como evidencia. Solo dirección lo reabre, con motivo.'
            : 'Aprobado: para editarlo, regrésalo a borrador.'}
        </p>
      ) : null}

      {/* ── Cajones ── */}

      {drawer === 'firmas' ? (
        <section className="surface hub-drawer">
          <div className="surface__head">
            <h3 className="surface__title">Firmas</h3>
            <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setDrawer(null)}>
              ×
            </button>
          </div>
          <div className="surface__body">
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
        </section>
      ) : null}

      {drawer === 'pdf' ? (
        <section className="surface hub-drawer">
          <div className="surface__head">
            <h3 className="surface__title">{annotating ? 'Escribiendo sobre el PDF' : 'PDF del formato'}</h3>
            <div className="sx-actions">
              {activeChecklist.pdfUrl && !closed ? (
                <button
                  className="btn-quiet"
                  type="button"
                  aria-pressed={annotating}
                  onClick={() => setAnnotating((v) => !v)}
                >
                  {annotating ? 'Solo ver' : 'Escribir encima'}
                </button>
              ) : null}
              {!activeChecklist.pdfUrl ? (
                <button className="btn btn-sm" type="button" onClick={onRegeneratePdf}>
                  Generar PDF
                </button>
              ) : null}
              <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setDrawer(null)}>
                ×
              </button>
            </div>
          </div>
          <div className="surface__body">
            {!activeChecklist.pdfUrl ? (
              <EmptyLite icon="▤" title="Aún no hay PDF" text="Se genera al guardar el formato." />
            ) : annotating ? (
              <PdfEditor
                key={activeChecklist.id}
                url={activeChecklist.pdfUrl}
                fileName={`${activeChecklist.title} — anotado.pdf`}
                canEdit={!readOnly}
                saveLabel="Guardar copia anotada"
                note="La copia anotada se guarda como adjunto de este formato; el PDF original se regenera aparte."
                onSave={createEventFile({
                  eventId: event.id,
                  checklistId: activeChecklist.id,
                  module: CHECKLIST_FILE_MODULE,
                })}
                onSaved={async () => {
                  await onFilesChanged();
                  setAnnotating(false);
                }}
              />
            ) : (
              <FileViewer
                url={activeChecklist.pdfUrl}
                fileName={`${activeChecklist.title}.pdf`}
                kind="pdf"
                cacheKey={activeChecklist.pdfGeneratedAt || undefined}
              />
            )}
          </div>
        </section>
      ) : null}

      {drawer === 'archivos' ? (
        <section className="surface hub-drawer">
          <div className="surface__head">
            <h3 className="surface__title">Adjuntos del formato</h3>
            <div className="sx-actions">
              {!closed ? (
                <label className="btn-quiet hub-upload">
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
              ) : null}
              <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setDrawer(null)}>
                ×
              </button>
            </div>
          </div>
          <div className="surface__body">
            {!checklistFiles.length ? (
              <EmptyLite icon="+" title="Sin adjuntos" text={closed ? undefined : 'Sube evidencias o una copia anotada.'} />
            ) : (
              <div className="hub-list">
                {checklistFiles.map((f) => (
                  <div key={f.id} className={`hub-item ${previewAttach?.id === f.id ? 'is-open' : ''}`}>
                    <FileRow
                      kind={/\.pdf$/i.test(f.fileName) ? 'pdf' : /\.xlsx?$/i.test(f.fileName) ? 'xlsx' : 'file'}
                      name={f.fileName}
                      meta={f.createdAt ? new Date(f.createdAt).toLocaleDateString('es-MX') : undefined}
                    >
                      <button
                        className="btn-quiet"
                        type="button"
                        onClick={() => setPreviewAttach(previewAttach?.id === f.id ? null : f)}
                      >
                        {previewAttach?.id === f.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <a className="btn-quiet" href={f.url} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    </FileRow>
                    {previewAttach?.id === f.id ? (
                      <div className="surface hub-pane">
                        <div className="hub-pane__body">
                          <FileViewer
                            url={f.url}
                            fileName={f.fileName}
                            kind={f.kind}
                            cacheKey={f.createdAt}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {drawer === 'historial' ? (
        <section className="surface hub-drawer">
          <div className="surface__head">
            <h3 className="surface__title">Historial de versiones</h3>
            <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setDrawer(null)}>
              ×
            </button>
          </div>
          <div className="surface__body sx-stack">
            <RevisionHistory
              path={`/checklists/${activeChecklist.id}/revisions`}
              reloadKey={revision}
              emptyHint="Las revisiones se crean al guardar, no con el autoguardado."
            />
            {(activeChecklist.versions || []).length && !closed ? (
              <details className="disclose">
                <summary>Restaurar una versión anterior</summary>
                <div className="dtable-wrap">
                  <table className="dtable">
                    <tbody>
                      {(activeChecklist.versions || []).map((v) => (
                        <tr key={v.id}>
                          <td className="is-muted t-small">{new Date(v.createdAt).toLocaleString('es-MX')}</td>
                          <td>{v.editedBy?.fullName || '—'}</td>
                          <td className="is-muted">{v.note || '—'}</td>
                          <td className="col-act">
                            <button
                              className="btn-quiet"
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
        </section>
      ) : null}

      {/* ── Captura ── */}

      <div className="toolbar-row">
        <div className="hub-toolbar__group">
          <input
            className="hub-search"
            type="search"
            placeholder="Buscar campo…"
            aria-label="Buscar campo dentro del formato"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="btn-quiet"
            type="button"
            aria-pressed={onlyPending}
            onClick={() => setOnlyPending((v) => !v)}
          >
            Solo pendientes
          </button>
          {stats.perSection.length > 1 ? (
            <select
              className="hub-jump"
              aria-label="Ir a una sección"
              value=""
              onChange={(e) => jumpTo(e.target.value)}
            >
              <option value="">Ir a sección…</option>
              {stats.perSection.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.done}/{s.total})
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {canWriteOnPdf ? (
          <Seg
            label="Cómo capturar"
            value={mode}
            onChange={setMode}
            options={[
              { key: 'form', label: 'Formulario' },
              { key: 'pdf', label: 'Sobre el PDF' },
            ]}
          />
        ) : null}
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
      ) : (
        <div className="hub-sections">
          {!visibleSections.length ? (
            <div className="surface">
              <EmptyLite
                icon="✓"
                title={onlyPending ? 'No queda nada pendiente' : 'Sin coincidencias'}
                text={onlyPending ? 'Guarda para regenerar el PDF y firmar.' : undefined}
              />
            </div>
          ) : (
            visibleSections.map((section) => {
              const stat = stats.perSection.find((s) => s.id === section.id);
              const isCollapsed = collapsed.has(section.id);
              const checkItems = section.items.filter(isCheckItem);
              const allChecked = checkItems.length > 0 && checkItems.every((it) => it.done);
              const complete = !!stat && stat.total > 0 && stat.done === stat.total;
              return (
                <section className="surface hub-sec" key={section.id} id={`chk-sec-${section.id}`}>
                  <div className="hub-sec__head">
                    <button
                      type="button"
                      className="hub-sec__toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleSection(section.id)}
                    >
                      <span className="hub-sec__chev" aria-hidden>
                        ›
                      </span>
                      <h3 className="hub-sec__title">{section.title}</h3>
                      {stat ? (
                        <span className={`hub-sec__count ${complete ? 'is-complete' : ''}`}>
                          {stat.done}/{stat.total}
                        </span>
                      ) : null}
                    </button>
                    {checkItems.length > 1 && !readOnly && !isCollapsed ? (
                      <button
                        className="btn-quiet"
                        type="button"
                        onClick={() => onUpdateSection(section.id, !allChecked)}
                      >
                        {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
                      </button>
                    ) : null}
                  </div>

                  {!isCollapsed ? (
                    <div className="hub-sec__body">
                      {section.items.map((item) =>
                        isCheckItem(item) ? (
                          <label key={item.id} className={`hub-check ${item.done ? 'is-done' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={readOnly}
                              checked={!!item.done}
                              onChange={(e) => onUpdateItem(section.id, item.id, { done: e.target.checked })}
                            />
                            <span className="hub-check__text">{item.label}</span>
                          </label>
                        ) : (
                          <div key={item.id} className="hub-field">
                            <span className="hub-field__label">{item.label}</span>
                            <div className="hub-field__control">
                              {item.type === 'text' ? (
                                <textarea
                                  rows={2}
                                  disabled={readOnly}
                                  value={item.value ?? ''}
                                  placeholder="Respuesta…"
                                  onChange={(e) => {
                                    onUpdateItem(section.id, item.id, { value: e.target.value });
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
                              ) : null}
                              {item.type === 'number' || item.type === 'date' ? (
                                <input
                                  type={item.type}
                                  disabled={readOnly}
                                  value={item.value ?? ''}
                                  placeholder={item.type === 'date' ? 'Fecha' : 'Respuesta…'}
                                  onChange={(e) =>
                                    onUpdateItem(section.id, item.id, {
                                      value: item.type === 'number' ? Number(e.target.value) : e.target.value,
                                    })
                                  }
                                />
                              ) : null}
                              {item.type === 'select'
                                ? (() => {
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
                                      <>
                                        <select
                                          disabled={readOnly}
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
                                            disabled={readOnly}
                                            placeholder="Especifica…"
                                            value={custom}
                                            onChange={(e) =>
                                              onUpdateItem(section.id, item.id, {
                                                value: e.target.value.trim() || otra,
                                              })
                                            }
                                          />
                                        ) : null}
                                      </>
                                    );
                                  })()
                                : null}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
