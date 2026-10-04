import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { SheetOp } from './sheet-ops';
import { applySheetOp, describeSheetOp } from './xlsx-structure';

/**
 * Parcheo de celdas del lado del servidor.
 *
 * El editor del panel **ya sabe exactamente qué celdas cambió** (compara contra
 * el libro original antes de guardar). En vez de mandar un `.xlsx`
 * reconstruido en el navegador —que con SheetJS Community pierde estilos,
 * formato condicional y validaciones en TODO el libro— manda solo el delta y
 * aquí se aplica sobre el archivo real con ExcelJS.
 *
 * Ventajas de hacerlo aquí:
 * - ExcelJS ya era dependencia del API: coste de bundle en el navegador = 0.
 * - Un solo round-trip en el servidor, no uno por guardado en cada máquina.
 * - El delta *es* el diff del Excel: trazabilidad de la corrida gratis.
 *
 * Límite honesto: ExcelJS tampoco conserva gráficas, tablas dinámicas ni
 * macros. Por eso existe `inspectWorkbook`, que marca esos libros como no
 * editables en panel antes de que nadie los estropee.
 */

export type CellChange = {
  sheet: string;
  /** Referencia A1, p. ej. `B9`. */
  ref: string;
  /** Fórmula sin el `=` inicial. Excluyente con `value`. */
  formula?: string | null;
  value?: string | number | boolean | null;
};

/**
 * `ops` (correcciones 30-09-2026): filas/columnas insertadas o eliminadas, en
 * el orden en que se hicieron. Se aplican ANTES que `cells`, cuyas
 * referencias ya vienen con las posiciones finales.
 */
export type SheetStructChange = { add: string } | { rename: { from: string; to: string } };

/** `sheets`: hojas agregadas o renombradas en el panel; van antes que todo. */
export type CellPatch = { cells?: CellChange[]; ops?: SheetOp[]; sheets?: SheetStructChange[] };

/** Tope defensivo: un guardado normal toca decenas de celdas, no miles. */
const MAX_CELLS = 5000;
const MAX_OPS = 200;
const REF = /^[A-Z]{1,3}[1-9]\d{0,6}$/;

/**
 * Partes de un `.xlsx` que ExcelJS no sabe reescribir. Se buscan por nombre en
 * el directorio del zip: no hace falta descomprimir, los nombres de entrada
 * viajan en claro dentro del archivo.
 */
const UNSUPPORTED_PARTS: Array<{ needle: string; label: string }> = [
  { needle: 'xl/charts/', label: 'gráficas' },
  { needle: 'xl/pivotCache/', label: 'tablas dinámicas' },
  { needle: 'xl/pivotTables/', label: 'tablas dinámicas' },
  { needle: 'vbaProject.bin', label: 'macros' },
  { needle: 'xl/threadedComments/', label: 'comentarios con hilo' },
  { needle: 'xl/slicers/', label: 'segmentaciones' },
];

export type WorkbookInspection = {
  editable: boolean;
  /** Explicación para la persona, o `null` si se puede editar. */
  reason: string | null;
};

