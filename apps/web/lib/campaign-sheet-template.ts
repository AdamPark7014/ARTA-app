import * as XLSX from 'xlsx';

/**
 * Plantilla «GASTOS DE PUBLICIDAD Y CONVENIOS» — mismo formato que el PDF
 * operativo de Arta (p. ej. PROPUESTA CAMPAÑA):
 *
 *   CONCEPTO | CANTIDAD | COSTO | COSTO TOTAL
 *
 * - Rubros pagados: CANTIDAD numérica, COSTO unitario, COSTO TOTAL = B×C.
 * - Convenios / medios: CANTIDAD = descripción del acuerdo, COSTO = cortesías
 *   (texto tipo «4 DORADA, 4 BLANCA Y 4 LILA»), COSTO TOTAL vacío.
 *
 * Interacción alineada a corrida financiera: se crea desde el evento, se edita
 * embebido en SheetEditor y se descarga como .xlsx vivo.
 *
 * Catálogo precio interno / externo: ver `CAMPAIGN_CONCEPT_CATALOG` — cuando
 * Arta comparta la lista con precios, se rellenan COSTO (y opcionalmente se
 * elige columna según tipo de campaña INTERNAL/EXTERNAL).
 */
import {
  CAMPAIGN_CONCEPT_CATALOG,
  type CampaignConceptPrice,
  type CampaignSheetMeta,
  convenioZones,
  resolveConceptUnitCost,
} from './campaign-concepts';
import type { CampaignConceptRow, ConvenioRow } from '@/components/events/event-detail.types';


const HEADERS = ['CONCEPTO', 'CANTIDAD', 'COSTO', 'COSTO TOTAL'] as const;

/** Filas vacías extra debajo del catálogo para conceptos ad hoc. */
const EXTRA_EMPTY_ROWS = 6;

function formatShowDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).toUpperCase();
  } catch {
    return iso;
  }
}

