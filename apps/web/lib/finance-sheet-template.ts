import * as XLSX from 'xlsx';

/**
 * Libro multi-hoja de corrida financiera (Resumen + Ingresos + Egresos + Notas).
 * Editable en SheetEditor; se puede adjuntar cualquier .xlsx propio.
 */
export type FinanceSheetMeta = {
  eventName: string;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  artist?: string | null;
};

const EMPTY_ROWS = 20;

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

function metaBlock(meta: FinanceSheetMeta): (string | number)[][] {
  return [
    ['EVENTO', meta.eventName],
    ['ARTISTA', meta.artist || ''],
    ['FECHA', formatShowDate(meta.startsAt)],
    ['RECINTO', [meta.venue, meta.city].filter(Boolean).join(' · ') || ''],
    [],
  ];
}

function buildIngresosSheet(meta: FinanceSheetMeta): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['INGRESOS'],
    [],
    ...metaBlock(meta),
    ['CONCEPTO', 'MONTO', 'NOTAS'],
  ];
  for (let i = 0; i < EMPTY_ROWS; i += 1) {
    rows.push(i === 0 ? ['Taquilla', 0, ''] : i === 1 ? ['Patrocinios / convenios', 0, ''] : ['', '', '']);
  }
  const headerExcel = 8; // 1-based row of CONCEPTO/MONTO/NOTAS
  const first = headerExcel + 1;
  const last = headerExcel + EMPTY_ROWS;
  rows.push([]);
  rows.push(['TOTAL INGRESOS', `=SUM(B${first}:B${last})`, '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const totalExcelRow = last + 2;
  ws[XLSX.utils.encode_cell({ r: totalExcelRow - 1, c: 1 })] = {
    t: 'n',
    f: `SUM(B${first}:B${last})`,
  };
  ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 28 }];
  return ws;
}

function buildEgresosSheet(meta: FinanceSheetMeta): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['EGRESOS'],
    [],
    ...metaBlock(meta),
    ['CONCEPTO', 'MONTO', 'NOTAS'],
  ];
  const starters = ['Producción', 'Hospitality', 'Marketing', 'Transporte'];
  for (let i = 0; i < EMPTY_ROWS; i += 1) {
    rows.push(starters[i] ? [starters[i], 0, ''] : ['', '', '']);
  }
  const headerExcel = 8;
  const first = headerExcel + 1;
  const last = headerExcel + EMPTY_ROWS;
  rows.push([]);
  rows.push(['TOTAL EGRESOS', `=SUM(B${first}:B${last})`, '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const totalExcelRow = last + 2;
  ws[XLSX.utils.encode_cell({ r: totalExcelRow - 1, c: 1 })] = {
    t: 'n',
    f: `SUM(B${first}:B${last})`,
  };
  ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 28 }];
  return ws;
}

function buildResumenSheet(meta: FinanceSheetMeta): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['CORRIDA FINANCIERA — RESUMEN'],
    [],
    ...metaBlock(meta),
    ['Concepto', 'Monto'],
    ['Total ingresos (hoja Ingresos)', "='Ingresos'!B30"],
    ['Total egresos (hoja Egresos)', "='Egresos'!B30"],
    ['NETO', '=B8-B9'],
    [],
    ['Instrucciones'],
    ['1. Completa la hoja Ingresos y la hoja Egresos (o pega tu formato).'],
    ['2. Agrega más hojas con «+ Hoja» si tu corrida tiene más rubros.'],
    ['3. Guarda el libro aquí o descárgalo para Excel de escritorio.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws[XLSX.utils.encode_cell({ r: 7, c: 1 })] = { t: 'n', f: "'Ingresos'!B30" };
  ws[XLSX.utils.encode_cell({ r: 8, c: 1 })] = { t: 'n', f: "'Egresos'!B30" };
  ws[XLSX.utils.encode_cell({ r: 9, c: 1 })] = { t: 'n', f: 'B8-B9' };
  ws['!cols'] = [{ wch: 42 }, { wch: 18 }];
  return ws;
}

function buildNotasSheet(): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['NOTAS DE LA CORRIDA'],
    [],
    ['Fecha', 'Autor', 'Nota'],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 48 }];
  return ws;
}

export function buildFinanceCorridaWorkbook(meta: FinanceSheetMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildResumenSheet(meta), 'Resumen');
  XLSX.utils.book_append_sheet(wb, buildIngresosSheet(meta), 'Ingresos');
  XLSX.utils.book_append_sheet(wb, buildEgresosSheet(meta), 'Egresos');
  XLSX.utils.book_append_sheet(wb, buildNotasSheet(), 'Notas');
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
