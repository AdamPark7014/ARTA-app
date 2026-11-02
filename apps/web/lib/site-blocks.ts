/**
 * La maqueta del sitio público: qué secciones existen, en qué orden salen y cuál es su texto de
 * arranque. La pinta `components/site/PublicSiteContent.tsx` y la edita Studio, así que las dos
 * ven lo mismo. El orden se guarda en la fila `site_layout` de PageContent; el texto de cada
 * sección, en su propia fila (`sectionKeyOf`).
 *
 * La portada no entra en el orden: siempre va hasta arriba porque el encabezado flota sobre ella.
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

export const LAYOUT_KEY = 'site_layout';
export const SETTINGS_KEY = 'site_ajustes';
export const HERO_KEY = 'home_hero';
export const CUSTOM_BLOCK_PREFIX = 'bloque_';

type BlockMeta = {
  /** Nombre en Studio. */
  label: string;
  /** Una línea para quien edita: qué es esta sección. */
  description: string;
  /** Fila de PageContent con su texto (las agregadas usan `bloque_<id>`). */
  sectionKey?: string;
  /** Ancla pública: no cambiar, ya hay ligas y botones apuntando a estas. */
  anchor?: string;
  /** Si sale en el menú del sitio, con qué nombre. */
  nav?: string;
  /** Sección agregada desde Studio: se puede borrar y repetir. */
  custom?: boolean;
};

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  cartelera: {
    label: 'Cartelera',
    description: 'Los próximos shows. Un show sale solo de la cartelera cuando pasa su fecha.',
    sectionKey: 'home_cartelera',
    anchor: 'cartelera',
    nav: 'Cartelera',
  },
  historias: {
    label: 'Historias',
    description: 'Fotos y videos verticales que se abren a pantalla completa, como en Instagram.',
    sectionKey: 'home_historias',
    anchor: 'historias',
    nav: 'Historias',
  },
  nosotros: {
    label: 'Nosotros',
    description: 'Quién es Arta: titular, texto, foto y datos.',
    sectionKey: 'home_about',
    anchor: 'nosotros',
    nav: 'Nosotros',
  },
  servicios: {
    label: 'Lo que hacemos',
    description: 'Tarjetas con los servicios de la productora.',
    sectionKey: 'home_modulos',
    anchor: 'modulos',
  },
  noticias: {
    label: 'Noticias',
    description: 'Publicaciones con página propia. Se comparten en redes con su foto.',
    sectionKey: 'home_noticias',
    anchor: 'noticias',
    nav: 'Noticias',
  },
  galeria: {
    label: 'Galería',
    description: 'Fotos de shows pasados. Se abren en grande al tocarlas.',
    sectionKey: 'home_galeria',
    anchor: 'galeria',
    nav: 'Galería',
  },
  aliados: {
    label: 'Aliados',
    description: 'Logos de patrocinadores, recintos y marcas.',
    sectionKey: 'home_aliados',
    anchor: 'aliados',
  },
  faq: {
    label: 'Preguntas frecuentes',
    description: 'Preguntas y respuestas. También ayudan a salir en Google.',
    sectionKey: 'home_faq',
    anchor: 'faq',
  },
  ubicacion: {
    label: 'Ubicación',
    description: 'Dirección y mapa.',
    sectionKey: 'home_ubicacion',
    anchor: 'ubicacion',
  },
  contacto: {
    label: 'Contacto',
    description: 'Formulario y datos para escribirle a Arta.',
    sectionKey: 'home_cta',
    anchor: 'contacto',
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

/** El orden de arranque. Toda sección base vive aquí; se oculta, no se borra. */
export const DEFAULT_LAYOUT: LayoutBlock[] = (
  ['cartelera', 'historias', 'nosotros', 'servicios', 'noticias', 'galeria', 'aliados', 'faq', 'ubicacion', 'contacto'] as BlockType[]
).map((type) => ({ id: type, type, visible: true }));

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

/** Texto de arranque de cada sección: lo que se ve mientras nadie la haya editado. */
export const DEFAULT_CONTENT: Record<string, Record<string, unknown>> = {
  [HERO_KEY]: {
    headline: 'La experiencia del Show',
    sub: 'Producimos conciertos y espectáculos en Puebla: del primer boceto a la última luz del escenario.',
    cta: 'Ver cartelera',
    ctaHref: '#cartelera',
    showCount: '3',
    tone: 'bn',
    ticker: '#LaExperienciadelShow\nConciertos y espectáculos\nPuebla, México',
  },
  home_cartelera: {
    eyebrow: 'Cartelera',
    headline: 'Próximos shows',
    lead: 'Lo que viene en el escenario. Aparta la fecha.',
    emptyTitle: 'Estamos armando la próxima temporada',
    emptyText: 'Muy pronto anunciamos fechas. Si tienes un show en mente, escríbenos.',
  },
  home_historias: {
    eyebrow: 'Historias',
    headline: 'Detrás del show',
    lead: 'Montajes, ensayos y lo que pasa cuando se apagan las luces.',
  },
  home_about: {
    eyebrow: 'Nosotros',
    headline: 'Producimos el show completo',
    body: 'Somos la productora detrás de lo que pasa arriba y abajo del escenario. Montaje, audio e iluminación, hospitalidad para los artistas, boletaje, campaña y cierre: una sola mano de principio a fin, con el mismo cuidado en cada fecha.',
    imageUrl: '/uploads/seed-hero-2.jpg',
    stats: [
      { label: 'Show', text: 'Producción integral de conciertos y espectáculos' },
      { label: 'Puebla', text: 'Nuestra base, con shows en toda la región' },
      { label: 'Equipo', text: 'Del rider al último aplauso' },
    ],
  },
  home_modulos: {
    eyebrow: 'Lo que hacemos',
    headline: 'Todo lo que un show necesita',
    lead: 'Un solo equipo se hace cargo de cada parte, para que el público solo tenga que llegar y vivirlo.',
    tiles: [
      { title: 'Producción', body: 'Audio, iluminación, escenario, plantas de luz y staff, con su minuto a minuto.' },
      { title: 'Hospitalidad', body: 'Hospedaje, traslados, alimentos y camerinos para artistas y equipo.' },
      { title: 'Comercial', body: 'Boletaje, patrocinios, artes y campaña de difusión.' },
      { title: 'Cierre', body: 'Cuentas claras, proveedores liquidados y un reporte de cada fecha.' },
    ],
  },
  home_noticias: {
    eyebrow: 'Lo último',
    headline: 'Noticias',
    lead: 'Lo que está pasando en Arta Producciones.',
    emptyText: 'Pronto publicaremos novedades de la temporada.',
  },
  home_galeria: {
    eyebrow: 'Galería',
    headline: 'Así se vive',
    lead: 'Noches que ya pasaron y se quedaron con nosotros.',
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

const TONE_OPTIONS: FieldOption[] = [
  { value: 'papel', label: 'Claro (papel)' },
  { value: 'tinta', label: 'Oscuro (tinta)' },
];

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
      half: true,
      options: [
        { value: '0', label: 'Ninguno, solo fotos' },
        { value: '1', label: 'El próximo show' },
        { value: '2', label: 'Los próximos 2' },
        { value: '3', label: 'Los próximos 3' },
      ],
    },
    {
      key: 'tone',
      label: 'Color de las fotos',
      type: 'select',
      hint: 'Blanco y negro va con la marca; los pósters siempre van a color.',
      half: true,
      options: [
        { value: 'bn', label: 'Blanco y negro' },
        { value: 'color', label: 'A color' },
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
  ],
  home_historias: [EYEBROW, HEADLINE, LEAD],
  home_about: [
    EYEBROW,
    HEADLINE,
    { key: 'body', label: 'Texto', type: 'textarea', rows: 5 },
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
  ],
  home_modulos: [
    EYEBROW,
    HEADLINE,
    LEAD,
    {
      key: 'tiles',
      label: 'Tarjetas',
      type: 'list',
      itemLabel: 'Tarjeta',
      addLabel: 'Agregar tarjeta',
      fields: [
        { key: 'title', label: 'Título', type: 'text' },
        { key: 'body', label: 'Texto', type: 'textarea', rows: 2 },
      ],
    },
  ],
  home_noticias: [
    EYEBROW,
    HEADLINE,
    LEAD,
    { key: 'emptyText', label: 'Texto cuando no hay noticias', type: 'text' },
  ],
  home_galeria: [EYEBROW, HEADLINE, LEAD],
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
      fields: [
        { key: 'question', label: 'Pregunta', type: 'text' },
        { key: 'answer', label: 'Respuesta', type: 'textarea', rows: 3 },
      ],
    },
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

/** Secciones que tienen lista de contenido además de sus textos. */
export type CollectionKey = 'slides' | 'shows' | 'news' | 'historia' | 'foto' | 'aliado';

export const BLOCK_COLLECTION: Partial<Record<BlockType, CollectionKey>> = {
  cartelera: 'shows',
  historias: 'historia',
  noticias: 'news',
  galeria: 'foto',
  aliados: 'aliado',
};

/** Mensajes entre Studio y la vista previa del sitio (`/site?embed=1`). */
export type PreviewMessage =
  | { source: 'arta-studio'; type: 'section'; sectionKey: string; contentJson: Record<string, unknown> }
  | { source: 'arta-studio'; type: 'layout'; blocks: LayoutBlock[] }
  | { source: 'arta-studio'; type: 'reload' }
  | { source: 'arta-studio'; type: 'scrollTo'; anchor: string };
