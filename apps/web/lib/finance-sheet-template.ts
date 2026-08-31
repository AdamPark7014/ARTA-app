import * as XLSX from 'xlsx';

/**
 * Plantilla de corrida financiera editable (ingresos / egresos / neto).
 * Misma filosofía que campaña: el Excel es la fuente de verdad embebida.
 */
export type FinanceSheetMeta = {
  eventName: string;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  artist?: string | null;
};

const HEADERS = ['CONCEPTO', 'TIPO', 'MONTO', 'NOTAS'] as const;
const EMPTY_DATA_ROWS = 24;

function formatShowDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** Seed rows vacías + un par de ejemplos tipados (tipo = Ingreso | Egreso). */
export function buildFinanceCorridaWorkbook(meta: FinanceSheetMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  rows.push(['CORRIDA FINANCIERA']);
  rows.push([]);
  rows.push(['EVENTO', meta.eventName]);
  rows.push(['ARTISTA', meta.artist || '']);
  rows.push(['FECHA', formatShowDate(meta.startsAt)]);
  rows.push(['RECINTO', [meta.venue, meta.city].filter(Boolean).join(' · ') || '']);
  rows.push([]);
  rows.push([...HEADERS]);

  const headerRow = 8;
  const firstData = headerRow + 1;
  const lastData = headerRow + EMPTY_DATA_ROWS;

  // Primeras filas con guía (montos en 0 — el dueño pega su formato real o edita).
  const starter: Array<[string, string]> = [
    ['Taquilla', 'Ingreso'],
    ['Patrocinios / convenios', 'Ingreso'],
    ['Producción', 'Egreso'],
    ['Hospitality', 'Egreso'],
  ];
  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const guide = starter[i];
    rows.push(guide ? [guide[0], guide[1], 0, ''] : ['', '', '', '']);
  }

  rows.push([]);
  const totalRow = lastData + 2;
  rows.push(['TOTAL INGRESOS', '', `=SUMIF(B${firstData}:B${lastData},"Ingreso",C${firstData}:C${lastData})`, '']);
  rows.push(['TOTAL EGRESOS', '', `=SUMIF(B${firstData}:B${lastData},"Egreso",C${firstData}:C${lastData})`, '']);
  rows.push(['NETO', '', `=C${totalRow}-C${totalRow + 1}`, '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws[XLSX.utils.encode_cell({ r: totalRow - 1, c: 2 })] = {
    t: 'n',
    f: `SUMIF(B${firstData}:B${lastData},"Ingreso",C${firstData}:C${lastData})`,
  };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 2 })] = {
    t: 'n',
    f: `SUMIF(B${firstData}:B${lastData},"Egreso",C${firstData}:C${lastData})`,
  };
  ws[XLSX.utils.encode_cell({ r: totalRow + 1, c: 2 })] = {
    t: 'n',
    f: `C${totalRow}-C${totalRow + 1}`,
  };

  ws['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 28 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  return wb;
}

export function financeCorridaFileName(eventName: string) {
  const slug = eventName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `CORRIDA-${slug || 'financiera'}.xlsx`;
}

export function workbookToXlsxBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
