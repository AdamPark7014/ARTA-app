'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '@/lib/pdfjs';
import { useElementWidth } from '@/lib/use-element-width';

type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>;

/** Tope de densidad: iOS deja de pintar un canvas de más de 16.7 millones de píxeles. */
const MAX_DPR = 2;

/**
 * El PDF página por página, dibujado con pdf.js. Para teléfono y tableta, donde
 * un iframe no sirve (`isMobileBrowser`). Cada página aparta su alto desde el
 * principio y se pinta al acercarse a la vista: un PDF de 40 páginas abre igual
 * de rápido que uno de una.
 */
export function PdfPages({ src, title, onFail }: { src: string; title: string; onFail?: () => void }) {
  const { ref: boxRef, width } = useElementWidth();
  const docRef = useRef<PdfDoc | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRatios([]);
    (async () => {
      const pdfjs = await loadPdfjs();
      const data = await (await fetch(src)).arrayBuffer();
      const doc = await pdfjs.getDocument({ data }).promise;
      if (cancelled) return;
      docRef.current = doc;
      const next: number[] = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
        next.push(vp.height / vp.width);
      }
      if (!cancelled) setRatios(next);
    })().catch(() => {
      if (!cancelled) onFail?.();
    });
    return () => {
      cancelled = true;
    };
    // `onFail` es un aviso, no una razón para volver a abrir el archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const box = boxRef.current;
    const doc = docRef.current;
    if (!box || !doc || !width || !ratios.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const hosts = Array.from(box.querySelectorAll<HTMLDivElement>('[data-page]'));
    const paint = async (host: HTMLDivElement) => {
      const page = await doc.getPage(Number(host.dataset.page));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (host.clientWidth * dpr) / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) return;
      await page.render({ canvasContext, viewport }).promise;
      host.replaceChildren(canvas);
    };
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          seen.unobserve(entry.target);
          void paint(entry.target as HTMLDivElement).catch(() => undefined);
        }
      },
      { root: box, rootMargin: '600px 0px' },
    );
    hosts.forEach((host) => seen.observe(host));
    return () => seen.disconnect();
  }, [boxRef, width, ratios]);

  return (
    <div ref={boxRef} className="pdfpages" role="document" aria-label={title}>
      {ratios.map((ratio, i) => (
        <div
          key={i}
          className="pdfpages__page"
          data-page={i + 1}
          aria-label={`Página ${i + 1} de ${ratios.length}`}
          style={{ aspectRatio: `1 / ${ratio}` }}
        />
      ))}
    </div>
  );
}
