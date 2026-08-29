import * as XLSX from 'xlsx';

/**
 * Plantilla de «GASTOS DE PUBLICIDAD Y CONVENIOS» alineada al formato real
 * de campaña Arta (concepto, cantidades, costos, ARTA, pagado / por pagar).
 */
export type CampaignSheetMeta = {
  eventName: string;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  promoter?: string;
};

const HEADERS = [
  'CONCEPTO',
  'CANTIDAD',
  'COSTO',
  'COSTO TOTAL',
  'CANTIDAD ARTA',
  'COSTO ARTA',
  'COSTO TOTAL ARTA',
  'PAGADO',
  'POR PAGAR',
] as const;

/** Filas vacías de captura (después del encabezado de columnas). */
const EMPTY_DATA_ROWS = 18;

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

/**
 * Construye un .xlsx listo para editar en SheetEditor (modo campaña).
 * Incluye fórmulas de total por renglón (D = B*C, G = E*F) en las filas de datos.
 */
export function buildCampaignExpensesWorkbook(meta: CampaignSheetMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  rows.push(['GASTOS DE PUBLICIDAD Y CONVENIOS']);
  rows.push([]);
  rows.push(['PROMOTOR', meta.promoter || 'ARTA PRODUCCIONES']);
  rows.push(['EVENTO', meta.eventName]);
  rows.push(['FECHA', formatShowDate(meta.startsAt)]);
  rows.push([
    'RECINTO',
    [meta.venue, meta.city].filter(Boolean).join(' · ') || '',
  ]);
  rows.push([]);
  rows.push([...HEADERS]);

  const headerRow = 8; // 1-based Excel row of HEADERS
  const firstData = headerRow + 1;
  const lastData = headerRow + EMPTY_DATA_ROWS;

  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const excelRow = firstData + i;
    rows.push([
      '',
      '',
      '',
      // Fórmulas: se guardan como texto; SheetEditor las escribe al libro al editar
      // o las dejamos en el workbook vía cell.f abajo.
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    void excelRow;
  }

  rows.push([]);
  rows.push([
    'TOTAL',
    '',
    '',
    `=SUM(D${firstData}:D${lastData})`,
    '',
    '',
    `=SUM(G${firstData}:G${lastData})`,
    '',
    '',
  ]);
  rows.push([
    'DIFERENCIA (Total − Total ARTA)',
    '',
    '',
    `=D${lastData + 2}-G${lastData + 2}`,
    '',
    '',
    '',
    '',
    '',
  ]);
  rows.push([]);
  rows.push(['TOTAL CORTESÍAS', '']);
  rows.push(['PLATINO', '']);
  rows.push(['DORADA', '']);
  rows.push(['BLANCA', '']);
  rows.push(['LILA', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Fórmulas de renglón en columnas D y G
  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const excelRow = firstData + i;
    const dAddr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 3 });
    const gAddr = XLSX.utils.encode_cell({ r: excelRow - 1, c: 6 });
    ws[dAddr] = { t: 'n', f: `B${excelRow}*C${excelRow}` };
    ws[gAddr] = { t: 'n', f: `E${excelRow}*F${excelRow}` };
  }

  // Totales
  const totalRow = lastData + 2;
  const diffRow = lastData + 3;
  ws[XLSX.utils.encode_cell({ r: totalRow - 1, c: 3 })] = {
    t: 'n',
    f: `SUM(D${firstData}:D${lastData})`,
  };
  ws[XLSX.utils.encode_cell({ r: totalRow - 1, c: 6 })] = {
    t: 'n',
    f: `SUM(G${firstData}:G${lastData})`,
  };
  ws[XLSX.utils.encode_cell({ r: diffRow - 1, c: 3 })] = {
    t: 'n',
    f: `D${totalRow}-G${totalRow}`,
  };

  ws['!cols'] = [
    { wch: 42 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return wb;
}

export function campaignExpensesFileName(eventName: string) {
  const slug = eventName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `CAMPAÑA-${slug || 'gastos'}.xlsx`;
}

export function workbookToXlsxBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
