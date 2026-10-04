import { readFileSync } from 'fs';
import { join } from 'path';
import {
  numberToCol,
  colToNumber,
  sheetOpProblem,
  shiftCellRef,
  shiftFormula,
  shiftIndex,
  shiftRangeRef,
  shiftSpan,
  shiftSqref,
  translateFormula,
  type SheetOp,
} from './sheet-ops';

const ins = (at: number, count = 1, kind: SheetOp['kind'] = 'insertRows'): SheetOp => ({ sheet: 'Hoja1', kind, at, count });
const del = (at: number, count = 1, kind: SheetOp['kind'] = 'deleteRows'): SheetOp => ({ sheet: 'Hoja1', kind, at, count });
const at = (row: number, col: number, sheet = 'Hoja1') => ({ sheet, row, col });

describe('sheet-ops', () => {
  it('es idéntico en el API y en el panel', () => {
    const api = readFileSync(join(__dirname, 'sheet-ops.ts'), 'utf8').replace(/\r\n/g, '\n');
    const web = readFileSync(join(__dirname, '../../../web/lib/sheet-ops.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(web).toBe(api);
  });

  it('columnas en letras', () => {
    expect(colToNumber('A')).toBe(1);
    expect(colToNumber('z')).toBe(26);
    expect(colToNumber('AA')).toBe(27);
    expect(numberToCol(1)).toBe('A');
    expect(numberToCol(28)).toBe('AB');
    expect(numberToCol(16384)).toBe('XFD');
  });

  it('recorre índices al insertar y elimina al borrar', () => {
    expect(shiftIndex(4, ins(5))).toBe(4);
    expect(shiftIndex(5, ins(5, 2))).toBe(7);
    expect(shiftIndex(5, del(5, 2))).toBeNull();
    expect(shiftIndex(6, del(5, 2))).toBeNull();
    expect(shiftIndex(7, del(5, 2))).toBe(5);
  });

  it('un tramo crece si se inserta dentro, se encoge o desaparece al borrar', () => {
    expect(shiftSpan(3, 10, ins(5))).toEqual([3, 11]);
    expect(shiftSpan(5, 10, ins(5))).toEqual([6, 11]);
    expect(shiftSpan(3, 4, ins(5))).toEqual([3, 4]);
    expect(shiftSpan(3, 10, del(5, 2))).toEqual([3, 8]);
    expect(shiftSpan(5, 10, del(5, 2))).toEqual([5, 8]);
    expect(shiftSpan(3, 6, del(5, 2))).toEqual([3, 4]);
    expect(shiftSpan(5, 6, del(5, 2))).toBeNull();
  });

  it('celdas y rangos (combinadas, formato condicional)', () => {
    expect(shiftCellRef('B5', ins(5))).toBe('B6');
    expect(shiftCellRef('B5', del(5))).toBeNull();
    expect(shiftCellRef('C2', ins(2, 1, 'insertCols'))).toBe('D2');
    expect(shiftRangeRef('A32:B32', ins(30, 2))).toBe('A34:B34');
    expect(shiftRangeRef('A1:E5', ins(3))).toBe('A1:E6');
    expect(shiftRangeRef('A1:E5', del(1, 5))).toBeNull();
    expect(shiftRangeRef('A1:E5', del(2, 1, 'deleteCols'))).toBe('A1:D5');
    expect(shiftSqref('A1:A5 C3', del(3))).toBe('A1:A4');
  });

  it('fórmulas: recorre referencias de la hoja y respeta textos y otras hojas', () => {
    expect(shiftFormula('B9*C9', ins(5), at(9, 4))).toBe('B10*C10');
    expect(shiftFormula('$B$9+B4', ins(5), at(9, 4))).toBe('$B$10+B4');
    expect(shiftFormula('SUM(D5:D20)', ins(10, 3), at(25, 4))).toBe('SUM(D5:D23)');
    expect(shiftFormula('"B9 "&B9', ins(5), at(1, 1))).toBe('"B9 "&B10');
    expect(shiftFormula('Otra!B9+B9', ins(5), at(1, 1))).toBe('Otra!B9+B10');
    expect(shiftFormula("'Hoja1'!B9", ins(5), at(1, 1, 'Otra'))).toBe("'Hoja1'!B10");
    expect(shiftFormula('Hoja1!B9+B9', ins(5), at(1, 1, 'Otra'))).toBe('Hoja1!B10+B9');
    expect(shiftFormula('LOG10(A1)+SUM(A:A)', ins(1, 1, 'insertCols'), at(1, 3))).toBe('LOG10(B1)+SUM(B:B)');
    expect(shiftFormula('SUM(3:5)', del(4), at(1, 1))).toBe('SUM(3:4)');
  });

  it('fórmulas: lo eliminado queda #REF!', () => {
    expect(shiftFormula('B5*2', del(5), at(9, 1))).toBe('#REF!*2');
    expect(shiftFormula('SUM(B5:B6)+1', del(5, 2), at(9, 1))).toBe('SUM(#REF!)+1');
    expect(shiftFormula('SUM(B5:B9)', del(5, 2), at(12, 2))).toBe('SUM(B5:B7)');
  });

  it('un concepto nuevo arriba del TOTAL entra en la suma', () => {
    // TOTAL en D32 = SUM(D10:D31); se inserta una fila en la 32 (arriba del total).
    expect(shiftFormula('SUM(D10:D31)', ins(32), at(32, 4))).toBe('SUM(D10:D32)');
    // Insertar más abajo del total no lo toca; insertar en otra columna tampoco lo hace crecer.
    expect(shiftFormula('SUM(D10:D31)', ins(40), at(32, 4))).toBe('SUM(D10:D31)');
    expect(shiftFormula('SUM(D10:D31)', ins(32), at(32, 7))).toBe('SUM(D10:D31)');
    // Columna nueva justo antes de la de totales.
    expect(shiftFormula('SUM(B4:E4)', ins(6, 1, 'insertCols'), at(4, 6))).toBe('SUM(B4:F4)');
    // Concepto nuevo antes del primero: entra también (Excel lo dejaría fuera).
    expect(shiftFormula('SUM(D10:D31)', ins(10), at(32, 4))).toBe('SUM(D10:D32)');
    // …pero una fórmula de arriba (no es un total) sigue la regla de Excel.
    expect(shiftFormula('SUM(D10:D31)', ins(10), at(5, 4))).toBe('SUM(D11:D32)');
  });

  it('copiar y pegar mueve lo relativo y deja lo absoluto', () => {
    expect(translateFormula('B9*C9', 1, 0)).toBe('B10*C10');
    expect(translateFormula('$B$9*C$9', 2, 1)).toBe('$B$9*D$9');
    expect(translateFormula('SUM(D5:D20)', 0, 1)).toBe('SUM(E5:E20)');
    expect(translateFormula('A1', -1, 0)).toBe('#REF!');
  });

  it('valida lo que llega del panel', () => {
    expect(sheetOpProblem(ins(3))).toBeNull();
    expect(sheetOpProblem({ ...ins(3), at: 0 })).toBeTruthy();
    expect(sheetOpProblem({ ...ins(3), count: 100000 })).toBeTruthy();
    expect(sheetOpProblem({ ...ins(3), kind: 'moveRows' })).toBeTruthy();
    expect(sheetOpProblem(null)).toBeTruthy();
  });
});
