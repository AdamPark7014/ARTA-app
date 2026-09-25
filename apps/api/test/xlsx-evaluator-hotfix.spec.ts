import * as XLSX from 'xlsx';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require('fast-formula-parser') as any;

function toNum(text: unknown): number {
  const s = String(text ?? '')
    .replace(/\s/g, '')
    .replace(/[\$£€¥%]/g, '')
    .replace(/,/g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const SPANISH_MAP: Record<string, string> = {
  SUMA: 'SUM',
  PROMEDIO: 'AVERAGE',
  MIN: 'MIN',
  MAX: 'MAX',
  SI: 'IF',
  REDONDEAR: 'ROUND',
};

describe('Hotfix evaluator parity with cached Excel values', () => {
  const templatesDir = `${__dirname}/../assets/format-sources`;
  const files = ['CORRIDA_BASE.xlsx', 'CAMPANA_BASE.xlsx'];

  for (const f of files) {
    it(`${f}: every formula matches cached result (±0.01)`, () => {
      const wb = XLSX.readFile(`${templatesDir}/${f}`, { cellFormula: true });
      // build a fast lookup for named ranges (if any)
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

      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
        const grid = rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
        const parser = new Parser();
        let mismatches: Array<{ addr: string; expected: number; got: number; formula: string }> = [];
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < (rows[r]?.length || 0); c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const obj = ws[addr] as any;
            const formula = String(obj?.f || '');
            if (!formula) continue;
            const cached = Number(obj?.v);
            if (!Number.isFinite(cached)) continue;
            parser.position = { sheet: name, row: r + 1, col: c + 1 };
            parser.onCell = (ref: any) => {
              const s = ref.sheet || name;
              const rr = ref.row - 1;
              const cc = ref.col - 1;
              const cell = (wb.Sheets[s] as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
              if (cell?.f) return Number(cell.v) || 0;
              const v = s === name ? grid[rr]?.[cc] ?? '' : (cell?.w ?? cell?.v ?? '');
              const n = toNum(v);
              return Number.isFinite(n) ? n : 0;
            };
            parser.onRange = (ref: any) => {
              const s = ref.sheet || name;
              const out: number[][] = [];
              for (let rr = ref.from.row - 1; rr <= ref.to.row - 1; rr++) {
                const row: number[] = [];
                for (let cc = ref.from.col - 1; cc <= ref.to.col - 1; cc++) {
                  const cell = (wb.Sheets[s] as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
                  if (cell?.f) row.push(Number(cell.v) || 0);
                  else {
                    const v = s === name ? grid[rr]?.[cc] ?? '' : (cell?.w ?? cell?.v ?? '');
                    const n = toNum(v);
                    row.push(Number.isFinite(n) ? n : 0);
                  }
                }
                out.push(row);
              }
              return out;
            };
            // Named ranges / variables
            parser.onVariable = (nameRef: string) => {
              const key = String(nameRef || '').toUpperCase();
              const def = names[key];
              if (!def) return 0;
              if (def.r0 === def.r1 && def.c0 === def.c1) {
                // single cell
                const cell = (wb.Sheets[def.sheet] as any)[XLSX.utils.encode_cell({ r: def.r0, c: def.c0 })];
                return Number(cell?.v) || toNum(cell?.w) || 0;
              }
              // range — return 2D array
              const out: number[][] = [];
              for (let rr = def.r0; rr <= def.r1; rr++) {
                const row: number[] = [];
                for (let cc = def.c0; cc <= def.c1; cc++) {
                  const cell = (wb.Sheets[def.sheet] as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
                  row.push(Number(cell?.v) || toNum(cell?.w) || 0);
                }
                out.push(row);
              }
              return out;
            };
            const norm = formula.replace(/\b([A-ZÁÉÍÓÚÑ]+)\b/g, (m) => SPANISH_MAP[m] || m);
            let got = Number(parser.parse(norm));
            if (!Number.isFinite(got)) got = 0;
            const diff = Math.abs(got - cached);
            if (!(diff <= 0.01)) mismatches.push({ addr, expected: cached, got, formula });
          }
        }
        if (mismatches.length) {
          const details = mismatches
            .slice(0, 30)
            .map((m) => `${f}:${name}:${m.addr} =${m.formula} -> got ${m.got}, expected ${m.expected}`)
            .join('\n');
          throw new Error(`Mismatches (${mismatches.length}):\n${details}`);
        }
        expect(mismatches.length).toBe(0);
      }
    });
  }
});

