/**
 * El sitio público de Arta: qué páginas tiene, qué secciones lleva Inicio y cuál es el texto de
 * arranque de cada cosa. Lo pintan `components/site/` y lo edita Studio, así que los dos ven lo mismo.
 *
 * - Cada página (`SITE_PAGES`) tiene ruta propia y sale en el menú; su orden y si se ve se guardan en
 *   la fila `site_layout` de PageContent.
 * - Inicio resume el sitio con secciones (`BlockType`) que llevan a cada página; su orden se guarda en
 *   la misma fila. La portada no entra en ese orden: el encabezado flota sobre ella.
 * - El texto de cada sección vive en su propia fila (`sectionKeyOf`). La sección de Inicio y la página
 *   comparten fila: Nosotros se edita una vez y sale resumido en Inicio y completo en su página.
 */
export type BlockType =
  | 'cartelera'
  | 'historias'
  | 'nosotros'
  | 'servicios'
  | 'noticias'
  | 'galeria'
  | 'aliados'
  | 'faq'
  | 'ubicacion'
  | 'contacto'
  | 'texto'
  | 'anuncio';

export type LayoutBlock = { id: string; type: BlockType; visible: boolean };

export type PageKey =
  | 'inicio'
  | 'cartelera'
  | 'nosotros'
  | 'servicios'
  | 'noticias'
  | 'historias'
  | 'galeria'
  | 'preguntas'
  | 'contacto';

export type LayoutPage = { key: PageKey; visible: boolean };

export const LAYOUT_KEY = 'site_layout';
export const SETTINGS_KEY = 'site_ajustes';
export const HERO_KEY = 'home_hero';
export const CUSTOM_BLOCK_PREFIX = 'bloque_';

/** Ruta base del sitio. */
export const SITE_BASE = '/p/arta';

/** Secciones que tienen lista de contenido además de sus textos. */
export type CollectionKey = 'slides' | 'shows' | 'news' | 'historia' | 'foto' | 'aliado';

export type SitePageMeta = {
  key: PageKey;
  /** Ruta dentro del sitio; la ruta completa la da `pageHref`. */
  path: string;
  /** Nombre en el menú y en Studio. */
  label: string;
  /** Una línea para quien edita: qué es esta página. */
  description: string;
  /** Filas de PageContent de esta página. La primera da su título, su foto y su SEO. */
  sections: string[];
  /** Contenido que se administra en esta página. */
  collections: CollectionKey[];
  /** Solo en el menú del teléfono y el pie: la barra de computadora no alcanza para todas. */
  secondary?: boolean;
};

export const SITE_PAGES: SitePageMeta[] = [
  {
    key: 'inicio',
    path: '',
    label: 'Inicio',
    description: 'La primera página: portada con shows y fotos, y un resumen que lleva a todo lo demás.',
    sections: [HERO_KEY],
    collections: ['slides'],
  },
  {
    key: 'cartelera',
    path: '/cartelera',
    label: 'Cartelera',
    description: 'Los próximos shows, cada uno con su página. Un show pasa solo a «Shows anteriores» cuando termina su fecha.',
    sections: ['home_cartelera'],
    collections: ['shows'],
  },
  {
    key: 'nosotros',
    path: '/nosotros',
    label: 'Nosotros',
    description: 'Quién es Arta y cómo trabaja. También están aquí los logos de los aliados.',
    sections: ['home_about', 'home_aliados'],
    collections: ['aliado'],
  },
  {
    key: 'servicios',
    path: '/servicios',
    label: 'Servicios',
    description: 'Lo que hace la productora. Cada servicio tiene su propia página con lo que incluye.',
    sections: ['home_modulos'],
    collections: [],
  },
  {
    key: 'noticias',
    path: '/noticias',
    label: 'Noticias',
    description: 'Publicaciones con página propia. Se comparten en redes con su foto.',
    sections: ['home_noticias'],
    collections: ['news'],
  },
  {
    key: 'historias',
    path: '/historias',
    label: 'Historias',
    description: 'Fotos y videos verticales que se abren a pantalla completa, como en Instagram.',
    sections: ['home_historias'],
    collections: ['historia'],
  },
  {
    key: 'galeria',
    path: '/galeria',
    label: 'Galería',
    description: 'Fotos de shows pasados. Se abren en grande al tocarlas.',
    sections: ['home_galeria'],
    collections: ['foto'],
  },
  {
    key: 'preguntas',
    path: '/preguntas',
    label: 'Preguntas',
    description: 'Preguntas y respuestas. También ayudan a salir en Google.',
    sections: ['home_faq'],
    collections: [],
    secondary: true,
  },
  {
    key: 'contacto',
    path: '/contacto',
    label: 'Contacto',
    description: 'Formulario, datos para escribirle a Arta, dirección y mapa.',
    sections: ['home_cta', 'home_ubicacion'],
    collections: [],
  },
];

