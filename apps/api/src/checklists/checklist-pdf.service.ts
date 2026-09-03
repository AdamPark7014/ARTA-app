import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type ChecklistData = {
  sections?: Array<{
    id: string;
    title: string;
    items?: Array<{
      id: string;
      label: string;
      type?: string;
      done?: boolean;
      value?: string | number | null;
    }>;
  }>;
};

type SignaturePayload = {
  signerName?: string;
  imageDataUrl?: string;
  signedAt?: string;
};

/**
 * Dónde quedó cada dato dentro del PDF.
 *
 * El PDF lo genera este servicio, así que puede decir en qué página y en qué
 * coordenadas escribió cada ítem. El panel usa ese mapa para poner un campo de
 * captura justo encima, y así se escribe **sobre el documento** en vez de en un
 * formulario aparte que lo controle.
 *
 * Coordenadas en puntos PDF desde la esquina superior izquierda de la página.
 */
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

type PdfInput = {
  title: string;
  eventName: string;
  entity: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  templateKey?: string;
  data: ChecklistData;
  delivered?: SignaturePayload | null;
  authorized?: SignaturePayload | null;
  editedBy?: string | null;
  editedAt?: Date | null;
  /** Optional ticketing brand for header (name + logo file path). */
  boleteraName?: string | null;
  boleteraLogoPath?: string | null;
};

function dataUrlToBuffer(dataUrl?: string): Buffer | null {
  if (!dataUrl?.startsWith('data:image')) return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  try {
    return Buffer.from(parts[1], 'base64');
  } catch {
    return null;
  }
}

@Injectable()
export class ChecklistPdfService {
  constructor(private prisma: PrismaService) {}

