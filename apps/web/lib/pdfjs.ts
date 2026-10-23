/**
 * pdf.js para el navegador, siempre en su build «legacy».
 *
 * El build moderno de pdfjs-dist 4.x llama a `Promise.withResolvers` sin
 * polyfill (y su worker también): en Safari anterior a 17.4 —Macs que se
 * quedaron en Big Sur/Monterey o que no actualizan Safari— abrir un PDF moría
 * con «Promise.withResolvers is not a function». El build legacy trae esos
 * polyfills y la misma API. `scripts/copy-pdf-worker.mjs` copia el worker del
 * mismo build, para que librería y worker no se desfasen.
 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs;
}
