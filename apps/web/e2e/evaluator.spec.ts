import { test, expect } from '@playwright/test';
import { createEvaluator } from '@/lib/sheet-evaluator';

test('formula evaluator matches cached Excel values across templates', async () => {
  const XLSX = require('xlsx') as typeof import('xlsx');
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
      const evalr = createEvaluator(wb, name, grid as any);
      let mismatches = 0;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const obj = ws[addr] as any;
          if (!obj || !obj.f) continue;
          const cached = Number(obj.v);
          if (!Number.isFinite(cached)) continue;
          const evaluated = evalr.evaluateFormula(String(obj.f), r + 1, c + 1);
          const diff = Math.abs(Number(evaluated) - cached);
          if (!(diff <= 0.005)) mismatches++;
        }
      }
      expect(mismatches, `${f}:${name}`).toBe(0);
    }
  }
});