  private uploadRoot() {
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const dir = join(root, 'checklists');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Resolve /uploads/... URL to absolute disk path under UPLOAD_DIR. */
  resolveUploadPath(url?: string | null): string | null {
    if (!url) return null;
    const cleaned = url.replace(/^\/uploads\/?/i, '').replace(/^uploads\//i, '');
    if (!cleaned || cleaned.includes('..')) return null;
    const root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const full = join(root, cleaned);
    return existsSync(full) ? full : null;
  }

  async generate(
    checklistId: string,
    input: PdfInput,
    /**
     * Revisión del formato. El archivo lleva el número en el nombre, así que
     * **cada versión queda en disco**: el PDF que alguien firmó no se puede
     * pisar. Antes todo se escribía siempre en `<id>.pdf` y cada regeneración
     * borraba el documento anterior, firmas incluidas.
     */
    revision?: number,
  ): Promise<{ url: string; filePath: string; fieldMap: PdfFieldMap }> {
    const dir = this.uploadRoot();
    const fileName = revision === undefined ? `${checklistId}.pdf` : `${checklistId}-r${revision}.pdf`;
    const filePath = join(dir, fileName);

    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const fields: PdfField[] = [];

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      // La primera página existe al crear el documento y no dispara el evento.
      let pageIndex = 0;
      doc.on('pageAdded', () => {
        pageIndex += 1;
      });

      const accent = input.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
      const left = 48;
      const pageRight = 564;
      let headerY = 48;

      if (input.boleteraLogoPath && existsSync(input.boleteraLogoPath)) {
        try {
          doc.image(input.boleteraLogoPath, pageRight - 110, headerY, { fit: [110, 42], align: 'right' });
        } catch {
          // ignore unsupported logo formats
        }
      }

      doc.fillColor(accent).fontSize(11).text(
        input.entity === 'EXPLANADA' ? 'AUDITORIO AREMA · EXPLANADA' : 'ARTA PRODUCCIONES',
        left,
        headerY,
        { width: 380, align: 'left' },
      );
      headerY = doc.y + 4;
      doc.fillColor('#111').fontSize(18).text(input.title, left, headerY, { width: 400, align: 'left' });
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor('#444')
        .text(`Evento: ${input.eventName}`)
        .text([input.artist, input.venue, input.city].filter(Boolean).join(' · ') || '—')
        .text(`Plantilla: ${input.templateKey || 'CUSTOM'}`)
        .text(`Generado: ${new Date().toLocaleString('es-MX')}`);
      if (input.boleteraName) {
        doc.text(`Boletera: ${input.boleteraName}`);
      }
      if (input.editedBy) {
        doc.text(`Última edición: ${input.editedBy}${input.editedAt ? ` · ${input.editedAt.toLocaleString('es-MX')}` : ''}`);
      }

      doc.moveDown(0.8);
      doc.strokeColor(accent).lineWidth(1.5).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
      doc.moveDown(0.8);

      for (const section of input.data.sections || []) {
        if (doc.y > 680) doc.addPage();
        doc.fillColor(accent).fontSize(12).text(section.title.toUpperCase());
        doc.moveDown(0.35);
        doc.fillColor('#222').fontSize(10);

        for (const item of section.items || []) {
          if (doc.y > 720) doc.addPage();
          const top = doc.y;
          const page = pageIndex;

          if (item.type === 'check' || !item.type) {
            const mark = item.done ? '[X]' : '[ ]';
            const markWidth = doc.widthOfString('[X]');
            doc.text(`${mark}  ${item.label}`);
            fields.push({
              sectionId: section.id,
              itemId: item.id,
              type: 'check',
              page,
              x: left,
              y: top,
              w: markWidth,
              h: 12,
            });
          } else {
            const val =
              item.value === null || item.value === undefined || item.value === ''
                ? '______________'
                : String(item.value);
            const labelWidth = doc.widthOfString(`${item.label}: `);
            doc.text(`${item.label}: ${val}`);
            fields.push({
              sectionId: section.id,
              itemId: item.id,
              type: 'value',
              page,
              x: left + labelWidth,
              y: top,
              w: Math.max(60, pageRight - left - labelWidth),
              h: 12,
            });
          }
          doc.moveDown(0.2);
        }
        doc.moveDown(0.55);
      }

      // Firmas
      if (doc.y > 560) doc.addPage();
      doc.moveDown(0.5);
      doc.strokeColor(accent).lineWidth(1).moveTo(48, doc.y).lineTo(564, doc.y).stroke();
      doc.moveDown(0.7);
      doc.fillColor('#111').fontSize(12).text('FIRMAS DIGITALES');
      doc.moveDown(0.5);

      const colW = 240;
      const startY = doc.y;
      this.drawSignatureBlock(doc, 48, startY, colW, 'ENTREGADO', input.delivered);
      this.drawSignatureBlock(doc, 320, startY, colW, 'AUTORIZADO', input.authorized);

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return {
      url: `/uploads/checklists/${fileName}`,
      filePath,
      fieldMap: { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, fields },
    };
  }

  private drawSignatureBlock(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    sig?: SignaturePayload | null,
  ) {
    doc.fillColor('#666').fontSize(9).text(label, x, y);
    const img = dataUrlToBuffer(sig?.imageDataUrl);
    const imgY = y + 14;
    if (img) {
      try {
        doc.image(img, x, imgY, { fit: [width, 70] });
      } catch {
        doc.rect(x, imgY, width, 70).stroke('#ccc');
      }
    } else {
      doc.rect(x, imgY, width, 70).stroke('#ccc');
      doc.fillColor('#aaa').fontSize(8).text('Pendiente de firma', x + 8, imgY + 30);
    }
    const nameY = imgY + 78;
    doc.fillColor('#111').fontSize(9).text(sig?.signerName || '________________', x, nameY);
    if (sig?.signedAt) {
      doc.fillColor('#666').fontSize(8).text(new Date(sig.signedAt).toLocaleString('es-MX'), x, nameY + 12);
    }
  }

  /** Regenerate PDF for one checklist instance; returns updated row or null. */
  /**
   * @param force  Solo el flujo de firma lo usa: es el único caso en que hay
   *               que reimprimir un formato autorizado, porque justo acaba de
   *               firmarse y la firma tiene que quedar dentro del PDF.
   */
  async regenerateInstance(checklistId: string, options?: { force?: boolean }) {
    const item = await this.prisma.checklistInstance.findUnique({
      where: { id: checklistId },
      include: {
        event: true,
        template: true,
        lastEditedBy: { select: { fullName: true } },
      },
    });
    if (!item) return null;

    /*
     * Un formato autorizado no se vuelve a imprimir. Antes cualquier guardado
     * posterior a la firma reescribía el PDF con la imagen de la firma pegada
     * encima del contenido NUEVO: el documento parecía autorizado sin serlo.
     * `regenerateForEvent` ya protegía esto; por aquí se colaba.
     */
    if (!options?.force && (item.authorizedAt || item.authorizedSignature)) {
      return item;
    }

    const delivered = item.deliveredSignature as SignaturePayload | null;
    const authorized = item.authorizedSignature as SignaturePayload | null;

    const ticketing = await this.prisma.ticketingSetup.findFirst({
      where: { eventId: item.eventId },
      orderBy: { updatedAt: 'desc' },
      select: { boletera: true, logoUrl: true },
    });

    const { url, fieldMap } = await this.generate(
      checklistId,
      {
        title: item.title,
        eventName: item.event.name,
        entity: item.event.entity,
        artist: item.event.artist,
        venue: item.event.venue,
        city: item.event.city,
        templateKey: item.template?.key,
        data: item.dataJson as ChecklistData,
        delivered: delivered
          ? { ...delivered, signedAt: delivered.signedAt || item.deliveredAt?.toISOString() }
          : null,
        authorized: authorized
          ? { ...authorized, signedAt: authorized.signedAt || item.authorizedAt?.toISOString() }
          : null,
        editedBy: item.lastEditedBy?.fullName,
        editedAt: item.lastEditedAt,
        boleteraName: ticketing?.boletera || null,
        boleteraLogoPath: this.resolveUploadPath(ticketing?.logoUrl),
      },
      item.revision,
    );

    return this.prisma.checklistInstance.update({
      where: { id: checklistId },
      data: {
        pdfUrl: url,
        pdfGeneratedAt: new Date(),
        pdfFieldsJson: fieldMap as unknown as Prisma.InputJsonValue,
      },
      include: {
        template: true,
        lastEditedBy: { select: { id: true, fullName: true, email: true } },
        deliveredBy: { select: { id: true, fullName: true } },
        authorizedBy: { select: { id: true, fullName: true } },
        signatures: { orderBy: { signedAt: 'desc' }, take: 10 },
        files: true,
      },
    });
  }

  /** After boletera/logo changes, refresh draft checklist PDFs for the event.
   * Never rewrite PDFs already authorized (authorizedAt / authorizedSignature). */
  async regenerateForEvent(eventId: string): Promise<number> {
    const rows = await this.prisma.checklistInstance.findMany({
      where: { eventId },
      select: { id: true, authorizedAt: true, authorizedSignature: true },
    });
    let n = 0;
    for (const row of rows) {
      if (row.authorizedAt || row.authorizedSignature) continue;
      try {
        await this.regenerateInstance(row.id);
        n += 1;
      } catch {
        // keep going for other checklists
      }
    }
    return n;
  }

  /** Helper if we ever need to read an existing PDF buffer */
  readIfExists(checklistId: string): Buffer | null {
    const filePath = join(this.uploadRoot(), `${checklistId}.pdf`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }
}

export type SignatureJson = Prisma.InputJsonValue;
