import type { DocBlock } from '@/components/files/DocEditor';

type Line = { y: number; x: number; text: string };

/**
 * Pasa un PDF a bloques editables.
 *
 * Se extrae el texto con pdf.js, se reagrupa por líneas (misma Y) y se juntan
 * líneas seguidas en párrafos cortando donde el salto vertical se agranda —
 * que es donde el documento original separaba párrafos.
 *
 * **Esto no reconstruye el diseño.** Tablas, columnas, imágenes y tipografías
 * se pierden: lo que queda es el texto, en orden, listo para reescribirse. Un
 * PDF escaneado (imagen sin capa de texto) no devuelve nada.
 */
export async function pdfToBlocks(url: string): Promise<DocBlock[]> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo abrir el PDF (${res.status})`);
  const buf = await res.arrayBuffer();

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  const blocks: DocBlock[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // 1) Agrupar los fragmentos en líneas por su coordenada vertical.
    const byLine = new Map<number, Line>();
    for (const item of content.items) {
      const it = item as { str?: string; transform?: number[] };
      const text = (it.str || '').replace(/\s+/g, ' ');
      if (!text.trim() || !it.transform) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      const existing = byLine.get(y);
      if (existing) {
        // Respeta el orden horizontal dentro de la línea.
        existing.text = x < existing.x ? `${text} ${existing.text}` : `${existing.text} ${text}`;
        existing.x = Math.min(existing.x, x);
      } else {
        byLine.set(y, { y, x, text });
      }
    }

    const lines = Array.from(byLine.values())
      .sort((a, b) => b.y - a.y) // el origen del PDF está abajo
      .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
      .filter((l) => l.text);

    if (!lines.length) continue;

    // 2) Salto típico entre líneas: la mediana de las diferencias.
    const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y)).filter((g) => g > 0);
    const median = gaps.length
      ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      : 0;
    const paragraphBreak = median ? median * 1.5 : Infinity;

    if (p > 1) blocks.push({ type: 'divider', text: '' });

    let current = lines[0].text;
    for (let i = 1; i < lines.length; i += 1) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y);
      if (gap > paragraphBreak) {
        blocks.push({ type: 'p', text: current });
        current = lines[i].text;
      } else {
        current = `${current} ${lines[i].text}`;
      }
    }
    blocks.push({ type: 'p', text: current });
  }

  return blocks.length ? blocks : [{ type: 'p', text: '' }];
}
