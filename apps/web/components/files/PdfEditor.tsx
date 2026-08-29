'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveFile } from '@/lib/file-save';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { useElementWidth } from '@/lib/use-element-width';

type Props = {
  url: string;
  fileName: string;
  canEdit: boolean;
  /** Dónde se guarda el PDF con el texto ya impreso */
  onSave: SaveFile;
  onSaved?: () => void | Promise<void>;
  /**
   * Aviso propio del contexto. El PDF de un checklist, por ejemplo, lo
   * regenera el sistema: ahí lo escrito se guarda como copia aparte.
   */
  note?: string;
  /** Texto del botón de guardar, cuando no se guarda encima del original */
  saveLabel?: string;
};

type Note = {
  id: string;
  page: number;
  /** Posición relativa al tamaño de la página, para no depender del zoom */
  xRatio: number;
  yRatio: number;
  text: string;
  size: number;
};

type PageInfo = { pageNumber: number; width: number; height: number };

/** Límites del ancho de dibujado: legible en columna, grande a pantalla completa */
const MIN_RENDER_WIDTH = 520;
const MAX_RENDER_WIDTH = 1700;
const DEFAULT_SIZE = 12;

let noteSeq = 0;
const nextId = () => `n${(noteSeq += 1)}`;

/** Helvetica de pdf-lib es WinAnsi: cambia lo que no puede dibujar. */
function toWinAnsi(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}

/**
 * PDF con escritura encima.
 *
 * Se dibujan las páginas reales con pdf.js, se colocan cajas de texto donde se
 * haga clic y al guardar se **imprimen dentro del PDF** con pdf-lib: el archivo
 * que queda en el evento ya trae el texto, no es una capa aparte. Es el
 * equivalente a rellenar y firmar un PDF a mano.
 *
 * Lo que esto NO hace: reescribir el texto original del PDF. Para eso está
 * «Pasar a documento editable», que extrae el texto a un documento tipo Word.
 */