export const pageMeta = (key: PageKey) => SITE_PAGES.find((p) => p.key === key) as SitePageMeta;
export const pageHref = (key: PageKey) => `${SITE_BASE}${pageMeta(key).path}`;
export const serviceHref = (slug: string) => `${SITE_BASE}/servicios/${slug}`;

/**
 * Las anclas del sitio de una sola página. Siguen en botones guardados en Studio y en ligas ya
 * compartidas (`/p/arta#noticias`): llevan a la página que ahora tiene ese contenido.
 */
export const LEGACY_ANCHORS: Record<string, string> = {
  cartelera: pageHref('cartelera'),
  historias: pageHref('historias'),
  nosotros: pageHref('nosotros'),
  aliados: pageHref('nosotros'),
  modulos: pageHref('servicios'),
  servicios: pageHref('servicios'),
  noticias: pageHref('noticias'),
  galeria: pageHref('galeria'),
  faq: pageHref('preguntas'),
  preguntas: pageHref('preguntas'),
  ubicacion: pageHref('contacto'),
  contacto: pageHref('contacto'),
};

/** Un botón escrito como `#noticias` o `/p/arta#noticias` lleva a su página. */
export function resolveSiteHref(href: string): string {
  const match = /^(?:\/p\/arta)?#([\w-]+)$/.exec(href.trim());
  return (match && LEGACY_ANCHORS[match[1]]) || href;
}

type BlockMeta = {
  /** Nombre en Studio. */
  label: string;
  /** Una línea para quien edita: qué es esta sección. */
  description: string;
  /** Fila de PageContent con su texto (las agregadas usan `bloque_<id>`). */
  sectionKey?: string;
  /** Ancla dentro de Inicio. */
  anchor?: string;
  /** Página a la que lleva esta sección de Inicio. */
  page?: PageKey;
  /** Sección agregada desde Studio: se puede borrar y repetir. */
  custom?: boolean;
};

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  cartelera: {
    label: 'Próximos shows',
    description: 'Los siguientes shows, con liga a toda la cartelera.',
    sectionKey: 'home_cartelera',
    anchor: 'cartelera',
    page: 'cartelera',
  },
  historias: {
    label: 'Historias',
    description: 'La fila de historias. Sin historias publicadas no sale.',
    sectionKey: 'home_historias',
    anchor: 'historias',
    page: 'historias',
  },
  nosotros: {
    label: 'Nosotros',
    description: 'El resumen de quién es Arta, con liga a su página.',
    sectionKey: 'home_about',
    anchor: 'nosotros',
    page: 'nosotros',
  },
  servicios: {
    label: 'Servicios',
    description: 'Las tarjetas de servicios, cada una con liga a su detalle.',
    sectionKey: 'home_modulos',
    anchor: 'modulos',
    page: 'servicios',
  },
  noticias: {
    label: 'Noticias',
    description: 'Las últimas publicaciones.',
    sectionKey: 'home_noticias',
    anchor: 'noticias',
    page: 'noticias',
  },
  galeria: {
    label: 'Galería',
    description: 'Algunas fotos, con liga a la galería completa. Sin fotos no sale.',
    sectionKey: 'home_galeria',
    anchor: 'galeria',
    page: 'galeria',
  },
  aliados: {
    label: 'Aliados',
    description: 'Logos de patrocinadores, recintos y marcas. Sin logos no sale.',
    sectionKey: 'home_aliados',
    anchor: 'aliados',
    page: 'nosotros',
  },
  faq: {
    label: 'Preguntas frecuentes',
    description: 'Las primeras tres preguntas, con liga a todas.',
    sectionKey: 'home_faq',
    anchor: 'faq',
    page: 'preguntas',
  },
  ubicacion: {
    label: 'Ubicación',
    description: 'Dirección y mapa. Ya están en Contacto; aquí es opcional.',
    sectionKey: 'home_ubicacion',
    anchor: 'ubicacion',
    page: 'contacto',
  },
  contacto: {
    label: 'Invitación a escribir',
    description: 'Una banda con el titular de Contacto y el botón para ir a esa página.',
    sectionKey: 'home_cta',
    anchor: 'contacto',
    page: 'contacto',
  },
  texto: {
    label: 'Texto con foto',
    description: 'Una sección libre: titular, texto, foto y botón.',
    custom: true,
  },
  anuncio: {
    label: 'Anuncio',
    description: 'Una banda grande para avisar algo: titular, foto de fondo y botón.',
    custom: true,
  },
};

