import type { CollectionKey, Field } from '@/lib/site-blocks';
import { SHOW_STATUS_LABEL, showDateParts, showTimeLabel } from '@/lib/site-format';
import { isSafeCtaHref } from '@/lib/studio-templates';
import type { FormValues } from './FieldsForm';

export type StudioRow = Record<string, any> & { id: string };

export type RowView = {
  title: string;
  meta?: string;
  thumb?: string | null;
  video?: boolean;
  live: boolean;
  inReview: boolean;
  /** Página pública propia, si la tiene y ya está publicada. */
  href?: string;
};

export type CollectionConfig = {
  key: CollectionKey;
  /** «esta historia», para los mensajes. */
  noun: string;
  addLabel: string;
  emptyText: string;
  /** Lo acomoda quien edita (Subir y Bajar). La cartelera va sola por fecha. */
  ordered: boolean;
  /** Campo que dice si está publicado. */
  liveField: 'active' | 'published';
  endpoint: string;
  /** Para «Enviar a revisión» en el API. */
  reviewKind: 'news' | 'slide' | 'item';
  fields: Field[];
  blank: () => FormValues;
  fromRow: (row: StudioRow) => FormValues;
  toPayload: (values: FormValues) => Record<string, unknown>;
  /** Lo mínimo para guardar un borrador. */
  required: (values: FormValues) => string[];
  /** Lo que falta para publicarlo. */
  missing: (values: FormValues) => string[];
  view: (row: StudioRow) => RowView;
};

const FOCUS_FIELD: Field = {
  key: 'focus',
  label: 'Encuadre',
  type: 'select',
  half: true,
  hint: 'Qué parte de la foto cuidar cuando se recorta.',
  options: [
    { value: 'centro', label: 'Centro' },
    { value: 'arriba', label: 'Arriba (caras, cabezas)' },
    { value: 'abajo', label: 'Abajo' },
  ],
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown) => str(v) || null;

function badLink(values: FormValues, key: string): string[] {
  const href = str(values[key]);
  return href && !isSafeCtaHref(href) ? ['un enlace válido (https://, una página del sitio, mailto: o tel:)'] : [];
}

function showDateLabel(row: StudioRow) {
  const d = showDateParts(row.eventDate);
  const bits = [d ? d.long : 'Sin fecha', showTimeLabel(row.eventTime), row.venue].filter(Boolean);
  return bits.join(' · ');
}

const slides: CollectionConfig = {
  key: 'slides',
  noun: 'esta foto de portada',
  addLabel: 'Agregar foto de portada',
  emptyText: 'Sube la primera foto: horizontal y grande, se ve a pantalla completa.',
  ordered: true,
  liveField: 'active',
  endpoint: '/studio/slides',
  reviewKind: 'slide',
  fields: [
    { key: 'imageUrl', label: 'Foto', type: 'media', ratio: 'Horizontal, de al menos 1920 × 1080' },
    { key: 'title', label: 'Título', type: 'text', placeholder: 'Ej. Escenario, luz y público' },
    { key: 'subtitle', label: 'Texto', type: 'textarea', rows: 2 },
    { key: 'ctaLabel', label: 'Botón', type: 'text', half: true, placeholder: 'Ej. Ver cartelera' },
    { key: 'ctaHref', label: 'Enlace del botón', type: 'link', half: true },
    FOCUS_FIELD,
  ],
  blank: () => ({ imageUrl: '', title: '', subtitle: '', ctaLabel: 'Ver cartelera', ctaHref: '/p/arta/cartelera', focus: 'centro' }),
  fromRow: (r) => ({
    imageUrl: r.imageUrl || '',
    title: r.title || '',
    subtitle: r.subtitle || '',
    ctaLabel: r.ctaLabel || '',
    ctaHref: r.ctaHref || '',
    focus: r.focus || 'centro',
  }),
  toPayload: (v) => ({
    imageUrl: str(v.imageUrl),
    title: str(v.title),
    subtitle: str(v.subtitle),
    ctaLabel: str(v.ctaLabel),
    ctaHref: str(v.ctaHref),
    focus: str(v.focus) || null,
  }),
  required: (v) => (str(v.imageUrl) ? [] : ['la foto']),
  missing: (v) => [...(str(v.imageUrl) ? [] : ['la foto']), ...badLink(v, 'ctaHref')],
  view: (r) => ({
    title: r.title || 'Sin título',
    meta: r.subtitle || undefined,
    thumb: r.imageUrl,
    live: !!r.active,
    inReview: false,
  }),
};

