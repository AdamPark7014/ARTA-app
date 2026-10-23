/**
 * Conceptos y precios de campaña — **sin `xlsx`**.
 *
 * Vivían dentro de `campaign-sheet-template.ts`, que importa la librería de
 * Excel en su primera línea. Como el detalle del evento necesita el catálogo
 * para pintar la tabla de precio interno/externo, arrastraba los ~150 kB de
 * `xlsx` a la carga inicial de la pantalla más usada del panel, abriera o no
 * alguien una hoja de cálculo.
 *
 * El generador del libro sigue en `campaign-sheet-template.ts`, que ahora solo
 * se carga cuando alguien pulsa «Nueva hoja de gastos».
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

export function campaignExpensesFileName(eventName: string) {
  const slug = eventName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `CAMPAÑA-${slug || 'gastos'}.xlsx`;
}

/* ── Junta 11-09-2026: conceptos con cantidad, fechas y los dos precios ──── */

type ConceptRow = import('@/components/events/event-detail.types').CampaignConceptRow;
type ConvenioRowT = import('@/components/events/event-detail.types').ConvenioRow;

/**
 * Filas guardadas → filas de la tabla de campaña.
 *
 * - Las de convenio ahora viven en la pestaña Convenios.
 * - Las marcadas fuera del show (`included: false`) ya no existen.
 * - El catálogo base que se guardaba entero, sin precio ni cantidad, era
 *   relleno: se omite para que la tabla muestre solo lo que es de este show.
 */
export function campaignRowsFrom(concepts?: ConceptRow[] | null): ConceptRow[] {
  return (concepts || [])
    .filter((c) => !c.convenio && c.included !== false)
    .filter((c) => c.qty !== undefined || c.precioInterno != null || c.precioExterno != null)
    .map((c) => ({
      concept: c.concept || '',
      qty: c.qty ?? 1,
      from: c.from || null,
      to: c.to || null,
      precioInterno: c.precioInterno ?? null,
      precioExterno: c.precioExterno ?? null,
    }));
}

export function cleanCampaignRows(rows: ConceptRow[]): ConceptRow[] {
  return rows
    .filter((r) => r.concept.trim())
    .map((r) => ({
      concept: r.concept.trim(),
      qty: r.qty ?? 1,
      from: r.from || null,
      to: r.to || null,
      precioInterno: r.precioInterno ?? null,
      precioExterno: r.precioExterno ?? null,
    }));
}

export function conceptLineTotal(row: ConceptRow, kind: 'interno' | 'externo'): number | null {
  const price = kind === 'interno' ? row.precioInterno : row.precioExterno;
  if (price == null) return null;
  return Number(row.qty ?? 1) * Number(price);
}

/**
 * Totales interno y externo, y el ahorro (junta 23-10-2026: «tomar la
 * diferencia del total externo versus el interno como el ahorro que se
 * tuvo»). Negativo = lo interno salió más caro que lo externo; se muestra
 * tal cual, con su signo.
 */
export function campaignTotals(rows: ConceptRow[]) {
  const sums = rows.reduce(
    (acc, r) => ({
      interno: acc.interno + (conceptLineTotal(r, 'interno') || 0),
      externo: acc.externo + (conceptLineTotal(r, 'externo') || 0),
    }),
    { interno: 0, externo: 0 },
  );
  return { ...sums, ahorro: campaignSavings(sums) };
}

/** Ahorro = total externo − total interno. */
export function campaignSavings(totals: { interno: number; externo: number }): number {
  return Math.round((totals.externo - totals.interno) * 100) / 100;
}

/**
 * Conceptos con un solo precio: cuentan en un total y no en el otro, así que
 * el ahorro de la campaña los trae cargados. Se avisa, no se esconde.
 */
export function conceptsWithOnePrice(rows: ConceptRow[]): number {
  return rows.filter((r) => (r.precioInterno == null) !== (r.precioExterno == null)).length;
}

/* ── Notas finales con fecha (junta 23-10-2026) ─────────────────────────── */

type FinalNoteT = import('@/components/events/event-detail.types').CampaignFinalNote;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayOrNull(value?: string | null): string | null {
  const v = (value || '').slice(0, 10);
  return DAY_RE.test(v) ? v : null;
}

/** Notas con texto o fecha; un rango al revés se voltea. */
export function cleanFinalNotes(notes?: FinalNoteT[] | null): FinalNoteT[] {
  return (notes || [])
    .map((n) => {
      let from = dayOrNull(n.from);
      let to = dayOrNull(n.to);
      if (from && to && to < from) [from, to] = [to, from];
      return { from, to, text: (n.text || '').trim() };
    })
    .filter((n) => n.text || n.from || n.to);
}

