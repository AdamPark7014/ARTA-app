import * as XLSX from 'xlsx';
import FastFormulaParser from 'fast-formula-parser';

type Grid = string[][];

/** Map Spanish function names to English equivalents understood by fast-formula-parser. */
function normalizeFnNames(expr: string): string {
  const map: Record<string, string> = {
    SUMA: 'SUM',
    PROMEDIO: 'AVERAGE',
    MIN: 'MIN',
    MAX: 'MAX',
    SI: 'IF',
    REDONDEAR: 'ROUND',
    'SUMAR.SI': 'SUMIF',
    'CONTAR.SI': 'COUNTIF',
    CONTAR: 'COUNT',
  };
  let out = expr;
  for (const [es, en] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\b${es}\\b`, 'g'), en);
  }
  return out;
}

function toCellNumber(text: string): { v: number; ok: boolean } {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { v: 0, ok: false };
  if (trimmed.startsWith('=')) return { v: 0, ok: false };
  // Normalize currency and thousands/decimal separators common in es-MX
  let s = trimmed.replace(/[\s\u00A0]/g, '').replace(/[\$£€¥%]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/,/g, '');
  else if (hasComma && !hasDot) s = s.replace(/,/g, '.');
  s = s.replace(/^\((.*)\)$/, '-$1');
  s = s.replace(/(?<=\d)[,](?=\d{3}\b)/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? { v: n, ok: true } : { v: 0, ok: false };
}

function buildNamedMap(wb: XLSX.WorkBook): Map<string, string> {
  const namesArr =
    (((wb as unknown as { Workbook?: { Names?: Array<{ Name: string; Ref: string }> } }).Workbook?.Names ||
      []) as Array<{ Name: string; Ref: string }>) || [];
  const namedMap = new Map<string, string>();
  for (const n of namesArr) {
    if (n?.Name && n?.Ref) namedMap.set(n.Name.toUpperCase(), n.Ref);
  }
  return namedMap;
}

function replaceNamed(expr: string, names: Map<string, string>): string {
  let out = expr;
  for (const [k, ref] of names.entries()) {
    out = out.replace(new RegExp(`\\b${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'g'), ref);
  }
  return out;
}