/** El orden de arranque de Inicio. Toda sección base vive aquí; se oculta, no se borra. */
export const DEFAULT_LAYOUT: LayoutBlock[] = [
  ...(['cartelera', 'nosotros', 'servicios', 'noticias', 'historias', 'galeria', 'aliados', 'faq', 'contacto'] as BlockType[]).map(
    (type) => ({ id: type as string, type, visible: true }),
  ),
  // Ya está completa en Contacto: se puede poner, pero Inicio no la necesita.
  { id: 'ubicacion', type: 'ubicacion', visible: false },
];

export function sectionKeyOf(block: Pick<LayoutBlock, 'id' | 'type'>): string {
  return BLOCK_META[block.type].sectionKey ?? `${CUSTOM_BLOCK_PREFIX}${block.id}`;
}

export function anchorOf(block: Pick<LayoutBlock, 'id' | 'type'>): string {
  return BLOCK_META[block.type].anchor ?? `seccion-${block.id}`;
}

/** Limpia lo guardado: tipos que ya no existen fuera y, si no hay nada, el orden de arranque. */
export function resolveLayout(raw: unknown): LayoutBlock[] {
  const blocks = (raw as { blocks?: unknown } | null | undefined)?.blocks;
  if (!Array.isArray(blocks) || !blocks.length) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const out: LayoutBlock[] = [];
  for (const b of blocks as Array<Partial<LayoutBlock>>) {
    if (!b?.type || !(b.type in BLOCK_META) || !b.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({ id: String(b.id), type: b.type, visible: b.visible !== false });
  }
  return out.length ? out : DEFAULT_LAYOUT;
}

/** Páginas en el orden del menú. Una página que aún no estaba en lo guardado sale al final, visible. */
/** No se quitan: la raíz del sitio y la página a la que llevan todos los botones de contacto. */
export const FIXED_PAGES: PageKey[] = ['inicio', 'contacto'];

export function resolvePages(raw: unknown): LayoutPage[] {
  const saved = (raw as { pages?: unknown } | null | undefined)?.pages;
  const known = new Map(SITE_PAGES.map((p) => [p.key, p]));
  const out: LayoutPage[] = [];
  if (Array.isArray(saved)) {
    for (const p of saved as Array<Partial<LayoutPage>>) {
      if (!p?.key || !known.has(p.key) || out.some((o) => o.key === p.key)) continue;
      out.push({ key: p.key, visible: FIXED_PAGES.includes(p.key) || p.visible !== false });
    }
  }
  for (const p of SITE_PAGES) if (!out.some((o) => o.key === p.key)) out.push({ key: p.key, visible: true });
  // Inicio siempre primero: es la raíz del sitio.
  return [...out.filter((p) => p.key === 'inicio'), ...out.filter((p) => p.key !== 'inicio')];
}

export type ServiceTile = {
  title: string;
  body: string;
  detail?: string;
  includes?: string;
  imageUrl?: string;
  slug?: string;
};

/**
 * Texto de arranque de cada sección: lo que se ve mientras nadie la haya editado. Lo que dice qué
 * incluye cada servicio sale de los formatos con que Arta trabaja de verdad (`format-catalog.ts`).
 */
export const DEFAULT_CONTENT: Record<string, Record<string, unknown>> = {
  [HERO_KEY]: {
    headline: 'La experiencia del Show',
    sub: 'Producimos conciertos y espectáculos en Puebla: del primer boceto a la última luz del escenario.',
    cta: 'Ver cartelera',
    ctaHref: pageHref('cartelera'),
    showCount: '3',
    ticker: '#LaExperienciadelShow\nConciertos y espectáculos\nPuebla, México',
  },
  home_cartelera: {
    eyebrow: 'Cartelera',
    headline: 'Próximos shows',
    lead: 'Lo que viene en el escenario. Aparta la fecha.',
    emptyTitle: 'Estamos armando la próxima temporada',
    emptyText: 'Muy pronto anunciamos fechas. Si tienes un show en mente, escríbenos.',
    pageImage: '/uploads/seed-hero-1.jpg',
  },
  home_historias: {
    eyebrow: 'Historias',
    headline: 'Detrás del show',
    lead: 'Montajes, ensayos y lo que pasa cuando se apagan las luces.',
    emptyText: 'Pronto compartiremos lo que pasa detrás del escenario.',
    pageImage: '/uploads/seed-hero-3.jpg',
  },
  home_about: {
    eyebrow: 'Nosotros',
    headline: 'Producimos el show completo',
    summary: 'Somos la productora detrás de lo que pasa arriba y abajo del escenario: una sola mano de principio a fin, con el mismo cuidado en cada fecha.',
    body: 'Somos la productora detrás de lo que pasa arriba y abajo del escenario. Montaje, audio e iluminación, hospitalidad para los artistas, boletaje, campaña y cierre: una sola mano de principio a fin, con el mismo cuidado en cada fecha.\n\nDesde Puebla acompañamos a cada artista y a cada promotor desde que llega el rider hasta que se cierran las cuentas, para que el público solo tenga que llegar y vivirlo.',
    imageUrl: '/uploads/seed-hero-2.jpg',
    pageImage: '/uploads/seed-news-3.jpg',
    stats: [
      { label: 'Show', text: 'Producción integral de conciertos y espectáculos' },
      { label: 'Puebla', text: 'Nuestra base, con shows en toda la región' },
      { label: 'Equipo', text: 'Del rider al último aplauso' },
    ],
    stepsTitle: 'Cómo trabajamos',
    steps: [
      { title: 'Planeación', body: 'Recibimos el rider y definimos contigo la fecha, el recinto y el alcance del show.' },
      { title: 'Preproducción', body: 'Cerramos proveedores, hospitalidad, artes y campaña, con un responsable para cada parte.' },
      { title: 'Día del show', body: 'Montaje, pruebas y función con un minuto a minuto que todo el equipo conoce.' },
      { title: 'Cierre', body: 'Desmontaje, proveedores liquidados y cuentas claras de la fecha.' },
    ],
  },
  home_modulos: {
    eyebrow: 'Servicios',
    headline: 'Todo lo que un show necesita',
    lead: 'Un solo equipo se hace cargo de cada parte, para que el público solo tenga que llegar y vivirlo.',
    pageImage: '/uploads/seed-hero-1.jpg',
    tiles: [
      {
        title: 'Producción',
        body: 'Audio, iluminación, escenario, plantas de luz y staff, con su minuto a minuto.',
        detail: 'Armamos lo que el público ve y escucha. Partimos del rider del artista, reunimos a los proveedores que hacen falta y coordinamos a cada equipo para que todo esté listo a tiempo.',
        includes: 'Revisión de los riders del artista\nProveedores de audio, iluminación y escenario\nPlantas de luz y stage hands\nProduction managers y encargados por equipo\nMinuto a minuto del día del show',
        imageUrl: '/uploads/seed-hero-1.jpg',
      },
      {
        title: 'Hospitalidad',
        body: 'Hospedaje, traslados, alimentos y camerinos para artistas y equipo.',
        detail: 'Cuidamos a quienes hacen posible el show desde que llegan a la ciudad hasta que se van, para que su única preocupación sea el escenario.',
        includes: 'Hotel para el artista y su equipo\nTraslados y transportación\nCatering con sus horarios de servicio\nCamerinos preparados',
        imageUrl: '/uploads/seed-news-3.jpg',
      },
      {
        title: 'Comercial',
        body: 'Boletaje, patrocinios, artes y campaña de difusión.',
        detail: 'Hacemos que el show se sepa y se venda: desde el arte del cartel hasta la rueda de prensa, con todo autorizado antes de salir.',
        includes: 'Boletera y venta de boletos\nPatrocinios y convenios\nArtes del show con autorización\nCampaña de difusión\nRueda de prensa y atención a medios\nDistribución de pendones',
        imageUrl: '/uploads/seed-hero-2.jpg',
      },
      {
        title: 'Cierre',
        body: 'Cuentas claras, proveedores liquidados y un reporte de cada fecha.',
        detail: 'El show termina cuando las cuentas cuadran. Llevamos el control del dinero de cada fecha y lo entregamos en orden.',
        includes: 'Corrida financiera de la fecha\nÓrdenes de compra y anticipos a proveedores\nEntregas y autorizaciones firmadas\nReporte de cierre del show',
        imageUrl: '/uploads/seed-news-2.jpg',
      },
    ] as ServiceTile[],
  },
  home_noticias: {
    eyebrow: 'Lo último',
    headline: 'Noticias',
    lead: 'Lo que está pasando en Arta Producciones.',
    emptyText: 'Pronto publicaremos novedades de la temporada.',
    pageImage: '/uploads/seed-hero-2.jpg',
  },
  home_galeria: {
    eyebrow: 'Galería',
    headline: 'Así se vive',
    lead: 'Noches que ya pasaron y se quedaron con nosotros.',
    emptyText: 'Pronto subiremos las fotos de los últimos shows.',
    pageImage: '/uploads/seed-hero-1.jpg',
  },
  home_aliados: {
    eyebrow: 'Aliados',
    headline: 'Con quienes lo hacemos posible',
    lead: '',
  },
  home_faq: {
    eyebrow: 'Preguntas',
    headline: 'Preguntas frecuentes',
    lead: 'Si no encuentras la tuya, escríbenos.',
    faqs: [
      {
        question: '¿Qué hace Arta Producciones?',
        answer:
          'Producimos conciertos y espectáculos de principio a fin: producción técnica, hospitalidad para los artistas, boletaje, campaña de difusión y cierre de cada fecha.',
      },
      {
        question: '¿Dónde trabajan?',
        answer: 'Nuestra base está en Puebla, México, y producimos shows en toda la región. Nuestro recinto aliado es el Auditorio Arema Explanada.',
      },
      {
        question: '¿Cómo llevo un show con ustedes?',
        answer: 'Escríbenos con la fecha, el recinto y la idea que tienes. Te respondemos con una propuesta de producción.',
      },
      {
        question: '¿Dónde compro boletos?',
        answer: 'Cada show de la cartelera tiene su botón de boletos cuando la venta está abierta.',
      },
    ],
  },
  home_ubicacion: {
    eyebrow: 'Ubicación',
    headline: 'Dónde encontrarnos',
    lead: 'Nuestra base está en Puebla, con el Auditorio Arema Explanada como recinto aliado.',
    address: 'Auditorio Arema Explanada, Puebla, Puebla, México',
  },
  home_cta: {
    eyebrow: 'Contacto',
    headline: 'Hablemos de tu próximo show',
    body: 'Cuéntanos la fecha, el recinto y lo que tienes en mente. Te respondemos con una propuesta de producción.',
    cta: 'Escribir a Arta',
    pageImage: '/uploads/seed-hero-2.jpg',
  },
  [SETTINGS_KEY]: {
    tagline: 'La experiencia del Show',
    footerNote: 'Producción integral de conciertos y espectáculos.',
  },
};

export const CUSTOM_DEFAULTS: Partial<Record<BlockType, Record<string, unknown>>> = {
  texto: { eyebrow: '', headline: 'Título de la sección', body: 'Escribe aquí el texto.', imageSide: 'derecha', tone: 'papel' },
  anuncio: { eyebrow: '', headline: 'Un anuncio importante', body: '', tone: 'tinta' },
};

// ─── Formularios de Studio ──────────────────────────────────────────────────

export type FieldOption = { value: string; label: string };

export type Field =
  | {
      key: string;
      label: string;
      type: 'text' | 'textarea' | 'link' | 'date' | 'time';
      hint?: string;
      placeholder?: string;
      rows?: number;
      /** Ocupa medio renglón junto al siguiente campo con `half`. */
      half?: boolean;
      /** Va escondido en «Opciones avanzadas». */
      advanced?: boolean;
    }
  | { key: string; label: string; type: 'media'; hint?: string; video?: boolean; ratio?: string }
  | { key: string; label: string; type: 'select'; hint?: string; options: FieldOption[]; half?: boolean }
  | { key: string; label: string; type: 'list'; itemLabel: string; addLabel: string; hint?: string; fields: Field[] };

const EYEBROW: Field = { key: 'eyebrow', label: 'Etiqueta', type: 'text', hint: 'La palabra chiquita arriba del titular.', half: true };
const HEADLINE: Field = { key: 'headline', label: 'Titular', type: 'text', half: true };
const LEAD: Field = { key: 'lead', label: 'Texto de entrada', type: 'textarea', rows: 2 };

/** Lo que cada página tiene de suyo: la foto de su cabecera y cómo sale en Google. */
const PAGE_FIELDS: Field[] = [
  { key: 'pageImage', label: 'Foto de la cabecera de la página', type: 'media', ratio: 'Horizontal y grande' },
  { key: 'seoTitle', label: 'Título en Google', type: 'text', advanced: true, hint: 'Vacío = el nombre de la página.' },
  { key: 'seoDescription', label: 'Descripción en Google', type: 'textarea', rows: 2, advanced: true, hint: 'Vacío = el texto de entrada.' },
];

const TONE_OPTIONS: FieldOption[] = [
  { value: 'papel', label: 'Claro (papel)' },
  { value: 'tinta', label: 'Oscuro (tinta)' },
];

/** Nombre de cada bloque de textos dentro del editor de su página. */
export const SECTION_LABELS: Record<string, string> = {
  [HERO_KEY]: 'Textos de la portada',
  home_cartelera: 'Textos de la página',
  home_historias: 'Textos de la página',
  home_about: 'Textos y fotos de la página',
  home_aliados: 'Textos de los aliados',
  home_modulos: 'Textos y servicios',
  home_noticias: 'Textos de la página',
  home_galeria: 'Textos de la página',
  home_faq: 'Textos y preguntas',
  home_cta: 'Textos de contacto',
  home_ubicacion: 'Dirección y mapa',
  [SETTINGS_KEY]: 'Datos del sitio',
};

/** Campos de texto de cada sección. Lo que es lista de contenido (shows, historias…) va aparte. */
export const SECTION_FIELDS: Record<string, Field[]> = {
  [HERO_KEY]: [
    { key: 'headline', label: 'Titular de respaldo', type: 'text', hint: 'Se usa si una foto de portada no trae título.', half: true },
    { key: 'cta', label: 'Botón de respaldo', type: 'text', half: true },
    { key: 'sub', label: 'Texto de respaldo', type: 'textarea', rows: 2 },
    { key: 'ctaHref', label: 'Enlace del botón', type: 'link' },
    {
      key: 'showCount',
      label: 'Shows en la portada',
      type: 'select',
      hint: 'Los próximos shows entran solos a la portada, con su póster.',
      options: [
        { value: '0', label: 'Ninguno, solo fotos' },
        { value: '1', label: 'El próximo show' },
        { value: '2', label: 'Los próximos 2' },
        { value: '3', label: 'Los próximos 3' },
      ],
    },
    { key: 'ticker', label: 'Cinta debajo de la portada', type: 'textarea', rows: 3, hint: 'Una frase por renglón. Vacío = sin cinta.' },
  ],
  home_cartelera: [
    EYEBROW,
    HEADLINE,
    LEAD,
    { key: 'emptyTitle', label: 'Título cuando no hay shows', type: 'text' },
    { key: 'emptyText', label: 'Texto cuando no hay shows', type: 'textarea', rows: 2 },
    ...PAGE_FIELDS,
  ],
  home_historias: [EYEBROW, HEADLINE, LEAD, { key: 'emptyText', label: 'Texto cuando no hay historias', type: 'text' }, ...PAGE_FIELDS],
  home_about: [
    EYEBROW,
    HEADLINE,
    { key: 'summary', label: 'Resumen para Inicio', type: 'textarea', rows: 3, hint: 'Lo que se lee en Inicio, antes de entrar a la página.' },
    { key: 'body', label: 'Texto completo de la página', type: 'textarea', rows: 7, hint: 'Deja un renglón en blanco entre párrafos.' },
    { key: 'imageUrl', label: 'Foto', type: 'media', ratio: 'Vertical, se recorta en arco' },
    {
      key: 'stats',
      label: 'Datos',
      type: 'list',
      itemLabel: 'Dato',
      addLabel: 'Agregar dato',
      fields: [
        { key: 'label', label: 'Dato', type: 'text', half: true, placeholder: 'Ej. 120 shows' },
        { key: 'text', label: 'Detalle', type: 'text', half: true },
      ],
    },
    { key: 'stepsTitle', label: 'Título de los pasos', type: 'text' },
    {
      key: 'steps',
      label: 'Pasos',
      type: 'list',
      itemLabel: 'Paso',
      addLabel: 'Agregar paso',
      fields: [
        { key: 'title', label: 'Paso', type: 'text' },
        { key: 'body', label: 'Qué pasa en este paso', type: 'textarea', rows: 2 },
      ],
    },
    ...PAGE_FIELDS,
  ],
  home_modulos: [
    EYEBROW,
    HEADLINE,
    LEAD,
    {
      key: 'tiles',
      label: 'Servicios',
      type: 'list',
      itemLabel: 'Servicio',
      addLabel: 'Agregar servicio',
      hint: 'Cada servicio tiene su página con el texto, la foto y lo que incluye.',
      fields: [
        { key: 'title', label: 'Nombre', type: 'text' },
        { key: 'body', label: 'Resumen', type: 'textarea', rows: 2, hint: 'Lo que se lee en la tarjeta.' },
        { key: 'detail', label: 'Texto de su página', type: 'textarea', rows: 4 },
        { key: 'includes', label: 'Qué incluye', type: 'textarea', rows: 5, hint: 'Una cosa por renglón.' },
        { key: 'imageUrl', label: 'Foto', type: 'media', ratio: 'Horizontal' },
        { key: 'slug', label: 'Dirección de la página', type: 'text', advanced: true, hint: 'Se arma sola con el nombre.' },
      ],
    },
    ...PAGE_FIELDS,
  ],
  home_noticias: [
    EYEBROW,
    HEADLINE,
    LEAD,
    { key: 'emptyText', label: 'Texto cuando no hay noticias', type: 'text' },
    ...PAGE_FIELDS,
  ],
  home_galeria: [EYEBROW, HEADLINE, LEAD, { key: 'emptyText', label: 'Texto cuando no hay fotos', type: 'text' }, ...PAGE_FIELDS],
  home_aliados: [EYEBROW, HEADLINE, LEAD],
  home_faq: [
    EYEBROW,
    HEADLINE,
    LEAD,
    {
      key: 'faqs',
      label: 'Preguntas',
      type: 'list',
      itemLabel: 'Pregunta',
      addLabel: 'Agregar pregunta',
      hint: 'Inicio enseña las primeras tres.',
      fields: [
        { key: 'question', label: 'Pregunta', type: 'text' },
        { key: 'answer', label: 'Respuesta', type: 'textarea', rows: 3 },
      ],
    },
    ...PAGE_FIELDS,
  ],
  home_ubicacion: [
    EYEBROW,
    HEADLINE,
    LEAD,
    { key: 'address', label: 'Dirección', type: 'text', hint: 'El mapa busca esta dirección. Revísalo en la vista previa.' },
  ],
  home_cta: [
    EYEBROW,
    HEADLINE,
    { key: 'body', label: 'Texto', type: 'textarea', rows: 3 },
    { key: 'cta', label: 'Texto del botón del formulario', type: 'text' },
    ...PAGE_FIELDS,
  ],
  [SETTINGS_KEY]: [
    { key: 'tagline', label: 'Lema', type: 'text', half: true },
    { key: 'footerNote', label: 'Frase del pie de página', type: 'text', half: true },
    { key: 'email', label: 'Correo', type: 'text', half: true, placeholder: 'contacto@artaproducciones.com' },
    { key: 'phone', label: 'Teléfono', type: 'text', half: true, placeholder: '222 000 0000' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text', half: true, hint: 'Con lada, solo números. Ej. 522220000000' },
    { key: 'city', label: 'Ciudad', type: 'text', half: true, placeholder: 'Puebla' },
    { key: 'instagram', label: 'Instagram', type: 'link', hint: 'La dirección completa del perfil, con https://' },
    { key: 'facebook', label: 'Facebook', type: 'link' },
    { key: 'tiktok', label: 'TikTok', type: 'link' },
    { key: 'youtube', label: 'YouTube', type: 'link' },
    { key: 'spotify', label: 'Spotify', type: 'link' },
    { key: 'x', label: 'X', type: 'link' },
  ],
};

export const CUSTOM_FIELDS: Partial<Record<BlockType, Field[]>> = {
  texto: [
    EYEBROW,
    HEADLINE,
    { key: 'body', label: 'Texto', type: 'textarea', rows: 5 },
    { key: 'imageUrl', label: 'Foto', type: 'media' },
    {
      key: 'imageSide',
      label: 'La foto va a la',
      type: 'select',
      half: true,
      options: [
        { value: 'derecha', label: 'Derecha' },
        { value: 'izquierda', label: 'Izquierda' },
      ],
    },
    { key: 'tone', label: 'Fondo', type: 'select', half: true, options: TONE_OPTIONS },
    { key: 'cta', label: 'Botón', type: 'text', half: true },
    { key: 'ctaHref', label: 'Enlace del botón', type: 'link' },
  ],
  anuncio: [
    EYEBROW,
    HEADLINE,
    { key: 'body', label: 'Texto', type: 'textarea', rows: 3 },
    { key: 'imageUrl', label: 'Foto de fondo', type: 'media', ratio: 'Horizontal' },
    { key: 'tone', label: 'Fondo sin foto', type: 'select', half: true, options: TONE_OPTIONS },
    { key: 'cta', label: 'Botón', type: 'text', half: true },
    { key: 'ctaHref', label: 'Enlace del botón', type: 'link' },
  ],
};

/** Mensajes entre Studio y la vista previa del sitio (`/site?embed=1`). */
export type PreviewMessage =
  | { source: 'arta-studio'; type: 'section'; sectionKey: string; contentJson: Record<string, unknown> }
  | { source: 'arta-studio'; type: 'layout'; blocks: LayoutBlock[]; pages: LayoutPage[] }
  | { source: 'arta-studio'; type: 'reload' }
  | { source: 'arta-studio'; type: 'page'; page: PageKey }
  | { source: 'arta-studio'; type: 'scrollTo'; anchor: string };