function dayParts(value: string) {
  const [, y, m, d] = value.match(DAY_RE)!;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function dayMonth(date: Date) {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
}

/**
 * «Del 1 de noviembre al 15 de diciembre de 2026» · «1 de noviembre de 2026»
 * · «Hasta el 15 de noviembre de 2026» · «» (nota sin fecha).
 */
export function finalNoteWhen(note: Pick<FinalNoteT, 'from' | 'to'>): string {
  const from = dayOrNull(note.from);
  const to = dayOrNull(note.to);
  const a = from ? dayParts(from) : null;
  const b = to ? dayParts(to) : null;
  if (a && b && from !== to) {
    return a.getFullYear() === b.getFullYear()
      ? `Del ${dayMonth(a)} al ${dayMonth(b)} de ${b.getFullYear()}`
      : `Del ${dayMonth(a)} de ${a.getFullYear()} al ${dayMonth(b)} de ${b.getFullYear()}`;
  }
  if (a) return `${dayMonth(a)} de ${a.getFullYear()}`;
  if (b) return `Hasta el ${dayMonth(b)} de ${b.getFullYear()}`;
  return '';
}

/** Convenios del catálogo base con la descripción de lo que entrega cada medio. */
export const CONVENIO_CATALOG: Array<{ concept: string; description: string }> = CAMPAIGN_CONCEPT_CATALOG.filter(
  (c) => c.convenio,
).map((c) => ({ concept: c.concept, description: c.description || '' }));

/* ── Convenios con varias zonas (junta 23-10-2026) ─────────────────────── */

type ConvenioZoneT = import('@/components/events/event-detail.types').ConvenioZone;

/**
 * Zonas de un convenio. Lo guardado antes del 23-10-2026 traía una sola zona
 * en el renglón (`zona`, `qty`, `price`): se lee como un convenio de una zona,
 * sin tocar la base, y al guardar ya se escribe con `zonas`.
 */
export function convenioZonesOf(row: ConvenioRowT): ConvenioZoneT[] {
  if (Array.isArray(row.zonas)) {
    return row.zonas.map((z) => ({ zona: z?.zona || '', qty: z?.qty ?? null, price: z?.price ?? null }));
  }
  if ((row.zona || '').trim() || row.qty != null || row.price != null) {
    return [{ zona: row.zona || '', qty: row.qty ?? null, price: row.price ?? null }];
  }
  return [];
}

/** Convenio con la forma nueva: concepto, descripción y lista de zonas. */
export function normalizeConvenioRow(row: ConvenioRowT): ConvenioRowT {
  return { concept: row.concept || '', description: row.description || '', zonas: convenioZonesOf(row) };
}

function zoneFilled(z: ConvenioZoneT) {
  return !!z.zona.trim() || z.qty != null || z.price != null;
}

export function cleanConvenioRows(rows: ConvenioRowT[]): ConvenioRowT[] {
  return rows
    .filter((r) => r.concept.trim())
    .map((r) => ({
      concept: r.concept.trim(),
      description: (r.description || '').trim(),
      zonas: convenioZonesOf(r)
        .filter(zoneFilled)
        .map((z) => ({ zona: z.zona.trim(), qty: z.qty ?? null, price: z.price ?? null })),
    }));
}

export function convenioZoneTotal(zone: ConvenioZoneT): number | null {
  if (zone.qty == null || zone.price == null) return null;
  return Number(zone.qty) * Number(zone.price);
}

/** Total del convenio: la suma de sus zonas; `null` si ninguna tiene cantidad y precio. */
export function convenioLineTotal(row: ConvenioRowT): number | null {
  let total: number | null = null;
  for (const z of convenioZonesOf(row)) {
    const t = convenioZoneTotal(z);
    if (t != null) total = (total ?? 0) + t;
  }
  return total;
}

export function conveniosTotal(rows: ConvenioRowT[]) {
  return rows.reduce((s, r) => s + (convenioLineTotal(r) || 0), 0);
}

/** Cortesías agrupadas por zona entre todos los convenios: «Oro · 12 boletos · $9,600». */
export function convenioZones(rows: ConvenioRowT[]) {
  const map = new Map<string, { zona: string; qty: number; total: number }>();
  for (const r of rows) {
    for (const z of convenioZonesOf(r)) {
      const zona = z.zona.trim();
      if (!zona || z.qty == null) continue;
      const key = zona.toUpperCase();
      const prev = map.get(key) || { zona, qty: 0, total: 0 };
      prev.qty += Number(z.qty);
      prev.total += convenioZoneTotal(z) || 0;
      map.set(key, prev);
    }
  }
  return Array.from(map.values());
}

export function conveniosFileName(eventName: string) {
  return campaignExpensesFileName(eventName).replace(/^CAMPAÑA-/, 'CONVENIOS-');
}