export function PdfEditor({ url, fileName, canEdit, onSave, onSaved, note, saveLabel }: Props) {
  const bytesRef = useRef<Uint8Array | null>(null);
  /** Contenedor de cada página, para colgarle el canvas ya renderizado */
  const pageHostsRef = useRef(new Map<number, HTMLDivElement>());
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [placing, setPlacing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const dragRef = useRef<string | null>(null);
  const { ref: boxRef, width: boxWidth } = useElementWidth();

  // El PDF se dibuja al ancho disponible: en columna se ve completo y al
  // ampliar ocupa la ventana, sin quedarse en un tamaño fijo pequeño.
  const renderWidth = Math.min(
    MAX_RENDER_WIDTH,
    Math.max(MIN_RENDER_WIDTH, (boxWidth || MIN_RENDER_WIDTH) - 24),
  );

  // 1) Abrir el PDF y medir las páginas (todavía sin pintar).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotes([]);
    setPages([]);

    (async () => {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`No se pudo abrir el PDF (${res.status})`);
      const buf = await res.arrayBuffer();
      if (cancelled) return;
      bytesRef.current = new Uint8Array(buf.slice(0));

      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
      if (cancelled) return;

      const info: PageInfo[] = [];
      for (let p = 1; p <= doc.numPages; p += 1) {
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const scale = renderWidth / base.width;
        const vp = page.getViewport({ scale });
        info.push({ pageNumber: p, width: Math.floor(vp.width), height: Math.floor(vp.height) });
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
  }, [url, renderWidth]);

  // 2) Ya con los contenedores en el DOM, pintar cada página dentro del suyo.
  useEffect(() => {
    if (!pages.length || !bytesRef.current) return;
    let cancelled = false;

    (async () => {
      const pdfjs = await import('pdfjs-dist');
      const doc = await pdfjs.getDocument({ data: bytesRef.current!.slice(0) }).promise;

      for (const info of pages) {
        if (cancelled) return;
        const host = pageHostsRef.current.get(info.pageNumber);
        if (!host) continue;
        // Al cambiar el ancho hay que volver a rasterizar, no reutilizar.
        const drawn = host.querySelector('canvas');
        if (drawn && host.dataset.width === String(info.width)) continue;
        drawn?.remove();

        const page = await doc.getPage(info.pageNumber);
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
  }, [pages, renderWidth]);

  const addNoteAt = useCallback((page: number, xRatio: number, yRatio: number) => {
    setNotes((prev) => [
      ...prev,
      { id: nextId(), page, xRatio, yRatio, text: '', size: DEFAULT_SIZE },
    ]);
    setPlacing(false);
    setMsg('');
  }, []);

  function onPageClick(e: React.MouseEvent<HTMLDivElement>, p: PageInfo) {
    if (!placing || !canEdit) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addNoteAt(
      p.pageNumber,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    );
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 0.97);
    const yRatio = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 0.97);
    setNotes((prev) => prev.map((n) => (n.id === dragRef.current ? { ...n, xRatio, yRatio } : n)));
  }

  async function save() {
    if (!canEdit) return;
    const usable = notes.filter((n) => n.text.trim());
    if (!usable.length) {
      setError('Escribe algo en al menos una caja antes de guardar');
      return;
    }
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const original = bytesRef.current;
      if (!original) throw new Error('El PDF no está cargado');

      const pdf = await PDFDocument.load(original.slice(0));
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const pdfPages = pdf.getPages();

      for (const note of usable) {
        const page = pdfPages[note.page - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        const lines = toWinAnsi(note.text).split('\n');
        lines.forEach((line, i) => {
          if (!line) return;
          page.drawText(line, {
            x: note.xRatio * width,
            y: height - note.yRatio * height - note.size * (i + 1),
            size: note.size,
            font,
            color: rgb(0.05, 0.05, 0.05),
          });
        });
      }

      const out = await pdf.save();
      const blob = new Blob([out as BlobPart], { type: 'application/pdf' });
      await onSave(blob, /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`);

      // El PDF guardado pasa a ser el original: lo que se escriba después va
      // encima de esta versión, no de la anterior.
      bytesRef.current = new Uint8Array(await new Response(blob).arrayBuffer());
      setNotes([]);
      setMsg('Guardado: el texto quedó impreso dentro del PDF');
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el PDF');
    } finally {
      setSaving(false);
    }
  }

  const pending = notes.filter((n) => n.text.trim()).length;

  return (
    <ExpandBox title={fileName} defaultExpanded>
    <div className="stack" ref={boxRef}>
      <div className="sheet-toolbar">
        <span className="muted kpi-sub">
          {loading ? 'Abriendo PDF…' : `${pages.length} página${pages.length === 1 ? '' : 's'}`}
          {pending ? ` · ${pending} por imprimir` : ''}
        </span>
        <div className="row row--tight">
          {canEdit ? (
            <>
              <button
                className={placing ? 'btn btn-sm' : 'btn ghost btn-sm'}
                type="button"
                aria-pressed={placing}
                onClick={() => setPlacing((v) => !v)}
              >
                {placing ? 'Haz clic en el PDF…' : 'Escribir sobre el PDF'}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                disabled={saving || !pending}
                onClick={save}
              >
                {saving ? 'Guardando…' : saveLabel || 'Guardar en el PDF'}
              </button>
            </>
          ) : (
            <span className="muted kpi-sub">Solo lectura</span>
          )}
          <a className="btn ghost btn-sm" href={url} download={fileName}>
            Descargar
          </a>
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
      {note ? <div className="module-banner">{note}</div> : null}
      {placing ? (
        <div className="module-banner">Haz clic en el punto de la hoja donde quieres escribir.</div>
      ) : null}

      <div className={`pdfedit ${placing ? 'pdfedit--placing' : ''}`}>
        {pages.map((p) => (
          <div
            key={p.pageNumber}
            className="pdfedit__page"
            style={{ width: p.width, height: p.height }}
            ref={(el) => {
              if (el) pageHostsRef.current.set(p.pageNumber, el);
              else pageHostsRef.current.delete(p.pageNumber);
            }}
          >
            <div
              className="pdfedit__overlay"
              onClick={(e) => onPageClick(e, p)}
              onPointerMove={onPointerMove}
              onPointerUp={() => {
                dragRef.current = null;
              }}
            >
              {notes
                .filter((n) => n.page === p.pageNumber)
                .map((n) => (
                  <div
                    key={n.id}
                    className="pdfedit__note"
                    style={{ left: `${n.xRatio * 100}%`, top: `${n.yRatio * 100}%` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className="pdfedit__grip"
                      title="Arrastra para mover"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = n.id;
                      }}
                    >
                      ⠿
                    </span>
                    <textarea
                      className="pdfedit__input"
                      rows={1}
                      value={n.text}
                      placeholder="Escribe aquí…"
                      style={{ fontSize: n.size }}
                      onChange={(e) =>
                        setNotes((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="pdfedit__del"
                      title="Quitar"
                      onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <p className="muted kpi-sub">
        El texto se imprime dentro del PDF al guardar. Para reescribir el contenido original del
        documento, usa «Pasar a documento».
      </p>
    </div>
    </ExpandBox>
  );
}