const STATUS_OPTIONS = Object.entries(SHOW_STATUS_LABEL).map(([value, label]) => ({ value, label }));

const shows: CollectionConfig = {
  key: 'shows',
  noun: 'este show',
  addLabel: 'Agregar show',
  emptyText: 'Agrega el primero: póster, fecha, lugar y el enlace de boletos. Tiene su propia página.',
  ordered: false,
  liveField: 'published',
  endpoint: '/studio/news',
  reviewKind: 'news',
  fields: [
    { key: 'coverUrl', label: 'Póster', type: 'media', ratio: 'Vertical: es el arte del show' },
    { key: 'title', label: 'Nombre del show', type: 'text', placeholder: 'Ej. Nombre del artista' },
    { key: 'eventDate', label: 'Fecha', type: 'date', half: true },
    { key: 'eventTime', label: 'Hora', type: 'time', half: true },
    { key: 'venue', label: 'Lugar', type: 'text', half: true, placeholder: 'Ej. Auditorio Explanada' },
    { key: 'city', label: 'Ciudad', type: 'text', half: true, placeholder: 'Ej. Puebla' },
    { key: 'showStatus', label: 'Venta de boletos', type: 'select', half: true, options: STATUS_OPTIONS },
    { key: 'ctaLabel', label: 'Texto del botón', type: 'text', half: true, placeholder: 'Comprar boletos' },
    { key: 'ctaHref', label: 'Enlace de boletos', type: 'link', hint: 'La página donde se compran. El botón solo sale si la venta está abierta.' },
    { key: 'excerpt', label: 'Entrada', type: 'textarea', rows: 2, hint: 'Una o dos líneas. También es lo que se ve al compartir en redes.' },
    { key: 'body', label: 'Texto de la página', type: 'textarea', rows: 6, hint: 'Lo que hay que saber: acceso, edad mínima, estacionamiento… Deja un renglón en blanco entre párrafos.' },
    { key: 'slug', label: 'Dirección de la página', type: 'text', advanced: true, hint: 'Se arma sola con el nombre del show.' },
  ],
  blank: () => ({
    coverUrl: '',
    title: '',
    eventDate: '',
    eventTime: '',
    venue: '',
    city: 'Puebla',
    showStatus: 'venta',
    ctaLabel: 'Comprar boletos',
    ctaHref: '',
    excerpt: '',
    body: '',
    slug: '',
  }),
  fromRow: (r) => ({
    coverUrl: r.coverUrl || '',
    title: r.title || '',
    eventDate: r.eventDate ? String(r.eventDate).slice(0, 10) : '',
    eventTime: r.eventTime || '',
    venue: r.venue || '',
    city: r.city || '',
    showStatus: r.showStatus || 'venta',
    ctaLabel: r.ctaLabel || '',
    ctaHref: r.ctaHref || '',
    excerpt: r.excerpt || '',
    body: r.body || '',
    slug: r.slug || '',
  }),
  toPayload: (v) => ({
    template: 'evento',
    slug: str(v.slug),
    title: str(v.title),
    excerpt: str(v.excerpt),
    body: str(v.body),
    coverUrl: str(v.coverUrl),
    eventDate: orNull(v.eventDate),
    eventTime: orNull(v.eventTime),
    venue: orNull(v.venue),
    city: orNull(v.city),
    showStatus: orNull(v.showStatus),
    ctaLabel: orNull(v.ctaLabel),
    ctaHref: orNull(v.ctaHref),
  }),
  required: (v) => (str(v.title) ? [] : ['el nombre del show']),
  missing: (v) => [
    ...(str(v.title) ? [] : ['el nombre del show']),
    ...(str(v.coverUrl) ? [] : ['el póster']),
    ...(str(v.eventDate) ? [] : ['la fecha']),
    ...(str(v.showStatus) === 'venta' && !str(v.ctaHref) ? ['el enlace de boletos (o cambia la venta a «Próximamente»)'] : []),
    ...badLink(v, 'ctaHref'),
  ],
  view: (r) => ({
    title: r.title,
    meta: showDateLabel(r),
    thumb: r.coverUrl,
    live: !!r.published,
    inReview: !r.published && !!r.reviewRequestedAt,
    href: r.published ? `/p/arta/cartelera/${r.slug}` : undefined,
  }),
};

