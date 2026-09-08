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
