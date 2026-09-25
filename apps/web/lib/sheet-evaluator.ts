import * as XLSX from 'xlsx';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require('fast-formula-parser') as any;

const SPANISH_MAP: Record<string, string> = {
  SUMA: 'SUM',
  PROMEDIO: 'AVERAGE',
  MIN: 'MIN',
  MAX: 'MAX',
  SI: 'IF',
  REDONDEAR: 'ROUND',
};

export type Grid = string[][];

export function createEvaluator(wb: XLSX.WorkBook, activeSheet: string, grid: Grid) {
  const parser = new Parser();
  // Named ranges
  const names: Record<string, { sheet: string; r0: number; c0: number; r1: number; c1: number } | null> = {};
  const wbNames = (wb.Workbook as any)?.Names as Array<{ Name: string; Ref: string }> | undefined;
  if (Array.isArray(wbNames)) {
    for (const n of wbNames) {
      const m = (n.Ref || '').match(/^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);
      if (m) {
        const sheet = m[1];
        const colToIdx = (s: string) => {
          let x = 0;
          for (const ch of s) x = x * 26 + (ch.charCodeAt(0) - 64);
          return x - 1;
        };
        names[n.Name.toUpperCase()] = {
          sheet,
          r0: Number(m[3]) - 1,
          c0: colToIdx(m[2]),
          r1: m[5] ? Number(m[5]) - 1 : Number(m[3]) - 1,
          c1: m[4] ? colToIdx(m[4]) : colToIdx(m[2]),
        };
      } else {
        names[n.Name.toUpperCase()] = null;
      }
    }
  }
  function toNum(text: unknown): number {
    const s = String(text ?? '')
      .replace(/\s/g, '')
      .replace(/[\$£€¥%]/g, '')
      .replace(/,/g, '')
      .replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  parser.onCell = (ref: any) => {
    const s = ref.sheet || activeSheet;
    const rr = ref.row - 1;
    const cc = ref.col - 1;
    const ws = wb.Sheets[s] as XLSX.WorkSheet;
    const obj = (ws as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
    if (obj?.f) return Number(obj.v) || 0;
    const v = s === activeSheet ? grid[rr]?.[cc] ?? '' : (obj?.w ?? obj?.v ?? '');
    const n = toNum(v);
    return Number.isFinite(n) ? n : 0;
  };
  parser.onRange = (ref: any) => {
    const s = ref.sheet || activeSheet;
    const ws = wb.Sheets[s] as XLSX.WorkSheet;
    const out: number[][] = [];
    for (let rr = ref.from.row - 1; rr <= ref.to.row - 1; rr++) {
      const row: number[] = [];
      for (let cc = ref.from.col - 1; cc <= ref.to.col - 1; cc++) {
        const obj = (ws as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
        if (obj?.f) row.push(Number(obj.v) || 0);
        else {
          const v = s === activeSheet ? grid[rr]?.[cc] ?? '' : (obj?.w ?? obj?.v ?? '');
          const n = toNum(v);
          row.push(Number.isFinite(n) ? n : 0);
        }
      }
      out.push(row);
    }
    return out;
  };
  parser.onVariable = (nameRef: string) => {
    const key = String(nameRef || '').toUpperCase();
    const def = names[key];
    if (!def) return 0;
    const ws = wb.Sheets[def.sheet] as XLSX.WorkSheet;
    if (def.r0 === def.r1 && def.c0 === def.c1) {
      const cell = (ws as any)[XLSX.utils.encode_cell({ r: def.r0, c: def.c0 })];
      return Number(cell?.v) || toNum(cell?.w) || 0;
    }
    const out: number[][] = [];
    for (let rr = def.r0; rr <= def.r1; rr++) {
      const row: number[] = [];
      for (let cc = def.c0; cc <= def.c1; cc++) {
        const cell = (ws as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
        row.push(Number(cell?.v) || toNum(cell?.w) || 0);
      }
      out.push(row);
    }
    return out;
  };
  function normalizeFormulaName(s: string) {
    return s.replace(/\b([A-ZÁÉÍÓÚÑ]+)\b/g, (m) => SPANISH_MAP[m] || m);
  }
  function evaluateFormula(formula: string, row1: number, col1: number): number {
    parser.position = { sheet: activeSheet, row: row1, col: col1 };
    const norm = normalizeFormulaName(String(formula).replace(/^=/, ''));
    const val = parser.parse(norm);
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }
  return { evaluateFormula };
}

