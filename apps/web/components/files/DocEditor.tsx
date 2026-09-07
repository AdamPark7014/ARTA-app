'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { RevisionHistory } from '@/components/ui/RevisionHistory';
import { useSaveHotkey } from '@/lib/use-save-hotkey';
import { useDirtyGuard } from '@/lib/use-dirty-guard';

export type DocBlockType = 'h1' | 'h2' | 'p' | 'bullet' | 'divider';
export type DocBlock = { type: DocBlockType; text: string };

export type EventDocumentRow = {
  id: string;
  title: string;
  module?: string | null;
  blocksJson: DocBlock[] | unknown;
  version: number;
  pdfUrl?: string | null;
  pdfVersion?: number | null;
  updatedAt: string;
  updatedBy?: { id: string; fullName: string } | null;
};

type Props = {
  doc: EventDocumentRow;
  canEdit: boolean;
  onSaved: (doc: EventDocumentRow) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
};

const TYPE_LABEL: Record<DocBlockType, string> = {
  h1: 'Título',
  h2: 'Subtítulo',
  p: 'Párrafo',
  bullet: 'Viñeta',
  divider: 'Separador',
};

const TYPE_HINT: Record<DocBlockType, string> = {
  h1: 'T',
  h2: 'S',
  p: '¶',
  bullet: '•',
  divider: '—',
};

const ADDABLE: DocBlockType[] = ['h1', 'h2', 'p', 'bullet', 'divider'];

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function normalizeBlocks(raw: unknown): DocBlock[] {
  if (!Array.isArray(raw)) return [{ type: 'p', text: '' }];
  const out = raw
    .map((b) => {
      const block = b as Partial<DocBlock>;
      const type = (ADDABLE as string[]).includes(block?.type as string)
        ? (block!.type as DocBlockType)
        : 'p';
      return { type, text: typeof block?.text === 'string' ? block.text : '' };
    })
    .filter((b): b is DocBlock => !!b);
  return out.length ? out : [{ type: 'p', text: '' }];
}

function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Documento tipo Word.
 *
 * Se escribe por bloques (título, subtítulo, párrafo, viñeta, separador) y al
 * descargar se convierte en PDF con la identidad visual de Arta. Enter abre un
 * bloque nuevo y Retroceso en un bloque vacío lo quita, para que se escriba de
 * corrido sin tocar el ratón.
 */
