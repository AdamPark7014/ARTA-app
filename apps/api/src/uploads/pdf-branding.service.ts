import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';

export type BrandingMeta = {
  entity: 'ARTA' | 'EXPLANADA' | string;
  eventName: string;
  date?: string | null;
  venue?: string | null;
  city?: string | null;
  posterPath?: string | null;
  /** Título del documento (nombre del formato o del archivo). */
  fileName?: string;
  version?: string | number | null;
  status?: string | null; // DRAFT/REVIEW/AUTHORIZED/PAID
  folio?: string | null;
  generatedBy?: string | null;
  generatedAt?: Date | null;
};

/**
 * Identidad común de todos los PDF que salen del sistema: logo y banda de pie
 * tomados de los propios Word del cliente (`apps/api/assets/brand`), la misma
 * que estrenó el PDF de checklists. Una sola cabecera y un solo pie para
 * formatos, documentos, boletera, historial y Excel.
 *
 * Todo se posiciona con `doc.page.width/height`, y el texto del pie se pinta
 * con `lineBreak: false`: la versión anterior escribía el pie en y=570 fijo,
 * que en carta apaisada cae fuera del margen, y pdfkit respondía abriendo una
 * página nueva — de ahí la hoja en blanco al inicio de los Excel.
 */

const BRAND_DIRS = [
  join(process.cwd(), 'assets', 'brand'),
  join(process.cwd(), 'apps', 'api', 'assets', 'brand'),
  join(__dirname, '..', '..', 'assets', 'brand'),
  join(__dirname, '..', '..', '..', 'assets', 'brand'),
];

export function brandAsset(name: string): string | null {
  for (const dir of BRAND_DIRS) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const INK = '#111114';
const MUTED = '#6b6b72';
const LINE = '#cfcfd6';

/** Lo que reserva el pie: banda del cliente + folio. */
export const FOOTER_RESERVE = 88;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  AUTHORIZED: 'Autorizado',
  SEALED: 'Sellado',
  PAID: 'Pagada',
};

function fmtDateTime(d: Date): string {
  return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * «Distribución de Pendones (Excel).xlsx» → «Distribución de Pendones».
 *
 * Adam (27-09-2026): «que el pdf se vea productivo, no diga Excel así todo
 * raro». Quien nombra sus archivos en Drive suele apuntar de qué programa
 * viene («(Excel)», «(Word)»...) para no confundirlos entre sí, pero esa
 * marca solo tiene sentido junto al icono del archivo — repetida en el
 * título del documento que GENERAMOS (el PDF de salida) se lee como un error.
 * Se limpia solo para lo que el sistema imprime o nombra por su cuenta; el
 * nombre que la persona le dio a su archivo original nunca se toca.
 */
export function cleanDisplayTitle(name: string): string {
  let out = String(name ?? '').trim();
  const trailingQualifier = /\s*[\(\[]\s*(excel|word|xlsx?|docx?|csv|pdf)\s*[\)\]]\s*$/i;
  while (trailingQualifier.test(out)) {
    out = out.replace(trailingQualifier, '').trim();
  }
  return out.replace(/\s+/g, ' ').trim() || String(name ?? '').trim();
}

function safe(text: unknown): string {
  return String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7E -ÿ]/g, '');
}

@Injectable()
export class PdfBrandingService {
  accent(entity: string): string {
    return entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
  }

  entityLabel(entity: string): string {
    return entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES';
  }

  /**
   * Cabecera (logo, entidad, título, evento, filete) y pie de la página
   * actual. Devuelve la `y` donde puede empezar el contenido. `pageWidth` se
   * conserva por compatibilidad: el ancho real sale del margen de la página.
   */
  drawHeaderFooter(doc: PDFKit.PDFDocument, meta: BrandingMeta, pageWidth?: number, firstPageTop = 100, options?: { compact?: boolean }): number {
    const margin = Math.max(24, Math.round(doc.page.margins?.left ?? 36));
    const left = margin;
    const width = doc.page.width - margin * 2;
    const top = Math.min(40, Math.max(24, Math.round(doc.page.margins?.top ?? 36)));
    const compact = !!options?.compact;

    // Logo del cliente.
    const logoH = compact ? 22 : 34;
    const logo = brandAsset('arta-logo-ink.png');
    if (logo) {
      try {
        doc.image(logo, left, top, { height: logoH });
      } catch {
        doc.font(BOLD).fontSize(logoH * 0.7).fillColor(INK).text('arta', left, top, { lineBreak: false });
      }
    } else {
      doc.font(BOLD).fontSize(logoH * 0.7).fillColor(INK).text('arta', left, top, { lineBreak: false });
    }

    // Derecha: entidad, estado y trazabilidad.
    doc.font(BOLD).fontSize(7.5).fillColor(this.accent(meta.entity));
    doc.text(safe(this.entityLabel(meta.entity)), left, top + 2, { width, align: 'right', lineBreak: false });
    const lines: string[] = [];
    const status = meta.status ? STATUS_LABEL[String(meta.status).toUpperCase()] ?? String(meta.status) : '';
    const bits = [status ? status.toUpperCase() : '', meta.version != null && meta.version !== '' ? `Rev. ${meta.version}` : '']
      .filter(Boolean)
      .join(' · ');
    if (bits) lines.push(bits);
    if (meta.folio) lines.push(`Folio ${meta.folio}`);
    if (meta.generatedBy || meta.generatedAt) {
      lines.push(`${meta.generatedBy ? `Generado por ${meta.generatedBy}` : 'Generado'} · ${fmtDateTime(meta.generatedAt || new Date())}`);
    }
    doc.font(FONT).fontSize(6.8).fillColor(MUTED);
    lines.forEach((line, i) => doc.text(safe(line), left, top + 13 + i * 9, { width, align: 'right', lineBreak: false }));

    let y = top + logoH + (compact ? 8 : 14);
    if (!compact) {
      // Título del documento y línea del evento.
      const title = safe(meta.fileName || meta.eventName || 'Documento').toLocaleUpperCase('es-MX');
      doc.font(BOLD).fontSize(14).fillColor(INK);
      doc.text(this.fit(doc, title, 14, width), left, y, { width: width + 4, lineBreak: false });
      y += 18;
      const sub = [meta.eventName, meta.date, meta.venue, meta.city]
        .map((v) => safe(v).trim())
        .filter((v, i, all) => v && all.indexOf(v) === i)
        .join(' · ');
      if (sub) {
        doc.font(FONT).fontSize(9).fillColor(MUTED);
        doc.text(this.fit(doc, sub, 9, width), left, y, { width: width + 4, lineBreak: false });
        y += 12;
      }
    } else {
      doc.font(FONT).fontSize(7.5).fillColor(MUTED);
      const running = [meta.fileName, meta.eventName].map((v) => safe(v).trim()).filter(Boolean).join(' · ');
      doc.text(this.fit(doc, running, 7.5, width - 120), left, top + 4 + logoH, { width: width + 4, lineBreak: false });
      y = top + logoH + 14;
    }
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(compact ? 0.6 : 1.4).strokeColor(compact ? LINE : this.accent(meta.entity)).stroke();
    if (!compact) doc.moveTo(left, y).lineTo(left + 42, y).lineWidth(2.4).strokeColor(INK).stroke();
    y += compact ? 10 : 14;

    this.drawFooter(doc, meta);
    return Math.max(y, compact ? 0 : firstPageTop);
  }

