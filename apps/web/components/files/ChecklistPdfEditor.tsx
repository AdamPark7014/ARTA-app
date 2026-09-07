'use client';

import { useEffect, useRef, useState } from 'react';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { useElementWidth } from '@/lib/use-element-width';

export type PdfField = {
  sectionId: string;
  itemId: string;
  type: 'check' | 'value';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PdfFieldMap = {
  pageWidth: number;
  pageHeight: number;
  fields: PdfField[];
};

type Item = {
  id: string;
  label: string;
  type?: string;
  done?: boolean;
  value?: string | number | null;
  options?: string[];
};

type Section = { id: string; title: string; items: Item[] };

type Props = {
  url: string;
  /** Cambia cuando el PDF se regenera, para no servir el anterior de caché */
  cacheKey?: string | null;
  fieldMap: PdfFieldMap;
  sections: Section[];
  canEdit: boolean;
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<Item>) => void;
};

/** Límites del ancho de dibujado: legible en columna, grande a pantalla completa */
const MIN_RENDER_WIDTH = 560;
const MAX_RENDER_WIDTH = 1700;
/** Tamaño de la letra con la que el generador escribe los ítems (puntos PDF) */
const PDF_FONT_SIZE = 10;

type ExpandedField = {
  key: string;
  sectionId: string;
  itemId: string;
  label: string;
  value: string;
  isNumber: boolean;
  isDate: boolean;
};

/**
 * El PDF del checklist, editable encima del propio documento.
 *
 * Las cajas sobre la hoja son pequeñas (caben en la línea impresa). Al hacer
 * clic se abren en grande para escribir con comodidad; al cerrar el valor
 * queda en el mapa y al guardar regenera el PDF.
 */
