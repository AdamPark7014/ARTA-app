import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { PdfBrandingService, type BrandingMeta } from '../uploads/pdf-branding.service';
import { uploadRoot } from '../uploads/upload-storage';

type Zone = { zona: string; aforo: number; precio: number };

@Injectable()
export class TicketingPdfService {
  constructor(private prisma: PrismaService, private branding: PdfBrandingService = new PdfBrandingService()) {}

  private dir() {
    const dir = join(uploadRoot, 'documents');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private money(n: number) {
    return `$ ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Genera el PDF «Creación de boletera» para un TicketingSetup.
   * Registra/actualiza como EventFile (module 'ticketing') y devuelve URL.
   */
  async generate(setupId: string, actorId: string | null): Promise<{ url: string; fileId: string }> {
    const setup = await this.prisma.ticketingSetup.findUnique({
      where: { id: setupId },
      include: { event: true },
    });
    if (!setup) throw new NotFoundException('Boletera no encontrada');
    const event = setup.event!;
    const zones: Zone[] = Array.isArray(setup.zonesJson) ? (setup.zonesJson as Zone[]) : [];
    const capacity = zones.reduce((s, z) => s + (Number(z.aforo || 0) || 0), 0);

    const dir = this.dir();
    const versionBase = Date.now();
    const storageName = `boletera-${setup.id}-${versionBase}.pdf`;
    const filePath = join(dir, storageName);

    // PDF
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      doc.on('error', reject);

      const left = 56;
      const right = 556;
      const bottom = 700;
      const meta: BrandingMeta = {
        entity: event.entity,
        eventName: event.name,
        fileName: 'CREACIÓN BOLETERA',
        version: 1,
        generatedBy: null,
        generatedAt: new Date(),
      };
      this.branding.drawHeaderFooter(doc, meta, right - left, 100);
      doc.moveDown(3.5);

      // Encabezado
      doc.fillColor('#111').fontSize(15).text('CREACIÓN BOLETERA', { width: right - left });
      doc.moveDown(0.2);
      const accent = event.entity === 'EXPLANADA' ? '#1f5c50' : '#8b6914';
      doc
        .strokeColor(accent)
        .lineWidth(1.2)
        .moveTo(left, doc.y)
        .lineTo(left + 28, doc.y)
        .stroke();
      doc.moveDown(0.8);

      // Datos
      const facts: Array<[string, string]> = [
        ['Evento', event.name],
        ['Boletera', setup.boletera],
        ['Fecha', setup.dateLabel || ''],
        ['Horario', setup.schedule || ''],
        ['Funciones', setup.functions ? String(setup.functions) : ''],
        ['Venue', setup.venue || event.venue || ''],
      ];
      for (const [k, v] of facts) {
        doc.fillColor('#6b6b72').fontSize(9).text(`${k}: `, { continued: true });
        doc.fillColor('#111').fontSize(10.5).text(v || '—');
      }
      doc.moveDown(0.8);

      // Zonas
      if (zones.length) {
        const tableTop = doc.y + 6;
        const colW = (right - left) / 3;
        doc
          .rect(left, tableTop, right - left, 18)
          .fill('#f0f2f5')
          .strokeColor('#cfd7e3')
          .lineWidth(0.6)
          .stroke();
        doc.fillColor('#222').fontSize(9.5);
        doc.text('Zona', left + 6, tableTop + 5, { width: colW - 12 });
        doc.text('Aforo', left + colW + 6, tableTop + 5, { width: colW - 12, align: 'right' });
        doc.text('Precio', left + colW * 2 + 6, tableTop + 5, { width: colW - 12, align: 'right' });
        let y = tableTop + 18;
        for (const z of zones) {
          if (y > bottom - 80) {
            doc.addPage();
            this.branding.drawHeaderFooter(doc, meta, right - left, 100);
            y = 100;
          }
          doc
            .rect(left, y, right - left, 16)
            .strokeColor('#e6e9ee')
            .lineWidth(0.4)
            .stroke();
          doc.fillColor('#333').fontSize(9);
          doc.text(z.zona, left + 6, y + 3, { width: colW - 12 });
          doc.text(String(Number(z.aforo || 0).toLocaleString('es-MX')), left + colW + 6, y + 3, {
            width: colW - 12,
            align: 'right',
          });
          doc.text(this.money(Number(z.precio || 0)), left + colW * 2 + 6, y + 3, {
            width: colW - 12,
            align: 'right',
          });
          y += 16;
        }
        // Total capacidad
        doc.font('Helvetica-Bold').text('Capacidad', left + 6, y + 6, { width: colW - 12 });
        doc
          .font('Helvetica')
          .text(String(capacity.toLocaleString('es-MX')), left + colW + 6, y + 6, { width: colW - 12, align: 'right' });
        doc.moveDown(3);
      }

      // Hold
      const holds: Array<[string, number | null | undefined]> = [
        ['Artista', setup.holdArtist],
        ['Promotor', setup.holdPromoter],
        ['Venue', setup.holdVenue],
      ];
      doc.fillColor('#6b6b72').fontSize(9).text('HOLD');
      doc.moveDown(0.3);
      for (const [k, v] of holds) {
        doc.fillColor('#6b6b72').fontSize(9).text(`${k}: `, { continued: true });
        doc.fillColor('#111').fontSize(10.5).text(v == null ? '—' : String(v));
      }
      doc.moveDown(0.6);

      // Artes
      if (setup.artsUrl) {
        doc.fillColor('#6b6b72').fontSize(9).text('Artes del evento: ', { continued: true });
        doc.fillColor('#1a4fb8').fontSize(9).text(setup.artsUrl);
      }

      // Descripción
      if (setup.description) {
        doc.moveDown(0.8);
        doc.fillColor('#111').fontSize(10).text(setup.description, { width: right - left });
      }

      doc.end();
    });

    // Registrar/actualizar EventFile PDF
    const outName = `BOLETERA ${event.name}.pdf`;
    const existing = await this.prisma.eventFile.findFirst({
      where: { eventId: event.id, module: 'ticketing', kind: 'pdf', fileName: outName, deletedAt: null },
    });
    if (existing) {
      const updated = await this.prisma.eventFile.update({
        where: { id: existing.id },
        data: {
          url: `/uploads/documents/${storageName}`,
          version: { increment: 1 },
          updatedById: actorId || undefined,
          mimeType: 'application/pdf',
        },
      });
      return { url: updated.url, fileId: updated.id };
    }
    const created = await this.prisma.eventFile.create({
      data: {
        eventId: event.id,
        fileName: outName,
        mimeType: 'application/pdf',
        url: `/uploads/documents/${storageName}`,
        kind: 'pdf',
        module: 'ticketing',
        updatedById: actorId || undefined,
      },
    });
    return { url: created.url, fileId: created.id };
  }
}

