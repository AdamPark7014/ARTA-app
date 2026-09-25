import { test, expect } from '@playwright/test';

test('formula evaluator matches cached Excel values across templates', async () => {
  const XLSX = require('xlsx') as typeof import('xlsx');
  const Parser = require('fast-formula-parser') as any;
  const templatesDir = '../../apps/api/assets/format-sources';
  const files = ['CORRIDA_BASE.xlsx', 'CAMPANA_BASE.xlsx'];

  function toNum(text: string) {
    const s = String(text ?? '').replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  for (const f of files) {
    const wb = XLSX.readFile(`${templatesDir}/${f}`, { cellFormula: true });
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
      const grid = rows.map(r => r.map(c => (c == null ? '' : String(c))));
      const parser = new Parser();
      let mismatches = 0;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const obj = ws[addr] as any;
          if (!obj || !obj.f) continue;
          const cached = Number(obj.v);
          if (!Number.isFinite(cached)) continue;
          parser.position = { sheet: name, row: r + 1, col: c + 1 };
          parser.onCell = (ref: any) => {
            const s = ref.sheet || name;
            const rr = ref.row - 1;
            const cc = ref.col - 1;
            const o = (wb.Sheets[s] as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
            if (o?.f) return Number(o.v) || 0;
            const v = s === name ? grid[rr]?.[cc] ?? '' : (o?.w ?? o?.v ?? '');
            const n = toNum(v);
            return Number.isFinite(n) ? n : 0;
          };
          parser.onRange = (ref: any) => {
            const s = ref.sheet || name;
            const out: number[][] = [];
            for (let rr = ref.from.row - 1; rr <= ref.to.row - 1; rr++) {
              const row: number[] = [];
              for (let cc = ref.from.col - 1; cc <= ref.to.col - 1; cc++) {
                const o = (wb.Sheets[s] as any)[XLSX.utils.encode_cell({ r: rr, c: cc })];
                if (o?.f) row.push(Number(o.v) || 0);
                else {
                  const v = s === name ? grid[rr]?.[cc] ?? '' : (o?.w ?? o?.v ?? '');
                  const n = toNum(v);
                  row.push(Number.isFinite(n) ? n : 0);
                }
              }
              out.push(row);
            }
            return out;
          };
          const evaluated = parser.parse(String(obj.f));
          const diff = Math.abs(Number(evaluated) - cached);
          if (!(diff <= 0.005)) mismatches++;
        }
      }
      expect(mismatches, `${f}:${name}`).toBe(0);
    }
  }
});