const news: CollectionConfig = {
  key: 'news',
  noun: 'esta noticia',
  addLabel: 'Agregar noticia',
  emptyText: 'Publica la primera: un anuncio, un detrás de cámaras o el resumen de un show.',
  ordered: true,
  liveField: 'published',
  endpoint: '/studio/news',
  reviewKind: 'news',
  fields: [
    { key: 'coverUrl', label: 'Foto de portada', type: 'media', ratio: 'Horizontal' },
    { key: 'title', label: 'Título', type: 'text', placeholder: 'Ej. Así se vivió el concierto de anoche' },
    { key: 'excerpt', label: 'Entrada', type: 'textarea', rows: 2, hint: 'Una o dos líneas que enganchen: es lo que se ve en la tarjeta y al compartir en redes.' },
    { key: 'body', label: 'Texto', type: 'textarea', rows: 8, hint: 'Cuenta la historia en 2 a 4 párrafos cortos. Deja un renglón en blanco entre párrafos.' },
    { key: 'ctaLabel', label: 'Botón (opcional)', type: 'text', half: true },
    { key: 'ctaHref', label: 'Enlace del botón', type: 'link', half: true },
    { key: 'slug', label: 'Dirección de la página', type: 'text', advanced: true, hint: 'Se arma sola con el título.' },
  ],
  blank: () => ({ coverUrl: '', title: '', excerpt: '', body: '', ctaLabel: '', ctaHref: '', slug: '', template: 'publicacion' }),
  fromRow: (r) => ({
    coverUrl: r.coverUrl || '',
    title: r.title || '',
    excerpt: r.excerpt || '',
    body: r.body || '',
    ctaLabel: r.ctaLabel || '',
    ctaHref: r.ctaHref || '',
    slug: r.slug || '',
    template: r.template || null,
  }),
  toPayload: (v) => ({
    template: orNull(v.template),
    slug: str(v.slug),
    title: str(v.title),
    excerpt: str(v.excerpt),
    body: str(v.body),
    coverUrl: str(v.coverUrl),
    ctaLabel: orNull(v.ctaLabel),
    ctaHref: orNull(v.ctaHref),
  }),
  required: (v) => (str(v.title) ? [] : ['el título']),
  missing: (v) => [
    ...(str(v.title) ? [] : ['el título']),
    ...(str(v.coverUrl) ? [] : ['la foto de portada']),
    ...(str(v.excerpt) ? [] : ['la entrada']),
    ...(str(v.ctaLabel) && !str(v.ctaHref) ? ['el enlace del botón'] : []),
    ...badLink(v, 'ctaHref'),
  ],
  view: (r) => ({
    title: r.title,
    meta: r.excerpt || undefined,
    thumb: r.coverUrl,
    live: !!r.published,
    inReview: !r.published && !!r.reviewRequestedAt,
    href: r.published ? `/p/arta/noticias/${r.slug}` : undefined,
  }),
};