export function DocEditor({ doc, canEdit, onSaved, onDeleted, onClose }: Props) {
  const [title, setTitle] = useState(doc.title);
  const [blocks, setBlocks] = useState<DocBlock[]>(() => normalizeBlocks(doc.blocksJson));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [pdfUrl, setPdfUrl] = useState(doc.pdfUrl || '');
  const [pdfStale, setPdfStale] = useState(
    !!doc.pdfUrl && doc.pdfVersion !== doc.version,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [revKey, setRevKey] = useState(0);
  const [showCoach, setShowCoach] = useState(false);
  const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('arta-doc-coach') !== '1') setShowCoach(true);
    } catch {
      setShowCoach(true);
    }
  }, []);

  function dismissCoach() {
    try {
      sessionStorage.setItem('arta-doc-coach', '1');
    } catch {
      /* ignore quota / private mode */
    }
    setShowCoach(false);
  }

  useEffect(() => {
    setTitle(doc.title);
    setBlocks(normalizeBlocks(doc.blocksJson));
    setPdfUrl(doc.pdfUrl || '');
    setPdfStale(!!doc.pdfUrl && doc.pdfVersion !== doc.version);
    setDirty(false);
  }, [doc.id, doc.version, doc.blocksJson, doc.title, doc.pdfUrl, doc.pdfVersion]);

  /**
   * El aviso se limpia al cambiar DE documento, y solo entonces.
   *
   * Estaba dentro del efecto de arriba, que depende de `doc.version`: al
   * guardar, `onSaved()` sube la versión en el padre, el efecto se volvía a
   * ejecutar y borraba el «Guardado» un instante después de escribirlo. Así
   * que ni guardar ni salir en PDF confirmaban nada — la persona apretaba el
   * botón y no pasaba nada visible.
   */
  useEffect(() => {
    setMsg('');
    setError('');
  }, [doc.id]);

  useEffect(() => {
    if (focusNext.current === null) return;
    const el = refs.current[focusNext.current];
    el?.focus();
    focusNext.current = null;
  }, [blocks]);

  useEffect(() => {
    refs.current.forEach(fitTextarea);
  }, [blocks, doc.id]);

  function touch() {
    setDirty(true);
    setMsg('');
    setError('');
  }

  function setBlock(i: number, patch: Partial<DocBlock>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    touch();
  }

  function insertAfter(i: number, type: DocBlockType = 'p') {
    setBlocks((prev) => {
      const next = prev.slice();
      next.splice(i + 1, 0, { type, text: '' });
      return next;
    });
    focusNext.current = i + 1;
    touch();
  }

  function removeAt(i: number) {
    setBlocks((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
    focusNext.current = Math.max(0, i - 1);
    touch();
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    setBlocks((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
    touch();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Una viñeta encadena viñetas; lo demás abre párrafo.
      insertAfter(i, blocks[i].type === 'bullet' ? 'bullet' : 'p');
      return;
    }
    if (e.key === 'Backspace' && !blocks[i].text && blocks.length > 1) {
      e.preventDefault();
      removeAt(i);
    }
  }

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api<EventDocumentRow>(`/documents/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, blocks }),
      });
      setDirty(false);
      setPdfStale(!!saved.pdfUrl);
      setMsg('Guardado. La edición quedó registrada.');
      setRevKey((k) => k + 1);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el documento');
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      if (dirty && canEdit) await save();
      const res = await api<{ url: string; version: number }>(`/documents/${doc.id}/pdf`, {
        method: 'POST',
      });
      setPdfUrl(res.url);
      setPdfStale(false);
      setMsg('PDF listo. Para seguir editando, vuelve aquí — no al archivo Word.');
      setRevKey((k) => k + 1);
      const refreshed = await api<EventDocumentRow>(`/documents/${doc.id}`);
      onSaved(refreshed);
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  }

  async function removeDoc() {
    if (!confirm(`¿Eliminar el documento “${doc.title}”?`)) return;
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' });
      onDeleted(doc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  }

  useSaveHotkey(canEdit && dirty && !saving, save);
  useDirtyGuard(canEdit && dirty, 'El documento tiene cambios sin guardar. ¿Salir de todas formas?');

  const editedWhen = formatWhen(doc.updatedAt);
  const editorName = doc.updatedBy?.fullName;

  return (
    <ExpandBox title={title || doc.title || 'Documento'} dirty={dirty}>
      <div className="docedit-app">
        {showCoach ? (
          <div className="editor-coach" role="note">
            <p className="editor-coach__text">
              Escribe → <strong>Guardar</strong> → <strong>Salir en PDF</strong>.
            </p>
            <button
              type="button"
              className="editor-coach__dismiss"
              onClick={dismissCoach}
              aria-label="Cerrar guía"
            >
              Entendido
            </button>
          </div>
        ) : null}

        <div className="docedit-bar">
          <div className="docedit-bar__meta" aria-live="polite">
            <span className="docedit-pill docedit-pill--version">v{doc.version}</span>
            <span className="docedit-bar__who">
              {editorName ? (
                <>
                  Última edición · <strong>{editorName}</strong>
                  {editedWhen ? ` · ${editedWhen}` : ''}
                </>
              ) : (
                <>Sin ediciones registradas{editedWhen ? ` · ${editedWhen}` : ''}</>
              )}
            </span>
            {dirty ? <span className="docedit-pill docedit-pill--dirty">Sin guardar</span> : null}
            {canEdit ? <span className="docedit-bar__hint">Ctrl+S</span> : null}
          </div>

          <div className="docedit-bar__actions row row--tight">
            <button
              className="btn btn-sm"
              type="button"
              disabled={exporting || saving}
              onClick={() => void exportPdf()}
              title="Genera el PDF oficial de salida"
            >
              {exporting ? 'Generando PDF…' : 'Salir en PDF'}
            </button>
            {canEdit ? (
              <button
                className="btn ghost btn-sm"
                type="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
                title="Ctrl+S / ⌘S"
              >
                {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado'}
              </button>
            ) : (
              <span className="muted kpi-sub">Solo lectura</span>
            )}
            {pdfUrl && !pdfStale ? (
              <a className="btn ghost btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">
                Ver PDF
              </a>
            ) : null}
            <button
              className="btn ghost btn-sm"
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              {showHistory ? 'Ocultar historial' : 'Quién editó'}
            </button>
            <button className="btn ghost btn-sm" type="button" onClick={onClose}>
              Cerrar
            </button>
            {canEdit ? (
              <button className="btn ghost btn-sm btn-danger" type="button" onClick={() => void removeDoc()}>
                Eliminar
              </button>
            ) : null}
          </div>
        </div>

        <p className="docedit-policy" role="note">
          Entra Word → se edita aquí → <strong>sale en PDF</strong>. Cada cambio queda con nombre y fecha.
        </p>

        {msg ? (
          <div className="docedit-status docedit-status--ok" role="status">
            {msg}
          </div>
        ) : null}
        {error ? (
          <div className="docedit-status docedit-status--error" role="alert">
            {error}
          </div>
        ) : null}
        {pdfStale ? (
          <div className="docedit-status docedit-status--warn" role="status">
            El documento cambió después del último PDF. Vuelve a salir en PDF para actualizarlo.
          </div>
        ) : null}

        <div className="docedit-canvas">
          <div className="docedit" data-readonly={!canEdit || undefined}>
            <input
              className="docedit__title"
              value={title}
              readOnly={!canEdit}
              placeholder="Título del documento"
              aria-label="Título del documento"
              onChange={(e) => {
                setTitle(e.target.value);
                touch();
              }}
            />

            <div className="docedit__body">
              {blocks.map((block, i) => (
                <div key={i} className={`docedit__block docedit__block--${block.type}`}>
                  {canEdit ? (
                    <div className="docedit__gutter" role="toolbar" aria-label={`Bloque ${i + 1}`}>
                      <div className="docedit__chips" role="group" aria-label="Tipo de bloque">
                        {ADDABLE.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`docedit__chip ${block.type === t ? 'is-active' : ''}`}
                            title={TYPE_LABEL[t]}
                            aria-pressed={block.type === t}
                            onClick={() => setBlock(i, { type: t })}
                          >
                            <span className="docedit__chip-mark" aria-hidden>
                              {TYPE_HINT[t]}
                            </span>
                            <span className="docedit__chip-label">{TYPE_LABEL[t]}</span>
                          </button>
                        ))}
                      </div>
                      <div className="docedit__moves">
                        <button type="button" title="Subir" aria-label="Subir bloque" onClick={() => move(i, -1)}>
                          ↑
                        </button>
                        <button type="button" title="Bajar" aria-label="Bajar bloque" onClick={() => move(i, 1)}>
                          ↓
                        </button>
                        <button
                          type="button"
                          title="Quitar bloque"
                          aria-label="Quitar bloque"
                          onClick={() => removeAt(i)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {block.type === 'divider' ? (
                    <hr className="docedit__divider" />
                  ) : (
                    <textarea
                      ref={(el) => {
                        refs.current[i] = el;
                      }}
                      className="docedit__text"
                      rows={1}
                      value={block.text}
                      readOnly={!canEdit}
                      placeholder={
                        block.type === 'h1'
                          ? 'Título de sección'
                          : block.type === 'h2'
                            ? 'Subtítulo'
                            : block.type === 'bullet'
                              ? 'Punto de la lista'
                              : 'Escribe aquí…'
                      }
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onChange={(e) => {
                        setBlock(i, { text: e.target.value });
                        fitTextarea(e.currentTarget);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {canEdit ? (
              <div className="docedit__add">
                <span className="docedit__add-label">Agregar bloque</span>
                <div className="docedit__add-chips">
                  {ADDABLE.map((t) => (
                    <button
                      key={t}
                      className="docedit__add-chip"
                      type="button"
                      onClick={() => insertAfter(blocks.length - 1, t)}
                    >
                      <span aria-hidden>{TYPE_HINT[t]}</span>
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
                <p className="docedit__add-hint">
                  Enter = nuevo bloque · Retroceso en vacío = quitar · Shift+Enter = salto de línea
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {showHistory ? (
          <div className="docedit-history">
            <div className="docedit-history__head">
              <h3>Quién editó</h3>
              <p className="muted kpi-sub">Cada guardado y cada PDF queda con nombre y fecha.</p>
            </div>
            <RevisionHistory
              path={`/documents/${doc.id}/revisions`}
              reloadKey={revKey}
              emptyHint="Todavía no hay ediciones. Se registran al guardar o al salir en PDF."
            />
          </div>
        ) : null}
      </div>
    </ExpandBox>
  );
}
