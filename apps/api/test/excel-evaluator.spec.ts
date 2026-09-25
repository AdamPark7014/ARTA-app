import { describe, it, expect } from '@jest/globals';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import Excel from 'exceljs';
import FastFormulaParser from 'fast-formula-parser';

function normalizeSpanish(fn: string): string {
  const map: Record<string, string> = {
    SUMA: 'SUM',
    PROMEDIO: 'AVERAGE',
    MIN: 'MIN',
    MAX: 'MAX',
    SI: 'IF',
    REDONDEAR: 'ROUND',
  };
  let out = fn;
  for (const [es, en] of Object.entries(map)) out = out.replace(new RegExp(`\\b${es}\\b`, 'g'), en);
  return out;
}

function toNumber(text: unknown): number {
  if (typeof text === 'number') return Number.isFinite(text) ? text : 0;
  const s = String(text ?? '')
    .replace(/[$\s]/g, '')
    .replace(/,/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function loadWorkbook(fileName: string): Promise<Excel.Workbook> {
  const wb = new Excel.Workbook();
  const file = path.resolve(process.cwd(), '../api/assets/format-sources', fileName);
  const buf = readFileSync(file);
  await wb.xlsx.load(Buffer.from(buf));
  return wb;
}

function buildNamedRangesIndex(wb: Excel.Workbook) {
  const index = new Map<string, Array<{ sheet: string; range: string }>>();
  const names = (wb as any).definedNames?._names as Record<string, any> | undefined;
  if (!names) return index;
  for (const [k, v] of Object.entries(names)) {
    const ranges = Array.isArray(v?.ranges) ? v.ranges : [];
    index.set(k.toUpperCase(), ranges.map((r: any) => ({ sheet: r.sheetName, range: r.range })));
  }
  return index;
}

function evaluateFormula(wb: Excel.Workbook, sheet: Excel.Worksheet, row: number, col: number, formula: string): number {
  const parser = new (FastFormulaParser as any)();
  const named = buildNamedRangesIndex(wb);
  (parser as any).position = { sheet: sheet.name, row, col };
  (parser as any).onCell = (ref: { sheet?: string; row: number; col: number }) => {
    const s = ref.sheet ? String(ref.sheet) : sheet.name;
    const ws = wb.getWorksheet(s);
    if (!ws) return 0;
    const cell = ws.getCell(ref.row, ref.col);
    if (cell.formula) {
      (parser as any).position = { sheet: s, row: ref.row, col: ref.col };
      const inner = (parser as any).parse(normalizeSpanish(String(cell.formula)));
      return typeof inner === 'number' ? inner : Number(inner) || 0;
    }
    return toNumber(cell.value as any);
  };
  (parser as any).onRange = (ref: { sheet?: string; from: { row: number; col: number }; to: { row: number; col: number } }) => {
    const s = ref.sheet ? String(ref.sheet) : sheet.name;
    const ws = wb.getWorksheet(s);
    if (!ws) return [];
    const out: number[][] = [];
    for (let r = ref.from.row; r <= ref.to.row; r += 1) {
      const rowVals: number[] = [];
      for (let c = ref.from.col; c <= ref.to.col; c += 1) {
        const cell = ws.getCell(r, c);
        if (cell.formula) {
          (parser as any).position = { sheet: s, row: r, col: c };
          const inner = (parser as any).parse(normalizeSpanish(String(cell.formula)));
          rowVals.push(typeof inner === 'number' ? inner : Number(inner) || 0);
        } else {
          rowVals.push(toNumber(cell.value as any));
        }
      }
      out.push(rowVals);
    }
    return out;
  };
  // Replace named ranges with their first defined range
  let expr = normalizeSpanish(formula);
  for (const [name, ranges] of named.entries()) {
    if (!ranges.length) continue;
    const one = ranges[0];
    const rep = one.sheet ? `${one.sheet}!${one.range}` : one.range;
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), rep);
  }
  const val = (parser as any).parse(expr);
  return typeof val === 'number' ? val : Number(val) || 0;
}

describe('Excel evaluator parity with cached results (templates)', () => {
  const files = ['CORRIDA_BASE.xlsx', 'CAMPANA_BASE.xlsx', 'ORDEN_DE_COMPRA.xlsx', 'DISTRIBUCION_PENDONES.xlsx'];
  for (const file of files) {
    it(`matches cached results for ${file}`, async () => {
      const wb = await loadWorkbook(file);
      const mismatches: Array<{ sheet: string; addr: string; got: number; want: number; formula: string }> = [];
      wb.eachSheet((ws) => {
        ws.eachRow((row, r) => {
          row.eachCell((cell, c) => {
            const f = (cell as any).formula as string | undefined;
            const cached = (cell as any).result as number | undefined;
            if (!f || cached == null) return;
            const got = evaluateFormula(wb, ws, r, c, f);
            const want = Number(cached);
            if (!(Math.abs(got - want) <= 0.01)) {
              mismatches.push({ sheet: ws.name, addr: ws.getCell(r, c).address, got, want, formula: f });
            }
          });
        });
      });
      if (mismatches.length) {
        const sample = mismatches.slice(0, 10).map((m) => `${m.sheet}!${m.addr} got ${m.got} want ${m.want} ← ${m.formula}`).join('\n');
        throw new Error(`Formula mismatches (${mismatches.length}):\n${sample}`);
      }
      expect(mismatches.length).toBe(0);
    }, 120000);
  }
});