function formatShowTime(iso?: string | null) {
  if (!iso) return '';
  try {
    const t = new Date(iso).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${t} HRS`;
  } catch {
    return '';
  }
}


export type BuildCampaignWorkbookOptions = {
  /** INTERNAL | EXTERNAL — selecciona precio del catálogo cuando exista. */
  campaignType?: string | null;
  /** Override del catálogo (tests / automatización futura). */
  catalog?: CampaignConceptPrice[];
};

/**
 * Construye un .xlsx listo para editar en SheetEditor (modo campaña),
 * espejo del PDF «GASTOS DE PUBLICIDAD Y CONVENIOS».
 */
export function buildCampaignExpensesWorkbook(
  meta: CampaignSheetMeta,
  options: BuildCampaignWorkbookOptions = {},
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const catalog = options.catalog ?? CAMPAIGN_CONCEPT_CATALOG;
  const rows: (string | number)[][] = [];

  // Encabezado — dos columnas como el PDF (PROMOTOR|EVENTO, FECHA|VENUE, HORARIO|CIUDAD)
  rows.push(['GASTOS DE PUBLICIDAD Y CONVENIOS']);
  rows.push([]);
  rows.push([
    'PROMOTOR',
    meta.promoter || 'ARTA PRODUCCIONES',
    'EVENTO',
    meta.eventName,
  ]);
  rows.push([
    'FECHA',
    formatShowDate(meta.startsAt),
    'VENUE',
    meta.venue || '',
  ]);
  rows.push([
    'HORARIO',
    formatShowTime(meta.startsAt),
    'CIUDAD',
    meta.city || '',
  ]);
  rows.push([]);
  rows.push([...HEADERS]);

  const headerRow = 7; // 1-based Excel row of HEADERS
  const firstData = headerRow + 1;
  const dataStartIndex = rows.length; // 0-based index where first data row will land

  for (const item of catalog) {
    const unit = resolveConceptUnitCost(item, options.campaignType);
    if (item.convenio) {
      rows.push([item.concept, item.description || '', '', '']);
    } else {
      rows.push([item.concept, '', unit === '' ? '' : unit, '']);
    }
  }

  for (let i = 0; i < EXTRA_EMPTY_ROWS; i += 1) {
    rows.push(['', '', '', '']);
  }

  const lastData = headerRow + catalog.length + EXTRA_EMPTY_ROWS;
  const totalLabelRow = lastData + 2;

  rows.push([]);
  rows.push(['TOTAL', '', '', `=SUM(D${firstData}:D${lastData})`]);
  rows.push(['TOTAL CORTESIAS', '', '', '']);
  rows.push(['PLATINO', '', '', '']);
  rows.push(['DORADA', '', '', '']);
  rows.push(['BLANCA', '', '', '']);
  rows.push(['LILA', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Fórmulas D = B*C solo en rubros pagados (no convenios ni filas vacías)
  for (let i = 0; i < catalog.length; i += 1) {
    const item = catalog[i];
    if (item.convenio) continue;
    const excelRow = firstData + i;
    const dAddr = XLSX.utils.encode_cell({ r: dataStartIndex + i, c: 3 });
    ws[dAddr] = { t: 'n', f: `B${excelRow}*C${excelRow}` };
  }

  // Extra empty rows also get formulas so ad-hoc concepts calculate
  for (let i = 0; i < EXTRA_EMPTY_ROWS; i += 1) {
    const excelRow = firstData + catalog.length + i;
    const dAddr = XLSX.utils.encode_cell({
      r: dataStartIndex + catalog.length + i,
      c: 3,
    });
    ws[dAddr] = { t: 'n', f: `B${excelRow}*C${excelRow}` };
  }

  ws[XLSX.utils.encode_cell({ r: totalLabelRow - 1, c: 3 })] = {
    t: 'n',
    f: `SUM(D${firstData}:D${lastData})`,
  };

  ws['!cols'] = [
    { wch: 42 },
    { wch: 56 },
    { wch: 28 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');

  // Catálogo de precios (interno / externo) — hoja de referencia para automatizar
  const precioRows: (string | number)[][] = [
    ['CATÁLOGO DE CONCEPTOS — PRECIO INTERNO / EXTERNO'],
    [],
    [
      'Cuando Arta comparta la lista con precios, completar estas columnas.',
      'Al crear una hoja nueva, COSTO se toma de INTERNO o EXTERNO según el tipo de campaña.',
    ],
    [],
    ['CONCEPTO', 'CONVENIO', 'PRECIO INTERNO', 'PRECIO EXTERNO', 'DESCRIPCIÓN (convenios)'],
  ];
  for (const item of catalog) {
    precioRows.push([
      item.concept,
      item.convenio ? 'SÍ' : '',
      item.precioInterno ?? '',
      item.precioExterno ?? '',
      item.description || '',
    ]);
  }
  const precios = XLSX.utils.aoa_to_sheet(precioRows);
  precios['!cols'] = [
    { wch: 42 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
    { wch: 56 },
  ];
  XLSX.utils.book_append_sheet(wb, precios, 'Precios');

  const notas = XLSX.utils.aoa_to_sheet([
    ['NOTAS DE CAMPAÑA'],
    [],
    ['Fecha', 'Autor', 'Nota'],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
    [],
    ['Formato PDF de referencia'],
    [
      'CONCEPTO | CANTIDAD (número o descripción de convenio) | COSTO (unitario o texto de cortesías) | COSTO TOTAL',
    ],
    ['Al pie: TOTAL monetario, TOTAL CORTESIAS y desglose PLATINO / DORADA / BLANCA / LILA.'],
  ]);
  notas['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(wb, notas, 'Notas');

  return wb;
}

export function workbookToXlsxBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ── Junta 11-09-2026: el archivo de la campaña sale de la tabla del evento ─ */

export type CampaignWorkbookMeta = CampaignSheetMeta & {
  endsAt?: string | null;
  schedule?: string | null;
};

function dateRange(startsAt?: string | null, endsAt?: string | null) {
  const start = formatShowDate(startsAt);
  if (!endsAt) return start;
  const a = new Date(startsAt || '');
  const b = new Date(endsAt);
  if (Number.isNaN(b.getTime()) || a.toDateString() === b.toDateString()) return start;
  return `${start} AL ${formatShowDate(endsAt)}`;
}

function sheetHeader(title: string, meta: CampaignWorkbookMeta): (string | number)[][] {
  return [
    [title],
    [],
    ['PROMOTOR', meta.promoter || 'ARTA PRODUCCIONES', 'EVENTO', meta.eventName],
    ['FECHA', dateRange(meta.startsAt, meta.endsAt), 'VENUE', meta.venue || ''],
    ['HORARIO', meta.schedule || formatShowTime(meta.startsAt), 'CIUDAD', meta.city || ''],
    [],
  ];
}

/** Una hoja con el formato de siempre, con el precio interno o el externo. */
function conceptSheet(
  title: string,
  meta: CampaignWorkbookMeta,
  rows: CampaignConceptRow[],
  kind: 'interno' | 'externo',
): XLSX.WorkSheet {
  const aoa = sheetHeader(title, meta);
  aoa.push([...HEADERS, 'DESDE', 'HASTA']);
  const firstData = aoa.length + 1;
  for (const r of rows) {
    const price = kind === 'interno' ? r.precioInterno : r.precioExterno;
    aoa.push([r.concept, Number(r.qty ?? 1), price ?? '', '', r.from || '', r.to || '']);
  }
  const lastData = firstData + rows.length - 1;
  aoa.push([]);
  aoa.push(['TOTAL', '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  rows.forEach((_, i) => {
    const excelRow = firstData + i;
    ws[XLSX.utils.encode_cell({ r: excelRow - 1, c: 3 })] = { t: 'n', f: `B${excelRow}*C${excelRow}` };
  });
  ws[XLSX.utils.encode_cell({ r: aoa.length - 1, c: 3 })] = rows.length
    ? { t: 'n', f: `SUM(D${firstData}:D${lastData})` }
    : { t: 'n', v: 0 };
  ws['!cols'] = [{ wch: 46 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
  return ws;
}

/** Archivo de campaña: hoja interna y hoja externa, independientes. */
export function buildCampaignWorkbook(meta: CampaignWorkbookMeta, concepts: CampaignConceptRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, conceptSheet('GASTOS DE PUBLICIDAD · CAMPAÑA INTERNA', meta, concepts, 'interno'), 'Interna');
  XLSX.utils.book_append_sheet(wb, conceptSheet('GASTOS DE PUBLICIDAD · CAMPAÑA EXTERNA', meta, concepts, 'externo'), 'Externa');
  return wb;
}

/** Campaña de convenios: zona, cantidad, precio y total — sin interno/externo. */
export function buildConveniosWorkbook(meta: CampaignWorkbookMeta, rows: ConvenioRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const aoa = sheetHeader('CAMPAÑA DE CONVENIOS', meta);
  aoa.push(['CONVENIO', 'DESCRIPCIÓN', 'ZONA', 'CANTIDAD', 'PRECIO', 'TOTAL']);
  const firstData = aoa.length + 1;
  for (const r of rows) {
    aoa.push([r.concept, r.description || '', r.zona || '', r.qty ?? '', r.price ?? '', '']);
  }
  const lastData = firstData + rows.length - 1;
  aoa.push([]);
  aoa.push(['TOTAL', '', '', '', '', '']);
  const totalIdx = aoa.length - 1;
  const zones = convenioZones(rows);
  if (zones.length) {
    aoa.push([]);
    aoa.push(['CORTESÍAS POR ZONA']);
    aoa.push(['ZONA', 'CANTIDAD', 'VALOR']);
    for (const z of zones) aoa.push([z.zona.toUpperCase(), z.qty, z.total]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  rows.forEach((_, i) => {
    const excelRow = firstData + i;
    ws[XLSX.utils.encode_cell({ r: excelRow - 1, c: 5 })] = { t: 'n', f: `D${excelRow}*E${excelRow}` };
  });
  ws[XLSX.utils.encode_cell({ r: totalIdx, c: 5 })] = rows.length
    ? { t: 'n', f: `SUM(F${firstData}:F${lastData})` }
    : { t: 'n', v: 0 };
  ws['!cols'] = [{ wch: 30 }, { wch: 60 }, { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Convenios');
  return wb;
}

/* ── De vuelta del Excel a la tabla ────────────────────────────────────── */

function cellText(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function cellNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = cellText(v).replace(/[$,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de celda → YYYY-MM-DD (texto ISO o número de serie de Excel). */
function cellDay(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const t = cellText(v);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

type SheetConcept = { concept: string; qty: number | null; price: number | null; from: string | null; to: string | null };

/** Filas entre el encabezado CONCEPTO y el TOTAL de una hoja de campaña. */
function readConceptSheet(ws: XLSX.WorkSheet | undefined): SheetConcept[] {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  const start = rows.findIndex((r) => cellText(r[0]).toUpperCase() === 'CONCEPTO');
  if (start < 0) return [];
  const out: SheetConcept[] = [];
  for (const r of rows.slice(start + 1)) {
    const concept = cellText(r[0]);
    if (/^TOTAL\b/i.test(concept)) break;
    if (!concept) continue;
    const qty = cellNumber(r[1]);
    const price = cellNumber(r[2]);
    // Filas de convenio del formato viejo: la «cantidad» es texto y no hay costo.
    if (qty === null && price === null && cellText(r[1])) continue;
    out.push({ concept, qty, price, from: cellDay(r[4]), to: cellDay(r[5]) });
  }
  return out;
}

/**
 * Lee el archivo de campaña (hojas «Interna» y «Externa»; o la hoja única del
 * formato anterior) y devuelve los conceptos para la tabla del evento.
 */
export function parseCampaignWorkbook(data: ArrayBuffer): CampaignConceptRow[] {
  const wb = XLSX.read(data, { type: 'array' });
  const internal = readConceptSheet(wb.Sheets.Interna ?? wb.Sheets[wb.SheetNames[0]]);
  const external = readConceptSheet(wb.Sheets.Externa);
  const externalByName = new Map(external.map((e) => [e.concept.toUpperCase(), e]));
  return internal.map((row, i) => {
    const ext = externalByName.get(row.concept.toUpperCase()) ?? external[i];
    return {
      concept: row.concept,
      qty: row.qty ?? ext?.qty ?? 1,
      from: row.from ?? ext?.from ?? null,
      to: row.to ?? ext?.to ?? null,
      precioInterno: row.price,
      precioExterno: ext ? ext.price : null,
    };
  });
}
