/**
 * Plantillas de publicación de Studio (junta 23-10-2026: «Montse redes sociales: plantilla de
 * página web y acceso para practicantes»).
 *
 * Studio no crea páginas sueltas: cada noticia ya es una página propia del sitio
 * (`/p/arta/noticias/:slug`), sale en «Noticias» del inicio y en el feed. Una plantilla dice qué
 * campos lleva esa página y deja el texto guía para que el practicante solo lo llene:
 *
 *   - «Publicación / noticia»: portada, título, entrada, texto y botón opcional.
 *   - «Evento destacado»: lo mismo más la fecha del show y el botón de boletos.
 *
 * La API guarda `template`, `eventDate`, `ctaLabel` y `ctaHref` en la noticia
 * (apps/api/src/studio/studio.controller.ts · NEWS_TEMPLATES).
 */
export type NewsTemplateKey = 'publicacion' | 'evento';

export type NewsTemplate = {
  key: NewsTemplateKey;
  label: string;
  description: string;
  /** Texto guía de cada campo (placeholder). */
  hints: { title: string; excerpt: string; body: string };
  /** Arranque del texto, solo si el cuerpo está vacío al elegir la plantilla. */
  bodyStarter: string;
  cta: { label: string; href: string };
  requiresCover: boolean;
  requiresEventDate: boolean;
};

export const NEWS_TEMPLATES: NewsTemplate[] = [
  {
    key: 'publicacion',
    label: 'Publicación / noticia',
    description: 'Una novedad de Arta: anuncio, detrás de cámaras, logro del equipo o resumen de un show.',
    hints: {
      title: 'Ej. «Así se vivió el concierto de anoche»',
      excerpt: 'Una o dos líneas que enganchen: es lo que se ve en la tarjeta y al compartir en redes.',
      body: 'Cuenta la historia en 2 a 4 párrafos cortos.',
    },
    bodyStarter: '¿Qué pasó? (una o dos frases)\n\nDetalles que importan al público.\n\nCierre o invitación.',
    cta: { label: '', href: '' },
    requiresCover: true,
    requiresEventDate: false,
  },
  {
    key: 'evento',
    label: 'Evento destacado',
    description: 'Un show que viene: fecha, lugar y el botón para comprar boletos.',
    hints: {
      title: 'Ej. «Artista en el Auditorio Explanada · 21 de noviembre»',
      excerpt: 'Quién, cuándo y dónde, en una línea.',
      body: 'Fecha y hora, lugar, precios o zonas y cómo llegar.',
    },
    bodyStarter:
      'Fecha y hora: \nLugar: \nBoletos: (precios / zonas / preventa)\n\nLo que hay que saber: (acceso, edad mínima, estacionamiento)',
    cta: { label: 'Comprar boletos', href: '' },
    requiresCover: true,
    requiresEventDate: true,
  },
];

export function newsTemplate(key?: string | null): NewsTemplate | null {
  return NEWS_TEMPLATES.find((t) => t.key === key) ?? null;
}

export type NewsDraft = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverUrl: string;
  template: NewsTemplateKey | '';
  eventDate: string;
  ctaLabel: string;
  ctaHref: string;
};

/** Una dirección libre para una publicación nueva: `concierto`, `concierto-2`… */
export function uniqueSlug(title: string, taken: string[]): string {
  const base = slugify(title) || 'publicacion';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Mismo criterio que la API (isSafeCtaHref): web, ruta del sitio, ancla, correo o teléfono. */
export function isSafeCtaHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return !/\s/.test(value);
  return /^[/#]/.test(value) && !value.startsWith('//');
}

/** Lo que le falta a la publicación para mandarla a revisión (o publicarla). Vacío = lista. */
export function missingForNews(draft: NewsDraft): string[] {
  const out: string[] = [];
  const tpl = newsTemplate(draft.template);
  if (!draft.title.trim()) out.push('título');
  if (!draft.slug.trim()) out.push('slug');
  if (!draft.excerpt.trim()) out.push('entrada');
  if (tpl?.requiresCover && !draft.coverUrl.trim()) out.push('portada');
  if (tpl?.requiresEventDate && !draft.eventDate) out.push('fecha del show');
  if (draft.ctaLabel.trim() && !draft.ctaHref.trim()) out.push('enlace del botón');
  if (draft.ctaHref.trim() && !isSafeCtaHref(draft.ctaHref)) out.push('enlace del botón válido (https://, /, #, mailto:)');
  return out;
}

/** Slug de URL a partir del título (sin acentos ni signos). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Fecha del show para mostrar (la API la guarda a mediodía UTC: se pinta en UTC para no correrla). */
export function eventDateLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
