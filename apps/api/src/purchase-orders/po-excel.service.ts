import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { uploadRoot } from '../uploads/upload-storage';
import type { Prisma } from '@prisma/client';

type SimpleOrder = {
  id: string;
  eventId: string;
  vendorName: string | null;
  description: string | null;
  paymentMethod: string | null;
  payeeType: string | null;
  withIva: boolean | null;
  amount: Prisma.Decimal | number;
  createdAt: Date | null;
  createdBy?: { fullName?: string | null } | null;
  authorizedBy?: { fullName?: string | null } | null;
  authorizedAt?: Date | null;
  paidAt?: Date | null;
  lines?: Array<{ concept: string; qty: Prisma.Decimal | number | null; unitPrice: Prisma.Decimal | number | null; total?: Prisma.Decimal | number | null }>;
};

type SimpleEvent = { name: string; entity: string };

function normalize(n: unknown): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

@Injectable()
export class PurchaseOrderExcelService {
  private findHeaderRow(ws: ExcelJS.Worksheet): { row: number; cols: { qty: number; concept: number; price: number; total: number } } | null {
    const target = [/^cant/i, /^descr/i, /^precio/i, /^sub?total/i];
    for (let r = 1; r <= Math.min(60, ws.rowCount); r += 1) {
      const cells = ws.getRow(r);
      const foundIdx: number[] = [];
      for (let c = 1; c <= Math.min(20, cells.cellCount); c += 1) {
        const v = String(ws.getRow(r).getCell(c).text || '').trim();
        if (!v) continue;
        const i = target.findIndex((re, idx) => foundIdx[idx] == null && re.test(v));
        if (i >= 0) foundIdx[i] = c;
      }
      if (foundIdx.length === 4 && foundIdx.every((n) => typeof n === 'number')) {
        return { row: r, cols: { qty: foundIdx[0]!, concept: foundIdx[1]!, price: foundIdx[2]!, total: foundIdx[3]! } };
      }
    }
    return null;
  }

  private writeFacts(ws: ExcelJS.Worksheet, order: SimpleOrder, event: SimpleEvent) {
    const pairs: Array<{ re: RegExp; value: string }> = [
      { re: /fecha.*solicitud/i, value: order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-MX') : '' },
      { re: /solicitante/i, value: order.createdBy?.fullName || '' },
      { re: /evento/i, value: event.name || '' },
      { re: /proveedor/i, value: order.vendorName || '' },
      { re: /forma.*pago/i, value: (order.paymentMethod || '').toString() },
    ];
    // Busca una celda con la etiqueta y escribe a la derecha inmediata
    for (let r = 1; r <= Math.min(80, ws.rowCount); r += 1) {
      for (let c = 1; c <= Math.min(20, ws.columnCount); c += 1) {
        const text = String(ws.getRow(r).getCell(c).text || '').trim();
        if (!text) continue;
        const hit = pairs.find((p) => p.re.test(text));
        if (hit) {
          ws.getRow(r).getCell(c + 1).value = hit.value;
        }
      }
    }
  }

  async buildFromTemplate(templatePath: string, order: SimpleOrder, event: SimpleEvent): Promise<{ excelPath: string }> {
    if (!existsSync(templatePath)) {
      throw new NotFoundException('Plantilla de OC no encontrada en disco');
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0] || wb.addWorksheet('OC');

    // Datos de cabecera (heurística por etiquetas)
    this.writeFacts(ws, order, event);

    // Partidas: detecta la fila de encabezado por textos conocidos
    const head = this.findHeaderRow(ws);
    if (head) {
      const startRow = head.row + 1;
      const lines = order.lines || [];
      lines.forEach((ln, i) => {
        const r = ws.getRow(startRow + i);
        r.getCell(head.cols.qty).value = normalize(ln.qty) ?? '';
        r.getCell(head.cols.concept).value = (ln.concept || '').toString();
        r.getCell(head.cols.price).value = normalize(ln.unitPrice) ?? '';
        // Dejar que el template calcule subtotal si trae fórmula; si no, escribirlo
        if (!r.getCell(head.cols.total).formula) {
          const qty = normalize(ln.qty) ?? 0;
          const price = normalize(ln.unitPrice) ?? 0;
          r.getCell(head.cols.total).value = qty * price;
        }
        r.commit();
      });
    }

    const outName = `oc-${order.id}-v1.xlsx`;
    const excelPath = join(uploadRoot, outName);
    await wb.xlsx.writeFile(excelPath);
    return { excelPath };
  }
}

