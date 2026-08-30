'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { useSaveHotkey } from '@/lib/use-save-hotkey';

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

const ADDABLE: DocBlockType[] = ['h1', 'h2', 'p', 'bullet', 'divider'];

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
  const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    setTitle(doc.title);
    setBlocks(normalizeBlocks(doc.blocksJson));
    setPdfUrl(doc.pdfUrl || '');
    setPdfStale(!!doc.pdfUrl && doc.pdfVersion !== doc.version);
    setDirty(false);
  }, [doc.id, doc.version, doc.blocksJson, doc.title, doc.pdfUrl, doc.pdfVersion]);

  useEffect(() => {
    if (focusNext.current === null) return;
    const el = refs.current[focusNext.current];
    el?.focus();
    focusNext.current = null;
  }, [blocks]);

  function touch() {
    setDirty(true);
    setMsg('');
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
      setMsg('Documento guardado');
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setError('');
    try {
      if (dirty && canEdit) await save();
      const res = await api<{ url: string }>(`/documents/${doc.id}/pdf`, { method: 'POST' });
      setPdfUrl(res.url);
      setPdfStale(false);
      setMsg('PDF generado y guardado en los archivos del evento');
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

  return (
    <ExpandBox title={title || doc.title || 'Documento'} defaultExpanded dirty={dirty}>
    <div className="stack">
      <div className="sheet-toolbar">
        <span className="muted kpi-sub">
          Versión {doc.version}
          {doc.updatedBy ? ` · ${doc.updatedBy.fullName}` : ''}
          {canEdit ? ' · Ctrl+S guardar' : ''}
        </span>
        <div className="row row--tight">
          {canEdit ? (
            <button
              className="btn btn-sm"
              type="button"
              disabled={!dirty || saving}
              onClick={save}
              title="Ctrl+S / ⌘S"
            >
              {saving ? 'Guardando…' : dirty ? 'Guardar' : 'Sin cambios'}
            </button>
          ) : null}
          <button className="btn ghost btn-sm" type="button" disabled={exporting} onClick={exportPdf}>
            {exporting ? 'Generando…' : 'Descargar PDF'}
          </button>
          {pdfUrl && !pdfStale ? (
            <a className="btn ghost btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">
              Ver último PDF
            </a>
          ) : null}
          {canEdit ? (
            <button className="btn ghost btn-sm btn-danger" type="button" onClick={removeDoc}>
              Eliminar
            </button>
          ) : null}
          <button className="btn ghost btn-sm" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {msg ? (
        <div className="module-banner module-banner--ok" role="status">
          {msg}
        </div>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {pdfStale ? (
        <div className="module-banner module-banner--warn">
          El documento cambió desde el último PDF. Vuelve a descargarlo para tener la versión al día.
        </div>
      ) : null}

      <div className="docedit">
        <input
          className="docedit__title"
          value={title}
          readOnly={!canEdit}
          placeholder="Título del documento"
          onChange={(e) => {
            setTitle(e.target.value);
            touch();
          }}
        />

        {blocks.map((block, i) => (
          <div key={i} className={`docedit__block docedit__block--${block.type}`}>
            {canEdit ? (
              <div className="docedit__gutter">
                <select
                  className="docedit__type"
                  aria-label={`Tipo del bloque ${i + 1}`}
                  value={block.type}
                  onChange={(e) => setBlock(i, { type: e.target.value as DocBlockType })}
                >
                  {ADDABLE.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <button type="button" title="Subir" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" title="Bajar" onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" title="Quitar bloque" onClick={() => removeAt(i)}>
                  ×
                </button>
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
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${el.scrollHeight}px`;
                }}
              />
            )}
          </div>
        ))}

        {canEdit ? (
          <div className="docedit__add row row--tight">
            <span className="muted kpi-sub">Agregar:</span>
            {ADDABLE.map((t) => (
              <button
                key={t}
                className="btn ghost btn-sm"
                type="button"
                onClick={() => insertAfter(blocks.length - 1, t)}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
    </ExpandBox>
  );
}
