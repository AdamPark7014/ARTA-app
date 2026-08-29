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

/**
 * El PDF del checklist, editable encima del propio documento.
 *
 * El generador registra en qué página y coordenadas escribió cada ítem
 * (`pdfFieldsJson`); aquí se dibuja el PDF real con pdf.js y se coloca un campo
 * de captura justo encima de cada dato. Se escribe sobre la hoja, no en un
 * formulario aparte que la controle.
 *
 * El PDF de abajo sigue mostrando el valor anterior hasta que se guarda y se
 * regenera, por eso cada campo va con fondo opaco: tapa lo impreso.
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
  const { ref: boxRef, width: boxWidth } = useElementWidth();

  // El formato se dibuja al ancho disponible: al ampliar se lee y se captura
  // como en papel, no en una columna estrecha.
  const renderWidth = Math.min(
    MAX_RENDER_WIDTH,
    Math.max(MIN_RENDER_WIDTH, (boxWidth || MIN_RENDER_WIDTH) - 24),
  );

  const src = cacheKey ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}` : url;

  // 1) Abrir el PDF y medir las páginas.
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

  // 2) Pintar cada página dentro de su contenedor.
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
        // Al cambiar el ancho hay que volver a rasterizar, no reutilizar.
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

  /** Ítem vivo del checklist, que es de donde sale el valor que se muestra. */
  function findItem(sectionId: string, itemId: string): Item | undefined {
    return sections.find((s) => s.id === sectionId)?.items.find((i) => i.id === itemId);
  }

  const scale = renderWidth / fieldMap.pageWidth;

  if (error) {
    return (
      <div className="form-error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <ExpandBox title="Formato del checklist">
    <div className="stack" ref={boxRef}>
      {loading ? <p className="muted kpi-sub">Abriendo el formato…</p> : null}

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
                  /*
                   * La caja se mide en puntos PDF y se escala entera; si los
                   * márgenes fueran en píxeles, al ampliar dejarían de cuadrar.
                   *
                   * Arranca 2pt a la izquierda del valor porque el ancho que
                   * reporta `widthOfString` para la etiqueta queda un pelo
                   * corto respecto a lo que dibuja pdfkit, y por esa rendija
                   * asomaban los guiones bajos del marcador de posición.
                   * De alto, 14pt: la línea mide ~13.9pt, así que tapa el valor
                   * sin comerse la línea de arriba.
                   */
                  const style = {
                    left: (f.x - 2) * scale,
                    top: (f.y - 0.5) * scale,
                    width: (f.w + 2) * scale,
                    height: (f.h + 2) * scale,
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

                  const value = item.value === null || item.value === undefined ? '' : String(item.value);

                  if (item.options?.length) {
                    return (
                      <select
                        key={`${f.sectionId}:${f.itemId}`}
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
                    <input
                      key={`${f.sectionId}:${f.itemId}`}
                      className="pdffield pdffield__input"
                      style={{ ...style, fontSize: PDF_FONT_SIZE * scale }}
                      value={value}
                      readOnly={!canEdit}
                      aria-label={item.label}
                      onChange={(e) => onUpdateItem(f.sectionId, f.itemId, { value: e.target.value })}
                    />
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <p className="muted kpi-sub">
        Escribes directamente sobre el formato. Al guardar, el PDF se vuelve a generar con lo que
        capturaste y queda listo para firmar y descargar.
      </p>
    </div>
    </ExpandBox>
  );
}