/** Build the display grid for a given sheet using a fast MIT evaluator. */
export function buildDisplayGrid(workbook: XLSX.WorkBook, sheetName: string, grid: Grid): Grid {
  const ws = workbook.Sheets[sheetName];
  const parser = new (FastFormulaParser as any)();
  const names = buildNamedMap(workbook);
  const out: Grid = [];

  for (let r = 0; r < grid.length; r += 1) {
    const row: string[] = [];
    for (let c = 0; c < (grid[r]?.length || 0); c += 1) {
      const raw = grid[r]?.[c] ?? '';
      if (typeof raw === 'string' && raw.trim().startsWith('=')) {
        try {
          (parser as any).position = { sheet: sheetName, row: r + 1, col: c + 1 };
          (parser as any).onCell = (ref: { sheet?: string; row: number; col: number }) => {
            const s = ref.sheet ?? sheetName;
            const rr = ref.row - 1;
            const cc = ref.col - 1;
            if (s === sheetName) {
              const v = grid[rr]?.[cc] ?? '';
              if (typeof v === 'string' && v.trim().startsWith('=')) {
                (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(v).slice(1)), names));
                return typeof inner === 'number' ? inner : Number(inner) || 0;
              }
              const { v: num, ok } = toCellNumber(String(v));
              return ok ? num : Number(v) || 0;
            }
            // Other sheet: prefer Excel cached .v; if absent try evaluating its formula.
            const addr = XLSX.utils.encode_cell({ r: rr, c: cc });
            const obj = (workbook.Sheets[s] as XLSX.WorkSheet)?.[addr] as XLSX.CellObject | undefined;
            const cached = Number((obj as any)?.v);
            if (Number.isFinite(cached)) return cached;
            if (obj?.f) {
              try {
                (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(obj.f)), names));
                return typeof inner === 'number' ? inner : Number(inner) || 0;
              } catch {
                /* ignore */
              }
            }
            return 0;
          };
          (parser as any).onRange = (ref: { sheet?: string; from: { row: number; col: number }; to: { row: number; col: number } }) => {
            const s = ref.sheet ?? sheetName;
            const arr: number[][] = [];
            for (let rr = ref.from.row - 1; rr <= ref.to.row - 1; rr += 1) {
              const arow: number[] = [];
              for (let cc = ref.from.col - 1; cc <= ref.to.col - 1; cc += 1) {
                if (s === sheetName) {
                  const v = grid[rr]?.[cc] ?? '';
                  if (typeof v === 'string' && v.trim().startsWith('=')) {
                    (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                    const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(v).slice(1)), names));
                    arow.push(typeof inner === 'number' ? inner : Number(inner) || 0);
                  } else {
                    const { v: num, ok } = toCellNumber(String(v));
                    arow.push(ok ? num : Number(v) || 0);
                  }
                } else {
                  const addr = XLSX.utils.encode_cell({ r: rr, c: cc });
                  const obj = (workbook.Sheets[s] as XLSX.WorkSheet)?.[addr] as XLSX.CellObject | undefined;
                  const cached = Number((obj as any)?.v);
                  if (Number.isFinite(cached)) arow.push(cached);
                  else if (obj?.f) {
                    try {
                      (parser as any).position = { sheet: s, row: rr + 1, col: cc + 1 };
                      const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(obj.f)), names));
                      arow.push(typeof inner === 'number' ? inner : Number(inner) || 0);
                    } catch {
                      arow.push(0);
                    }
                  } else {
                    arow.push(0);
                  }
                }
              }
              arr.push(arow);
            }
            return arr;
          };
          const evaluated = (parser as any).parse(
            replaceNamed(normalizeFnNames(String(raw).replace(/^=/, '')), names),
          );
          const addr = XLSX.utils.encode_cell({ r, c });
          const obj = ws?.[addr] as XLSX.CellObject | undefined;
          if (typeof evaluated === 'number') {
            const fmt = (FastFormulaParser as any).SSF?.format;
            const z = (obj as any)?.z ?? undefined;
            if (fmt && z) row.push(fmt(z, evaluated));
            else {
              const hasDecimals = Math.abs(evaluated % 1) > 1e-6;
              row.push(
                evaluated.toLocaleString('es-MX', {
                  minimumFractionDigits: hasDecimals ? 2 : 0,
                  maximumFractionDigits: hasDecimals ? 6 : 0,
                }),
              );
            }
          } else if (typeof evaluated === 'string') {
            row.push(evaluated);
          } else {
            row.push(String(evaluated ?? ''));
          }
          } catch {
            // Fallback 1: lightweight evaluator by substitution for simple references and arithmetic
            try {
              const addr = XLSX.utils.encode_cell({ r, c });
              const obj = ws?.[addr] as XLSX.CellObject | undefined;
              const f = typeof obj?.f === 'string' ? String(obj!.f) : String(raw).replace(/^=/, '');
              if (f) {
                // Replace single-cell refs with numeric values from current grid/workbook
                const expr = f
                  .replace(/\$?[A-Z]+\$?\d+/g, (m) => {
                    const maddr = XLSX.utils.decode_cell(m.replace(/\$/g, ''));
                    const vraw = grid[maddr.r]?.[maddr.c] ?? '';
                    if (typeof vraw === 'string' && vraw.startsWith('=')) {
                      try {
                        (parser as any).position = { sheet: sheetName, row: maddr.r + 1, col: maddr.c + 1 };
                        const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(vraw).slice(1)), names));
                        const num = typeof inner === 'number' ? inner : Number(inner) || 0;
                        return String(Number.isFinite(num) ? num : 0);
                      } catch {
                        // fallback to workbook cached value
                        const o = (workbook.Sheets[sheetName] as XLSX.WorkSheet)?.[
                          XLSX.utils.encode_cell({ r: maddr.r, c: maddr.c })
                        ] as XLSX.CellObject | undefined;
                        const num = Number(o?.v);
                        return String(Number.isFinite(num) ? num : 0);
                      }
                    }
                    const { v: nv, ok } = toCellNumber(String(vraw));
                    return String(ok ? nv : Number(vraw) || 0);
                  })
                  .replace(/\^/g, '**');
                // eslint-disable-next-line no-new-func
                const val = Function('"use strict";return (' + expr + ')')();
                if (typeof val === 'number' && Number.isFinite(val)) {
                  const hasDecimals = Math.abs(val % 1) > 1e-6;
                  row.push(
                    val.toLocaleString('es-MX', {
                      minimumFractionDigits: hasDecimals ? 2 : 0,
                      maximumFractionDigits: hasDecimals ? 6 : 0,
                    }),
                  );
                  continue;
                }
                // Fallback 2: SUM/SUMA with args/ranges
                const ftxt = f.trim().toUpperCase();
                const m = ftxt.match(/^\\s*(SUM|SUMA)\\(([^)]+)\\)\\s*$/);
                if (m) {
                  const args = m[2].split(/[;,]/).map((s) => s.trim());
                  let total = 0;
                  const addCell = (rr: number, cc: number) => {
                    const vraw = grid[rr]?.[cc] ?? '';
                    if (typeof vraw === 'string' && vraw.startsWith('=')) {
                      try {
                        (parser as any).position = { sheet: sheetName, row: rr + 1, col: cc + 1 };
                        const inner = (parser as any).parse(replaceNamed(normalizeFnNames(String(vraw).slice(1)), names));
                        total += typeof inner === 'number' ? inner : Number(inner) || 0;
                      } catch {
                        const o = (workbook.Sheets[sheetName] as XLSX.WorkSheet)?.[
                          XLSX.utils.encode_cell({ r: rr, c: cc })
                        ] as XLSX.CellObject | undefined;
                        total += Number(o?.v) || 0;
                      }
                    } else {
                      const { v: nv, ok } = toCellNumber(String(vraw));
                      total += ok ? nv : Number(vraw) || 0;
                    }
                  };
                  for (const a of args) {
                    const rng = a.match(/^([A-Z]+\\d+):([A-Z]+\\d+)$/);
                    if (rng) {
                      const s = XLSX.utils.decode_cell(rng[1]);
                      const e = XLSX.utils.decode_cell(rng[2]);
                      for (let rr = Math.min(s.r, e.r); rr <= Math.max(s.r, e.r); rr += 1) {
                        for (let cc = Math.min(s.c, e.c); cc <= Math.max(s.c, e.c); cc += 1) addCell(rr, cc);
                      }
                    } else {
                      const one = a.match(/^([A-Z]+\\d+)$/);
                      if (one) {
                        const p = XLSX.utils.decode_cell(one[1]);
                        addCell(p.r, p.c);
                      } else {
                        total += Number(a) || 0;
                      }
                    }
                  }
                  const hasDecimals = Math.abs(total % 1) > 1e-6;
                  row.push(
                    total.toLocaleString('es-MX', {
                      minimumFractionDigits: hasDecimals ? 2 : 0,
                      maximumFractionDigits: hasDecimals ? 6 : 0,
                    }),
                  );
                  continue;
                }
              }
            } catch {
              /* ignore and continue to cache */
            }
            // Fallback 3: Excel cached display or raw
            const addr = XLSX.utils.encode_cell({ r, c });
            const obj = ws?.[addr] as XLSX.CellObject | undefined;
            const cache = obj?.w != null ? String(obj.w) : obj?.v != null ? String(obj.v) : '';
            row.push(cache || '');
        }
      } else {
        const addr = XLSX.utils.encode_cell({ r, c });
        const obj = ws?.[addr] as XLSX.CellObject | undefined;
        const txt = raw !== '' && raw != null ? String(raw) : obj?.w != null ? String(obj.w) : '';
        row.push(txt);
      }
    }
    out.push(row);
  }
  return out;
}