@Injectable()
export class XlsxPatchService {
  /**
   * ¿Se puede editar este libro en el panel sin degradarlo?
   *
   * Es una lectura de bytes, no una carga del libro: barata y sin riesgo de
   * reventar con un archivo raro.
   */
  inspectWorkbook(buffer: Buffer): WorkbookInspection {
    // Un .xlsx es un zip; si no lo es, no es asunto de este servicio.
    if (buffer.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') {
      return { editable: false, reason: 'El archivo no es un .xlsx válido' };
    }
    const raw = buffer.toString('latin1');
    const found = UNSUPPORTED_PARTS.filter((p) => raw.includes(p.needle)).map((p) => p.label);
    if (!found.length) return { editable: true, reason: null };

    const unique = [...new Set(found)];
    const list = unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(', ')} y ${unique.at(-1)}`;
    return {
      editable: false,
      reason: `Este libro tiene ${list}. Edítalo en Excel y vuelve a subirlo — aquí se ve, pero no se edita para no estropearlo.`,
    };
  }

  /**
   * Aplica el delta y devuelve el `.xlsx` resultante.
   *
   * Solo se tocan las celdas del parche: todo lo demás sale tal cual lo dejó
   * ExcelJS al leer, incluidos estilos, anchos y las fórmulas que nadie tocó.
   */
  async applyCellPatch(buffer: Buffer, patch: CellPatch): Promise<Buffer> {
    const cells = patch?.cells ?? [];
    const ops = patch?.ops ?? [];
    const sheets = patch?.sheets ?? [];
    if (
      !Array.isArray(cells) ||
      !Array.isArray(ops) ||
      !Array.isArray(sheets) ||
      (!cells.length && !ops.length && !sheets.length)
    ) {
      throw new BadRequestException('El parche no trae celdas');
    }
    if (cells.length > MAX_CELLS) {
      throw new BadRequestException(`Demasiadas celdas en un solo guardado (${cells.length})`);
    }
    if (ops.length > MAX_OPS) {
      throw new BadRequestException(`Demasiados cambios de filas o columnas en un solo guardado (${ops.length})`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    for (const change of sheets) this.applySheetChange(workbook, change);
    for (const op of ops) applySheetOp(workbook, op);

    for (const change of cells) {
      if (!change || typeof change.sheet !== 'string' || typeof change.ref !== 'string') {
        throw new BadRequestException('Celda mal formada en el parche');
      }
      const ref = change.ref.toUpperCase();
      if (!REF.test(ref)) {
        throw new BadRequestException(`Referencia de celda inválida: ${change.ref}`);
      }

      const sheet = workbook.getWorksheet(change.sheet);
      if (!sheet) {
        throw new BadRequestException(`La hoja «${change.sheet}» no existe en el libro`);
      }

      const cell = sheet.getCell(ref);
      if (change.formula) {
        // Se conserva como fórmula viva; Excel calculará el valor al abrir.
        cell.value = { formula: change.formula.replace(/^=/, ''), result: undefined };
      } else if (change.value === null || change.value === undefined || change.value === '') {
        cell.value = null;
      } else {
        cell.value = change.value;
      }
    }

    // Mantener el comportamiento existente: no forzar recálculo en apertura aquí.
    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out);
  }

  /** Hoja nueva o renombrada desde el panel («+ Hoja», doble clic en la pestaña). */
  private applySheetChange(workbook: ExcelJS.Workbook, change: SheetStructChange) {
    const valid = (name: unknown): name is string =>
      typeof name === 'string' && !!name.trim() && name.length <= 31 && !/[\\/?*[\]:]/.test(name);
    if (change && 'add' in change) {
      if (!valid(change.add)) throw new BadRequestException('Nombre de hoja inválido');
      if (!workbook.getWorksheet(change.add)) workbook.addWorksheet(change.add);
      return;
    }
    if (change && 'rename' in change) {
      const { from, to } = change.rename ?? ({} as { from?: string; to?: string });
      if (!valid(from) || !valid(to)) throw new BadRequestException('Nombre de hoja inválido');
      const ws = workbook.getWorksheet(from);
      if (!ws) throw new BadRequestException(`La hoja «${from}» no existe en el libro`);
      if (workbook.getWorksheet(to)) throw new BadRequestException(`Ya existe una hoja «${to}»`);
      ws.name = to;
      return;
    }
    throw new BadRequestException('Cambio de hoja mal formado');
  }

  /** Nota del historial: «1 fila insertada · 3 celdas editadas». */
  describePatch(patch: CellPatch): string {
    const parts = (patch?.sheets ?? []).map((s) =>
      'add' in s ? `hoja «${s.add}» agregada` : `hoja «${s.rename.from}» → «${s.rename.to}»`,
    );
    parts.push(...(patch?.ops ?? []).map((op) => describeSheetOp(op)));
    const n = patch?.cells?.length ?? 0;
    if (n) parts.push(`${n} celda${n === 1 ? '' : 's'} editada${n === 1 ? '' : 's'}`);
    return parts.join(' · ') || 'Sin cambios';
  }
}