function itemCollection(
  key: 'historia' | 'foto' | 'aliado',
  opts: Pick<CollectionConfig, 'noun' | 'addLabel' | 'emptyText' | 'fields'> & { mediaName: string; titleRequired?: string },
): CollectionConfig {
  return {
    key,
    noun: opts.noun,
    addLabel: opts.addLabel,
    emptyText: opts.emptyText,
    ordered: true,
    liveField: 'active',
    endpoint: '/studio/items',
    reviewKind: 'item',
    fields: opts.fields,
    blank: () => ({ kind: key, mediaUrl: '', mediaType: 'image', title: '', caption: '', linkLabel: '', linkHref: '', focus: 'centro' }),
    fromRow: (r) => ({
      kind: key,
      mediaUrl: r.mediaUrl || '',
      mediaType: r.mediaType || 'image',
      title: r.title || '',
      caption: r.caption || '',
      linkLabel: r.linkLabel || '',
      linkHref: r.linkHref || '',
      focus: r.focus || 'centro',
    }),
    toPayload: (v) => ({
      kind: key,
      mediaUrl: str(v.mediaUrl),
      mediaType: str(v.mediaType) || 'image',
      title: str(v.title),
      caption: str(v.caption),
      linkLabel: str(v.linkLabel),
      linkHref: str(v.linkHref),
      focus: str(v.focus) || null,
    }),
    required: (v) => (str(v.mediaUrl) ? [] : [opts.mediaName]),
    missing: (v) => [
      ...(str(v.mediaUrl) ? [] : [opts.mediaName]),
      ...(opts.titleRequired && !str(v.title) ? [opts.titleRequired] : []),
      ...(str(v.linkLabel) && !str(v.linkHref) ? ['el enlace del botón'] : []),
      ...badLink(v, 'linkHref'),
    ],
    view: (r) => ({
      title: r.title || 'Sin título',
      meta: r.caption || undefined,
      thumb: r.mediaUrl,
      video: r.mediaType === 'video',
      live: !!r.active,
      inReview: !r.active && !!r.reviewRequestedAt,
    }),
  };
}

export const COLLECTIONS: Record<CollectionKey, CollectionConfig> = {
  slides,
  shows,
  news,
  historia: itemCollection('historia', {
    noun: 'esta historia',
    addLabel: 'Agregar historia',
    mediaName: 'la foto o el video',
    emptyText: 'Sube la primera: una foto o un video vertical. Mientras no haya ninguna, la sección no sale en el sitio.',
    fields: [
      { key: 'mediaUrl', label: 'Foto o video', type: 'media', video: true, ratio: 'Vertical, como en Instagram (9:16)' },
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Ej. Así montamos el escenario' },
      { key: 'caption', label: 'Texto', type: 'textarea', rows: 2 },
      { key: 'linkLabel', label: 'Botón (opcional)', type: 'text', half: true },
      { key: 'linkHref', label: 'Enlace del botón', type: 'link', half: true },
      FOCUS_FIELD,
    ],
  }),
  foto: itemCollection('foto', {
    noun: 'esta foto',
    addLabel: 'Agregar foto',
    mediaName: 'la foto',
    emptyText: 'Sube la primera. Mientras no haya ninguna, la galería no sale en el sitio.',
    fields: [
      { key: 'mediaUrl', label: 'Foto', type: 'media', ratio: 'La primera de cada grupo sale más grande' },
      { key: 'title', label: 'Título (opcional)', type: 'text', placeholder: 'Ej. Nombre del show, 2026' },
      { key: 'caption', label: 'Texto (opcional)', type: 'text' },
      FOCUS_FIELD,
    ],
  }),
  aliado: itemCollection('aliado', {
    noun: 'este aliado',
    addLabel: 'Agregar aliado',
    mediaName: 'el logo',
    titleRequired: 'el nombre',
    emptyText: 'Sube el primer logo, de preferencia PNG con fondo transparente. Mientras no haya ninguno, la sección no sale.',
    fields: [
      { key: 'mediaUrl', label: 'Logo', type: 'media', ratio: 'PNG con fondo transparente' },
      { key: 'title', label: 'Nombre', type: 'text' },
      { key: 'linkHref', label: 'Enlace a su sitio (opcional)', type: 'link' },
    ],
  }),
};
