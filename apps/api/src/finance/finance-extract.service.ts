import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { uploadRoot } from '../uploads/upload-storage';
import { safeAmount, type FinanceRow } from './finance-totals';

/**
 * Lee el Excel de la corrida y extrae los renglones.
 *
 * El panel llama al Excel «la corrida viva», pero **el servidor nunca lo
 * leía**: los KPIs de dirección salían de `FinanceRun.dataJson`, que casi
 * siempre estaba vacío porque la tabla simple está colapsada y marcada como
 * «Resumen rápido (opcional)». Resultado: el dashboard reportaba ceros aunque
 * la corrida estuviera llena.
 *
 * Aquí se cierra ese hueco: el archivo sigue siendo la fuente, y de él salen
 * las cifras. El equipo no pierde la libertad de la hoja.
 */

/** Hojas de las que se leen renglones, y de qué tipo son. */
const SHEET_KIND: Array<{ test: RegExp; type: 'income' | 'expense' }> = [
  { test: /ingres/i, type: 'income' },
  { test: /egres|gasto/i, type: 'expense' },
];

/** Encabezados que marcan dónde empieza la tabla. */
const HEADER_HINT = /concepto|descripci|rubro/i;

/** Filas que no son datos. */
const NOT_A_ROW = /^(total|subtotal|neto|suma)\b/i;

@Injectable()
export class FinanceExtractService {
  private readonly logger = new Logger(FinanceExtractService.name);

  constructor(private prisma: PrismaService) {}

  /** Renglones leídos del libro, listos para totalizar. */
  async rowsFromWorkbook(buffer: Buffer): Promise<FinanceRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const rows: FinanceRow[] = [];

    for (const sheet of wb.worksheets) {
      const kind = SHEET_KIND.find((k) => k.test.test(sheet.name));
      if (!kind) continue;

      // La tabla empieza después del encabezado; antes va el bloque de meta.
      let started = false;
      sheet.eachRow((row) => {
        const concept = String(row.getCell(1).value ?? '').trim();
        if (!started) {
          if (HEADER_HINT.test(concept)) started = true;
          return;
        }
        if (!concept || NOT_A_ROW.test(concept)) return;

        const cell = row.getCell(2);
        // Una celda con fórmula trae el valor calculado en `result`.
        const raw =
          cell.value && typeof cell.value === 'object' && 'result' in cell.value
            ? (cell.value as ExcelJS.CellFormulaValue).result
            : cell.value;
        const amount = safeAmount(raw);
        if (!amount) return;

        rows.push({ concept, type: kind.type, amount });
      });
    }

    return rows;
  }

  /**
   * Sincroniza `FinanceRun.dataJson` con lo que dice el Excel del evento.
   *
   * Nunca lanza: si el libro está raro, la corrida se queda como estaba y se
   * registra en el log. Que falle una extracción no puede tumbar un guardado.
   */
  async syncFromEventWorkbook(eventId: string): Promise<{ rows: number } | null> {
    try {
      const file = await this.prisma.eventFile.findFirst({
        where: { eventId, module: 'finance', deletedAt: null, fileName: { endsWith: '.xlsx' } },
        orderBy: { updatedAt: 'desc' },
      });
      if (!file) return null;

      const path = join(uploadRoot, basename(file.url));
      if (!existsSync(path)) return null;

      const rows = await this.rowsFromWorkbook(readFileSync(path));
      if (!rows.length) return null;

      const run = await this.prisma.financeRun.findFirst({ where: { eventId } });
      if (!run) return null;

      const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + safeAmount(r.amount), 0);
      const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + safeAmount(r.amount), 0);

      await this.prisma.financeRun.update({
        where: { id: run.id },
        data: { dataJson: { rows, totalIncome: income, totalExpense: expense } },
      });

      return { rows: rows.length };
    } catch (e) {
      this.logger.warn(
        `No se pudo extraer la corrida del evento ${eventId}: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }
}
