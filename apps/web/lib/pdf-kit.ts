/**
 * Piezas comunes para los PDFs que el panel genera en el navegador: orden de
 * compra, campaña interna/externa, campaña de convenios y creación de boletera.
 *
 * Todos comparten tipografía, colores y el logo de Arta para que salgan como
 * una familia. `pdf-lib` se importa bajo demanda: solo lo paga quien pulsa
 * «PDF».
 */
import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';

export type PdfKit = {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  logo: PDFImage | null;
  rgb: (r: number, g: number, b: number) => RGB;
  colors: { ink: RGB; muted: RGB; line: RGB; soft: RGB; gold: RGB; red: RGB; link: RGB };
};

/** Carta vertical, en puntos. */
export const LETTER: [number, number] = [612, 792];

let inkLogoCache: Promise<ArrayBuffer | null> | null = null;

/**
 * El logo del panel es blanco sobre transparente (vive sobre fondo negro): en
 * un PDF blanco no se ve. Se repinta en tinta y se recorta al contorno real
 * para que alinee con el texto sin márgenes fantasma.
 */
function inkLogoPng(): Promise<ArrayBuffer | null> {
  if (inkLogoCache) return inkLogoCache;
  inkLogoCache = (async () => {
    const img = new Image();
    img.src = '/brand/arta-logo.png';
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        data.data[i] = 17;
        data.data[i + 1] = 17;
        data.data[i + 2] = 19;
        if (data.data[i + 3] > 12) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    ctx.putImageData(data, 0, 0);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d')?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    return blob ? blob.arrayBuffer() : null;
  })().catch(() => null);
  return inkLogoCache;
}

export async function createPdfKit(): Promise<PdfKit> {
  const lib = await import('pdf-lib');
  const pdf = await lib.PDFDocument.create();
  const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(lib.StandardFonts.HelveticaOblique);
  let logo: PDFImage | null = null;
  try {
    const bytes = await inkLogoPng();
    if (bytes) logo = await pdf.embedPng(bytes);
  } catch {
    // Sin logo el documento sigue siendo válido.
  }
  const { rgb } = lib;
  return {
    pdf,
    regular,
    bold,
    italic,
    logo,
    rgb,
    colors: {
      ink: rgb(0.07, 0.07, 0.08),
      muted: rgb(0.42, 0.42, 0.45),
      line: rgb(0.78, 0.78, 0.8),
      soft: rgb(0.955, 0.955, 0.96),
      gold: rgb(0.66, 0.51, 0.22),
      red: rgb(0.82, 0.12, 0.12),
      link: rgb(0.1, 0.35, 0.8),
    },
  };
}

/**
 * Helvetica estándar solo sabe WinAnsi: un emoji, una comilla tipográfica rara
 * o un salto de línea de Windows tumbaban el PDF entero con una excepción.
 */
export function pdfSafe(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E -ÿ]/g, '');
}

/** Parte un texto en renglones que caben en `maxWidth`. Respeta saltos de línea. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of pdfSafe(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Texto alineado a la derecha con su borde en `right`. */
export function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
) {
  const safe = pdfSafe(text);
  page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color });
}

/** Texto centrado entre `left` y `right`. */
export function drawCentered(
  page: PDFPage,
  text: string,
  left: number,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
) {
  const safe = pdfSafe(text);
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: left + (right - left - w) / 2, y, size, font, color });
}

/** Logo de Arta con su alto fijo; devuelve el ancho dibujado. */
export function drawLogo(kit: PdfKit, page: PDFPage, x: number, top: number, height: number): number {
  if (!kit.logo) {
    page.drawText('arta', { x, y: top - height * 0.8, size: height, font: kit.bold, color: kit.colors.ink });
    return kit.bold.widthOfTextAtSize('arta', height);
  }
  const scale = height / kit.logo.height;
  const width = kit.logo.width * scale;
  page.drawImage(kit.logo, { x, y: top - height, width, height });
  return width;
}

/** $4,558.00 — en los documentos siempre con centavos, como el machote. */
export function pdfMoney(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

/** «29 de octubre de 2026». */
export function pdfDate(iso?: string | Date | null): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function savePdf(kit: PdfKit): Promise<Blob> {
  const bytes = await kit.pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

/** Nombre de archivo sin acentos ni símbolos. */
export function fileSlug(value: string, fallback = 'documento'): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || fallback
  );
}

/** Descarga un blob generado en el navegador. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
