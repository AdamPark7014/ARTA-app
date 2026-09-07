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
export type CampaignSheetMeta = {
  eventName: string;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  promoter?: string;
};

/** Precio de lista por concepto (pendiente de datos de Arta). */
export type CampaignConceptPrice = {
  concept: string;
  /** Descripción default para convenios (va en CANTIDAD). */
  description?: string;
  /** Precio unitario interno (equipo Arta). */
  precioInterno?: number | null;
  /** Precio unitario externo / cliente. */
  precioExterno?: number | null;
  /** Si true, la fila es convenio: no fórmula de total monetario. */
  convenio?: boolean;
};

/**
 * Conceptos base del PDF operativo. Precios vacíos hasta que Arta cargue
 * interno/externo en la página (o los pegue en la hoja Precios).
 *
 * Feedback Arta (WhatsApp Dashboard, 2026-09-07): el encabezado y el formato
 * se mantienen entre shows; cambian los conceptos. Automatizar = tener en la
 * página cada concepto con precio interno y externo.
 */
export const CAMPAIGN_CONCEPT_CATALOG: CampaignConceptPrice[] = [
  { concept: 'META (FACEBOOK E INSTAGRAM)' },
  { concept: 'CONTENIDO IA' },
  { concept: 'IMPRESIÓN PENDÓN CHOLULA' },
  { concept: 'COLOCACION PENDÓN CHOLULA' },
  { concept: 'GARANTÍA PENDÓN CHOLULA' },
  { concept: 'PERMISO PENDÓN CHOLULA' },
  { concept: 'IMPRESIÓN MUPPI CRUZ DEL SUR' },
  { concept: 'RENTA PLUMAS CHEDRAUI' },
  { concept: 'IMPRESION PLUMAS CHEDRAUI' },
  { concept: 'IMPRESIÓN VALLAS' },
  { concept: 'POSTERS' },
  { concept: 'IMPRESION MEGA VALLA' },
  { concept: 'RENTA MEGA VALLA' },
  { concept: 'IMPRESION MEDALLONES' },
  { concept: 'RENTA MEDALLONES' },
  { concept: 'RENTA PUENTE' },
  { concept: 'IMPRESION PUENTE' },
  {
    concept: 'PANTALLAS CENTRO COMERCIAL EXPLANADA',
    convenio: true,
    description:
      'PRESENCIA EN PANTALLAS DENTRO DEL CENTRO COMERCIAL: ENTRADA PRINCIPAL, PISTA DE HIELO Y ESTACIONAMIENTO',
  },
  {
    concept: 'VALLAS METALICAS',
    convenio: true,
    description: 'VALLAS METALICAS UBICADAS EN DISTINTOS PUNTOS DE LA CIUDAD DURANTE 1 MES',
  },
  {
    concept: 'TV AZTECA',
    convenio: true,
    description: 'DIFUSIÓN EN PROGRAMA "HECHOS", REDES SOCIALES Y PÁGINA WEB',
  },
  {
    concept: 'PANTALLAS',
    convenio: true,
    description:
      'PRESENCIA EN PANTALLAS UBICADAS EN ACCESO SOLESTA, PASEO DESTINO Y CIRCUITO Y 33 SUR DURANTE 1 MES',
  },
  {
    concept: 'SOL DE PUEBLA',
    convenio: true,
    description:
      '3 NOTAS EN SITIO WEB CON 2 RÉPLICAS EN REDES SOCIALES CADA UNA Y PUBLICACIÓN DE LAS 3 NOTAS EN PERIÓDICO IMPRESO.',
  },
  {
    concept: 'ULTRA',
    convenio: true,
    description:
      'SPOT DE 20" 7 IMPACTOS POR DÍA DE LUNES A VIERNES Y MENCIONES DURANTE 3 SEMANAS',
  },
  {
    concept: 'RADIO ORO',
    convenio: true,
    description:
      'SPOT DE 20" 7 IMPACTOS POR DÍA DE LUNES A VIERNES Y MENCIONES DURANTE 3 SEMANAS',
  },
  {
    concept: 'LA ROMANTICA',
    convenio: true,
    description:
      'SPOT DE 20" 7 IMPACTOS POR DÍA DE LUNES A VIERNES Y MENCIONES DURANTE 3 SEMANAS',
  },
  {
    concept: 'RESTAURANTES',
    convenio: true,
    description:
      "PRESENCIA EN PANTALLAS DE 10 MCCARTHY'S, 3 VILLA CAMARÓN, 1 CANTINA EL CARIÑO Y JOHN BARRIGÓN DURANTE 1 MES",
  },
  {
    concept: 'CARLS JR',
    convenio: true,
    description: 'PRESENCIA EN PANTALLAS DE SUCURSALES',
  },
  {
    concept: 'OCHO 30',
    convenio: true,
    description:
      'PRESENCIA CON POSTERS EN SUCURSALES: CENTRO, ANGELOPOLIS, SONATA, SOLESTA Y CHOLULA',
  },
  {
    concept: 'CRUZ DEL SUR',
    convenio: true,
    description: 'PRESENCIA EN MUPPI DURANTE 1 MES',
  },
  {
    concept: 'QUE HACER EN PUEBLA',
    convenio: true,
    description: 'PRESENCIA EN REDES SOCIALES',
  },
  {
    concept: 'INFLUENCERS',
    convenio: true,
    description:
      'PRESENCIA EN SUS REDES SOCIALES CON MENCIONES (SE COMPARTIRA LA LISTA DE MENCIONES Y CALENDARIZACIÓN)',
  },
];

/** Fila de la página (mismo shape que `CampaignConceptRow` en types). */
export type CampaignConceptPageRow = CampaignConceptPrice & {
  included?: boolean;
};

/** Semilla para la tabla en página: catálogo base, precios aún vacíos. */
export function defaultCampaignConceptRows(): CampaignConceptPageRow[] {
  return CAMPAIGN_CONCEPT_CATALOG.map((c) => ({
    ...c,
    included: true,
    precioInterno: c.precioInterno ?? null,
    precioExterno: c.precioExterno ?? null,
  }));
}

/** Filas marcadas para este show → catálogo del Excel. */
export function catalogFromPageConcepts(
  rows: CampaignConceptPageRow[] | undefined | null,
): CampaignConceptPrice[] {
  const list = (rows || []).filter((r) => r.included !== false && r.concept.trim());
  if (!list.length) return CAMPAIGN_CONCEPT_CATALOG;
  return list.map((r) => ({
    concept: r.concept.trim(),
    convenio: !!r.convenio,
    description: r.description,
    precioInterno: r.precioInterno ?? null,
    precioExterno: r.precioExterno ?? null,
  }));
}

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

/**
 * Elige el costo unitario según tipo de campaña.
 * INTERNAL → precioInterno; EXTERNAL → precioExterno; si falta, el otro.
 */
export function resolveConceptUnitCost(
  item: CampaignConceptPrice,
  campaignType?: 'INTERNAL' | 'EXTERNAL' | 'NONE' | string | null,
): number | '' {
  if (item.convenio) return '';
  const interno = item.precioInterno;
  const externo = item.precioExterno;
  if (campaignType === 'EXTERNAL') {
    if (externo != null) return externo;
    if (interno != null) return interno;
    return '';
  }
  if (interno != null) return interno;
  if (externo != null) return externo;
  return '';
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