  /** Banda del cliente, filete y nota, anclados al fondo de la página actual. */
  drawFooter(doc: PDFKit.PDFDocument, meta: BrandingMeta): void {
    const margin = Math.max(24, Math.round(doc.page.margins?.left ?? 36));
    const left = margin;
    const width = doc.page.width - margin * 2;
    const bandH = 44;
    const bandTop = doc.page.height - 26 - bandH;
    doc.moveTo(left, bandTop - 6).lineTo(left + width, bandTop - 6).lineWidth(0.5).strokeColor(LINE).stroke();
    const band = brandAsset('arta-footer.png');
    if (band) {
      try {
        doc.image(band, left, bandTop, { height: bandH });
      } catch {
        // sin banda, el PDF sigue siendo válido
      }
    }
    const note = [meta.fileName, meta.version != null && meta.version !== '' ? `v${meta.version}` : '']
      .map((v) => safe(v).trim())
      .filter(Boolean)
      .join(' · ');
    this.inFooterZone(doc, () => {
      doc.font(FONT).fontSize(6.8).fillColor(MUTED);
      doc.text(this.fit(doc, `${note ? `${note} · ` : ''}Generado en el sistema ARTA`, 6.8, width - 240), left, doc.page.height - 26 - 16, {
        width: width + 4,
        align: 'right',
        lineBreak: false,
      });
    });
  }

  /**
   * «Página n de N» en todas las páginas. Solo funciona con documentos creados
   * con `bufferPages: true`; se llama justo antes de `doc.end()`.
   */
  stampPageNumbers(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    if (!range || range.count <= 0) return;
    for (let p = range.start; p < range.start + range.count; p += 1) {
      doc.switchToPage(p);
      const margin = Math.max(24, Math.round(doc.page.margins?.left ?? 36));
      this.inFooterZone(doc, () => {
        doc.font(FONT).fontSize(6.8).fillColor(MUTED);
        doc.text(`Página ${p - range.start + 1} de ${range.count}`, margin, doc.page.height - 26 - 6, {
          width: doc.page.width - margin * 2,
          align: 'right',
          lineBreak: false,
        });
      });
    }
  }

  /**
   * pdfkit abre una página nueva en cuanto un texto queda por debajo del
   * margen inferior, aunque lleve `lineBreak: false`. El pie vive justo ahí, así
   * que mientras se pinta el margen inferior se pone a cero y luego se
   * restaura. Sin esto, cada pie fabricaba una página en blanco.
   */
  private inFooterZone(doc: PDFKit.PDFDocument, draw: () => void) {
    const margins = doc.page.margins as { bottom: number };
    const bottom = margins.bottom;
    margins.bottom = 0;
    try {
      draw();
    } finally {
      margins.bottom = bottom;
    }
  }

  /** Marca de agua discreta para borradores: se ve, no estorba para leer. */
  draftWatermark(doc: PDFKit.PDFDocument) {
    const w = doc.page.width;
    const h = doc.page.height;
    doc.save();
    doc.rotate(330, { origin: [w / 2, h / 2] });
    doc.font(BOLD).fontSize(64).fillColor('#9a9aa2').opacity(0.09);
    doc.text('BORRADOR', w / 2 - 220, h / 2 - 32, { width: 440, align: 'center', lineBreak: false });
    doc.opacity(1).restore();
  }

  /** Una línea que cabe en `maxWidth`; si no, se corta con «...». */
  fit(doc: PDFKit.PDFDocument, text: string, size: number, maxWidth: number): string {
    const t = safe(text).replace(/\s+/g, ' ').trim();
    const limit = Math.max(4, maxWidth - 1);
    doc.fontSize(size);
    if (doc.widthOfString(t) <= limit) return t;
    let out = t;
    while (out.length > 1 && doc.widthOfString(`${out}...`) > limit) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
  }
}
