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
  cacheKey?: string | null;
  fieldMap: PdfFieldMap;
  sections: Section[];
  canEdit: boolean;
  onUpdateItem: (sectionId: string, itemId: string, patch: Partial<Item>) => void;
};

const MIN_RENDER_WIDTH = 560;
const MAX_RENDER_WIDTH = 1700;
const PDF_FONT_SIZE = 10;

/**
 * PDF editable encima del documento.
 *
 * Se escribe directo en cada caja (Tab al siguiente). Al enfocar, la caja
 * crece en su sitio —sin modal ni clic extra— para poder teclear cómodo.
 * Arranca a pantalla completa: llenar el formato en una columna estrecha
 * no sirve.
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
  const [pages, setPages] = useState<Array<{ index: number; width: number; height: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
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

  function findItem(sectionId: string, itemId: string): Item | undefined {
    return sections.find((s) => s.id === sectionId)?.items.find((i) => i.id === itemId);
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
    <ExpandBox title="Formato del checklist" defaultExpanded>
      <div className="stack" ref={boxRef}>
        {loading ? <p className="muted kpi-sub">Abriendo el formato…</p> : null}

        {!loading && matchedFields > 0 ? (
          <p className="pdffield-hint">
            Escribe directo en las cajas doradas. Al enfocar se agrandan. Tab pasa al siguiente ·
            Esc sale de pantalla completa.
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
                    const fieldKey = `${f.sectionId}:${f.itemId}`;
                    const isFocused = focusedKey === fieldKey;
                    const baseW = Math.min(
                      Math.max(f.type === 'check' ? 14 * scale : 56 * scale, f.w * scale),
                      Math.max(0, p.width - left),
                    );
                    const baseH = Math.min(
                      Math.max(14 * scale, f.h * scale),
                      Math.max(0, p.height - top),
                    );
                    const isLongText =
                      !item.options?.length &&
                      item.type !== 'number' &&
                      item.type !== 'date' &&
                      item.type !== 'time' &&
                      item.type !== 'yesno';
                    // Al enfocar crece en sitio (sin modal): más ancho y alto para teclear.
                    const style = {
                      left,
                      top,
                      width: isFocused
                        ? Math.min(Math.max(baseW, isLongText ? 320 : 200), Math.max(0, p.width - left))
                        : baseW,
                      height: isFocused
                        ? Math.max(baseH, isLongText ? 96 : 36)
                        : baseH,
                      zIndex: isFocused ? 30 : 3,
                      fontSize: isFocused
                        ? Math.max(PDF_FONT_SIZE * scale, 14)
                        : PDF_FONT_SIZE * scale,
                    };

                    if (f.type === 'check') {
                      return (
                        <label
                          key={fieldKey}
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

                    const options = item.type === 'yesno' ? ['SÍ', 'NO'] : item.options;
                    if (options?.length) {
                      return (
                        <select
                          key={fieldKey}
                          className={`pdffield pdffield__input ${isFocused ? 'is-focused' : ''}`}
                          style={style}
                          value={value}
                          disabled={!canEdit}
                          aria-label={item.label}
                          onFocus={() => setFocusedKey(fieldKey)}
                          onBlur={() => setFocusedKey((k) => (k === fieldKey ? null : k))}
                          onChange={(e) =>
                            onUpdateItem(f.sectionId, f.itemId, { value: e.target.value || null })
                          }
                        >
                          <option value="">—</option>
                          {options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      );
                    }

                    if (item.type === 'number' || item.type === 'date' || item.type === 'time') {
                      return (
                        <input
                          key={fieldKey}
                          className={`pdffield pdffield__input ${isFocused ? 'is-focused' : ''}`}
                          style={style}
                          type={item.type}
                          value={value}
                          readOnly={!canEdit}
                          aria-label={item.label}
                          title={item.label}
                          onFocus={() => setFocusedKey(fieldKey)}
                          onBlur={() => setFocusedKey((k) => (k === fieldKey ? null : k))}
                          onChange={(e) =>
                            onUpdateItem(f.sectionId, f.itemId, {
                              value:
                                item.type === 'number'
                                  ? e.target.value === ''
                                    ? ''
                                    : Number(e.target.value)
                                  : e.target.value,
                            })
                          }
                        />
                      );
                    }

                    return (
                      <textarea
                        key={fieldKey}
                        className={`pdffield pdffield__input pdffield__input--text ${
                          isFocused ? 'is-focused' : ''
                        }`}
                        style={style}
                        value={value}
                        readOnly={!canEdit}
                        rows={isFocused ? 4 : 1}
                        aria-label={item.label}
                        title={item.label}
                        onFocus={() => setFocusedKey(fieldKey)}
                        onBlur={() => setFocusedKey((k) => (k === fieldKey ? null : k))}
                        onChange={(e) =>
                          onUpdateItem(f.sectionId, f.itemId, { value: e.target.value })
                        }
                      />
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <p className="muted kpi-sub">
          Autoguardado mientras escribes. «Guardar y generar PDF» deja la versión firmable en el
          expediente.
        </p>
      </div>
    </ExpandBox>
  );
}