export function ChecklistPdfEditor({
  url,
  cacheKey,
  fieldMap,
  sections,
  canEdit,
  onUpdateItem,
}: Props) {
  const pageHostsRef = useRef(new Map<number, HTMLDivElement>());
  const expandTextRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [pages, setPages] = useState<Array<{ index: number; width: number; height: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<ExpandedField | null>(null);
  const { ref: boxRef, width: boxWidth } = useElementWidth();

  const renderWidth = Math.min(
    MAX_RENDER_WIDTH,
    Math.max(MIN_RENDER_WIDTH, (boxWidth || MIN_RENDER_WIDTH) - 24),
  );

  const src = cacheKey ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}` : url;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPages([]);
    pageHostsRef.current.clear();

    (async () => {
      const res = await fetch(src, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`No se pudo abrir el PDF (${res.status})`);
      const buf = await res.arrayBuffer();
      if (cancelled) return;

      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      if (cancelled) return;

      const info: Array<{ index: number; width: number; height: number }> = [];
      for (let p = 1; p <= doc.numPages; p += 1) {
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: renderWidth / base.width });
        info.push({ index: p - 1, width: Math.floor(vp.width), height: Math.floor(vp.height) });
      }
      if (!cancelled) setPages(info);
    })()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al abrir el PDF');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [src, renderWidth]);

  useEffect(() => {
    if (!pages.length) return;
    let cancelled = false;

    (async () => {
      const res = await fetch(src, { credentials: 'same-origin', cache: 'force-cache' });
      const buf = await res.arrayBuffer();
      const pdfjs = await import('pdfjs-dist');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

      for (const info of pages) {
        if (cancelled) return;
        const host = pageHostsRef.current.get(info.index);
        if (!host) continue;
        const drawn = host.querySelector('canvas');
        if (drawn && host.dataset.width === String(info.width)) continue;
        drawn?.remove();

        const page = await doc.getPage(info.index + 1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: renderWidth / base.width });

        const canvas = document.createElement('canvas');
        canvas.width = info.width;
        canvas.height = info.height;
        canvas.className = 'pdfedit__canvas';
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        host.prepend(canvas);
        host.dataset.width = String(info.width);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      }
    })().catch(() => {
      if (!cancelled) setError('No se pudieron dibujar las páginas del PDF');
    });

    return () => {
      cancelled = true;
    };
  }, [pages, src, renderWidth]);

  useEffect(() => {
    if (!expanded) return;
    const el = expandTextRef.current;
    el?.focus();
    if (el && 'setSelectionRange' in el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpanded(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded?.key]);

  function findItem(sectionId: string, itemId: string): Item | undefined {
    return sections.find((s) => s.id === sectionId)?.items.find((i) => i.id === itemId);
  }

  function openExpand(sectionId: string, itemId: string, item: Item) {
    if (!canEdit) return;
    const value = item.value === null || item.value === undefined ? '' : String(item.value);
    setExpanded({
      key: `${sectionId}:${itemId}`,
      sectionId,
      itemId,
      label: item.label,
      value,
      isNumber: item.type === 'number',
      isDate: item.type === 'date',
    });
  }

  function commitExpand(nextValue: string, field: ExpandedField) {
    onUpdateItem(field.sectionId, field.itemId, {
      value: field.isNumber ? (nextValue === '' ? '' : Number(nextValue)) : nextValue,
    });
  }

  const scale = renderWidth / fieldMap.pageWidth;
  const matchedFields = fieldMap.fields.filter((f) => !!findItem(f.sectionId, f.itemId)).length;

  if (error) {
    return (
      <div className="form-error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <ExpandBox title="Formato del checklist" defaultExpanded={false}>
      <div className="stack" ref={boxRef}>
        {loading ? <p className="muted kpi-sub">Abriendo el formato…</p> : null}

        {!loading && matchedFields > 0 ? (
          <p className="pdffield-hint">
            {matchedFields} campo{matchedFields === 1 ? '' : 's'} editables sobre la hoja. Haz clic
            en una caja para <strong>ampliarla</strong> y escribir cómodo; luego Guardar regenera el
            PDF.
          </p>
        ) : null}

        {!loading && fieldMap.fields.length > 0 && matchedFields === 0 ? (
          <div className="form-error" role="alert">
            El mapa del PDF no coincide con los ítems de este formato. Pulsa «Regenerar» y vuelve a
            intentar.
          </div>
        ) : null}

        <div className="pdfedit pdfedit--fields">
          {pages.map((p) => (
            <div
              key={p.index}
              className="pdfedit__page"
              style={{ width: p.width, height: p.height }}
              ref={(el) => {
                if (el) pageHostsRef.current.set(p.index, el);
                else pageHostsRef.current.delete(p.index);
              }}
            >
              <div className="pdfedit__overlay pdfedit__overlay--fields">
                {fieldMap.fields
                  .filter((f) => f.page === p.index)
                  .map((f) => {
                    const item = findItem(f.sectionId, f.itemId);
                    if (!item) return null;
                    const left = f.x * scale;
                    const top = f.y * scale;
                    const style = {
                      left,
                      top,
                      width: Math.min(
                        Math.max(f.type === 'check' ? 14 * scale : 56 * scale, f.w * scale),
                        Math.max(0, p.width - left),
                      ),
                      height: Math.min(
                        Math.max(14 * scale, f.h * scale),
                        Math.max(0, p.height - top),
                      ),
                    };

                    if (f.type === 'check') {
                      return (
                        <label
                          key={`${f.sectionId}:${f.itemId}`}
                          className="pdffield pdffield--check"
                          style={style}
                          title={item.label}
                        >
                          <input
                            type="checkbox"
                            checked={!!item.done}
                            disabled={!canEdit}
                            aria-label={item.label}
                            onChange={(e) =>
                              onUpdateItem(f.sectionId, f.itemId, { done: e.target.checked })
                            }
                          />
                        </label>
                      );
                    }

                    const value =
                      item.value === null || item.value === undefined ? '' : String(item.value);
                    const fieldKey = `${f.sectionId}:${f.itemId}`;

                    if (item.options?.length) {
                      return (
                        <select
                          key={fieldKey}
                          className="pdffield pdffield__input"
                          style={{ ...style, fontSize: PDF_FONT_SIZE * scale }}
                          value={value}
                          disabled={!canEdit}
                          aria-label={item.label}
                          onChange={(e) =>
                            onUpdateItem(f.sectionId, f.itemId, { value: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {item.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      );
                    }

                    return (
                      <button
                        key={fieldKey}
                        type="button"
                        className={`pdffield pdffield--expandable ${
                          expanded?.key === fieldKey ? 'is-active' : ''
                        }`}
                        style={{ ...style, fontSize: PDF_FONT_SIZE * scale }}
                        disabled={!canEdit}
                        aria-label={`${item.label}${value ? `: ${value}` : ''} — ampliar para editar`}
                        title={`${item.label} — clic para ampliar`}
                        onClick={() => openExpand(f.sectionId, f.itemId, item)}
                      >
                        <span className="pdffield__preview">{value || '…'}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {expanded ? (
          <div
            className="pdffield-expand"
            role="dialog"
            aria-modal="true"
            aria-label={expanded.label}
          >
            <button
              type="button"
              className="pdffield-expand__backdrop"
              aria-label="Cerrar"
              onClick={() => setExpanded(null)}
            />
            <div className="pdffield-expand__card">
              <div className="pdffield-expand__head">
                <strong>{expanded.label}</strong>
                <button
                  className="btn ghost btn-sm"
                  type="button"
                  onClick={() => setExpanded(null)}
                >
                  Listo (Esc)
                </button>
              </div>
              {expanded.isDate ? (
                <input
                  ref={(el) => {
                    expandTextRef.current = el;
                  }}
                  className="field pdffield-expand__input"
                  type="date"
                  value={expanded.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...expanded, value: v };
                    setExpanded(next);
                    commitExpand(v, next);
                  }}
                />
              ) : expanded.isNumber ? (
                <input
                  ref={(el) => {
                    expandTextRef.current = el;
                  }}
                  className="field pdffield-expand__input"
                  type="number"
                  value={expanded.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...expanded, value: v };
                    setExpanded(next);
                    commitExpand(v, next);
                  }}
                />
              ) : (
                <textarea
                  ref={(el) => {
                    expandTextRef.current = el;
                  }}
                  className="field pdffield-expand__input"
                  rows={5}
                  value={expanded.value}
                  placeholder="Escribe aquí con espacio de sobra…"
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...expanded, value: v };
                    setExpanded(next);
                    commitExpand(v, next);
                  }}
                />
              )}
              <p className="muted kpi-sub" style={{ margin: 0 }}>
                Se guarda en el formato al instante. Pulsa Guardar arriba para regenerar el PDF.
              </p>
            </div>
          </div>
        ) : null}

        <p className="muted kpi-sub">
          Escribes directamente sobre el formato. Al guardar, el PDF se vuelve a generar con lo que
          capturaste y queda listo para firmar y descargar.
        </p>
      </div>
    </ExpandBox>
  );
}
