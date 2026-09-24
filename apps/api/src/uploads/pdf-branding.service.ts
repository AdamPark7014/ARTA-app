import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { join } from 'path';
import { existsSync } from 'fs';

export type BrandingMeta = {
  entity: 'ARTA' | 'EXPLANADA' | string;
  eventName: string;
  date?: string | null;
  venue?: string | null;
  city?: string | null;
  posterPath?: string | null;
  fileName?: string;
  version?: string | number | null;
  status?: string | null; // DRAFT/REVIEW/AUTHORIZED/PAID
  folio?: string | null;
  generatedBy?: string | null;
  generatedAt?: Date | null;
};

function brandAsset(name: string): string | null {
  const p = join(process.cwd(), 'apps', 'api', 'assets', 'brand', name);
  return existsSync(p) ? p : null;
}

@Injectable()
export class PdfBrandingService {
  private accent(entity: string): string {
    return entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
  }

  drawHeaderFooter(doc: PDFKit.PDFDocument, meta: BrandingMeta, pageWidth: number, firstPageTop = 90) {
    const left = 36;
    // Header
    doc
      .fillColor(this.accent(meta.entity))
      .fontSize(10)
      .text(meta.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES', left, 28, { width: pageWidth });

    let title = meta.eventName || 'Evento';
    const sub = [meta.date, meta.venue, meta.city].filter(Boolean).join(' · ');
    doc.fillColor('#111').fontSize(14).text(title, left, 44, { width: pageWidth });
    if (sub) doc.fillColor('#555').fontSize(9).text(sub, left, 64, { width: pageWidth });
    doc.moveTo(left, 78).lineTo(left + pageWidth, 78).strokeColor('#ccc').stroke();

    // Footer
    const by = meta.generatedBy ? ` · Generado por ${meta.generatedBy}` : '';
    const when = meta.generatedAt ? ` el ${meta.generatedAt.toLocaleString('es-MX')}` : '';
    const folio = meta.folio ? ` · Folio ${meta.folio}` : '';
    const ver = meta.version != null ? ` · v${meta.version}` : '';
    const stat = meta.status && meta.status !== 'AUTHORIZED' ? ` · ${meta.status}` : '';
    const footer = `${meta.fileName || ''}${ver}${folio}${by}${when}${stat}`.trim();
    if (footer) {
      doc
        .fillColor('#444')
        .fontSize(8)
        .text(footer, left, 570, { width: pageWidth, align: 'left' });
    }
    // First page content top reference
    return firstPageTop;
  }

  draftWatermark(doc: PDFKit.PDFDocument) {
    const w = doc.page.width;
    const h = doc.page.height;
    doc.save();
    doc.rotate(330, { origin: [w / 2, h / 2] });
    doc.fillColor('#e3e7ee').fontSize(86).opacity(0.45).text('BORRADOR', w / 2 - 200, h / 2 - 40, { width: 400, align: 'center' });
    doc.opacity(1).restore();
  }
}

