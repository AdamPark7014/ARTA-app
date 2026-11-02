import type { Metadata } from 'next';
import { ROOT_DOMAIN } from '@/lib/domains';
import {
  SITE_CACHE,
  sectionContent,
  siteSettings,
  type PublicSiteContent,
  type PublicSiteData,
  type PublicSiteFaq,
  type PublicSiteNewsItem,
  type PublicSiteTile,
} from '@/lib/public-site-data';
import { BLOCK_META, DEFAULT_CONTENT, LAYOUT_KEY, resolveLayout } from '@/lib/site-blocks';

export const SITE_NAME = 'Arta Producciones';
export const SITE_TAGLINE = 'La experiencia del Show';
/** Descripción por omisión (≤160 caracteres: lo que cabe en el resultado de Google). */
export const SITE_DESCRIPTION =
  'Arta Producciones: producción integral de conciertos y eventos en Puebla. Producción técnica, hospitality, boletera, campaña y cierre de cada show.';

export const SITE_KEYWORDS = [
  'Arta Producciones',
  'producción de eventos',
  'conciertos Puebla',
  'productora de shows',
  'Auditorio Arema',
  'Explanada Puebla',
  'producción escénica',
  'eventos en vivo',
  'productora musical México',
];

/** Ruta canónica de la portada (`/` redirige aquí). */
export const HOME_PATH = '/p/arta';

/**
 * Datos de contacto que el sitio MUESTRA. Los datos estructurados salen de aquí mismo, así que nunca
 * publican algo que el visitante no vea (teléfono solo si está configurado y visible).
 */
export const CONTACT = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'contacto@artaproducciones.com',
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || '',
  city: process.env.NEXT_PUBLIC_CITY?.trim() || 'Puebla',
  state: process.env.NEXT_PUBLIC_STATE?.trim() || 'Puebla',
};
export const CONTACT_EMAIL = CONTACT.email;

/**
 * Lo que dice «Datos del sitio» en Studio manda; lo que no se haya llenado cae a las variables del
 * build. El pie, la sección de contacto y el JSON-LD salen de aquí, así que siempre coinciden.
 */
export function contactFromSettings(settings?: PublicSiteContent) {
  return {
    email: settings?.email?.trim() || CONTACT.email,
    phone: settings?.phone?.trim() || CONTACT.phone,
    whatsapp: settings?.whatsapp?.trim() || '',
    city: settings?.city?.trim() || CONTACT.city,
    state: CONTACT.state,
  };
}

export const VENUE_NAME = 'Auditorio Arema Explanada';
/** Texto de ubicación visible en `#ubicacion`. */
export const VENUE_ADDRESS =
  process.env.NEXT_PUBLIC_VENUE_ADDRESS?.trim() || 'Auditorio Arema Explanada, Puebla, Puebla, México';

/** Imagen para compartir (1200×630, papel y tinta) generada desde `brand/arta-logo-ink.png`. */
export const OG_IMAGE = {
  url: '/brand/og-arta.png',
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} · ${SITE_TAGLINE}`,
};

/** Logo en tinta: Google lo pinta sobre blanco, el blanco (`arta-logo.png`) ahí no se ve. */
export const LOGO_IMAGE = { url: '/brand/arta-logo-ink.png', width: 1200, height: 652 };

export function siteOrigin(): string {
  return `https://${ROOT_DOMAIN}`;
}

export function absoluteUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin()}${clean}`;
}

export function absoluteMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return absoluteUrl(url.startsWith('/') ? url : `/${url}`);
}

export const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type PublicNewsPost = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  /** Plantilla de Studio (publicacion | evento) y sus campos (junta 23-10-2026). */
  template?: string | null;
  eventDate?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  venue?: string | null;
  city?: string | null;
  eventTime?: string | null;
  showStatus?: string | null;
  sortOrder?: number | null;
};

export async function fetchPublicNews(slug: string): Promise<PublicNewsPost | null> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news/${encodeURIComponent(slug)}`, {
      next: SITE_CACHE,
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicNewsPost;
  } catch {
    return null;
  }
}

/**
 * Redes sociales de Arta: las de «Datos del sitio» en Studio y, si no, las del build. El pie del
 * sitio las muestra todas: `sameAs` nunca lleva un perfil que el visitante no pueda ver (ni uno inventado).
 */
export function socialProfiles(settings?: PublicSiteContent): Array<{ label: string; url: string }> {
  const candidates: Array<[string, string | undefined]> = [
    ['Instagram', settings?.instagram || process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM],
    ['Facebook', settings?.facebook || process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK],
    ['TikTok', settings?.tiktok || process.env.NEXT_PUBLIC_SOCIAL_TIKTOK],
    ['YouTube', settings?.youtube || process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE],
    ['Spotify', settings?.spotify],
    ['X', settings?.x || process.env.NEXT_PUBLIC_SOCIAL_TWITTER],
  ];
  return candidates
    .map(([label, url]) => ({ label, url: url?.trim() || '' }))
    .filter((p) => /^https:\/\//i.test(p.url));
}

/** `@usuario` de X a partir de la URL configurada; vacío si no hay perfil. */
function twitterHandle(): string | undefined {
  const url = socialProfiles().find((p) => p.label === 'X')?.url;
  const handle = url?.match(/(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})/i)?.[1];
  return handle ? `@${handle}` : undefined;
}

type BuildMetadataOpts = {
  title: string;
  description?: string;
  path?: string;
  /** Imagen propia de la página (portada de noticia); la de marca queda como respaldo. */
  image?: string | null;
  imageAlt?: string;
  type?: 'website' | 'article';
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noIndex?: boolean;
  /** true = el título va tal cual, sin « · Arta Producciones» (portada). */
  absoluteTitle?: boolean;
};

/** Metadatos completos del sitio público (canonical, Open Graph, tarjeta de X, robots). */
export function buildPublicMetadata(opts: BuildMetadataOpts): Metadata {
  const {
    title,
    description = SITE_DESCRIPTION,
    path = HOME_PATH,
    image,
    imageAlt,
    type = 'website',
    publishedTime,
    modifiedTime,
    noIndex = false,
    absoluteTitle = false,
  } = opts;

  const url = absoluteUrl(path);
  const brandImage = {
    url: absoluteUrl(OG_IMAGE.url),
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: OG_IMAGE.alt,
  };
  const own = absoluteMediaUrl(image);
  const images = own ? [{ url: own, alt: imageAlt || title }, brandImage] : [brandImage];
  const handle = twitterHandle();

  return {
    // Con `absolute` hay que repetir la plantilla: si no, las páginas hijas (noticias) la pierden.
    title: absoluteTitle ? { absolute: title, template: `%s · ${SITE_NAME}` } : title,
    description,
    keywords: SITE_KEYWORDS,
    authors: [{ name: SITE_NAME, url: `${siteOrigin()}/` }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'Entretenimiento',
    // Sin hreflang: el sitio solo existe en español de México (no hay versiones alternas).
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
    openGraph: {
      type,
      locale: 'es_MX',
      url,
      siteName: SITE_NAME,
      title,
      description,
      images,
      ...(type === 'article' && publishedTime
        ? { publishedTime, modifiedTime: modifiedTime || publishedTime }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      ...(handle ? { site: handle, creator: handle } : {}),
      title,
      description,
      images: [{ url: images[0].url, alt: images[0].alt }],
    },
  };
}

// ── Datos estructurados (schema.org) ─────────────────────────────────────────

const ORG_ID = () => `${siteOrigin()}/#organization`;
const WEBSITE_ID = () => `${siteOrigin()}/#website`;
const LOGO_ID = () => `${siteOrigin()}/#logo`;
const VENUE_ID = () => `${siteOrigin()}/#auditorio-arema-explanada`;

type Crumb = { name: string; path: string };

/**
 * Arta como organización y negocio local de producción de eventos (`EventPlanner` es un
 * `LocalBusiness`). Dirección solo a nivel ciudad: es lo que el sitio publica.
 */
export function organizationNode(settings?: PublicSiteContent) {
  const logoUrl = absoluteUrl(LOGO_IMAGE.url);
  const sameAs = socialProfiles(settings).map((p) => p.url);
  const contact = contactFromSettings(settings);
  return {
    '@type': ['Organization', 'EventPlanner'],
    '@id': ORG_ID(),
    name: SITE_NAME,
    alternateName: 'ARTA',
    slogan: SITE_TAGLINE,
    url: `${siteOrigin()}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': LOGO_ID(),
      url: logoUrl,
      contentUrl: logoUrl,
      width: LOGO_IMAGE.width,
      height: LOGO_IMAGE.height,
      caption: SITE_NAME,
    },
    image: absoluteUrl(OG_IMAGE.url),
    description: SITE_DESCRIPTION,
    email: contact.email,
    ...(contact.phone ? { telephone: contact.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: contact.city,
      addressRegion: contact.state,
      addressCountry: 'MX',
    },
    areaServed: [
      { '@type': 'State', name: 'Puebla' },
      { '@type': 'Country', name: 'México' },
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: contact.email,
      ...(contact.phone ? { telephone: contact.phone } : {}),
      areaServed: 'MX',
      availableLanguage: ['es'],
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID(),
    name: SITE_NAME,
    alternateName: 'ARTA',
    url: `${siteOrigin()}/`,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORG_ID() },
    inLanguage: 'es-MX',
  };
}

/**
 * Auditorio Arema Explanada tal como lo muestra `#ubicacion`: nombre y ciudad. Coordenadas solo si el
 * build las trae configuradas (las de respaldo del mapa no son la ubicación real del recinto).
 */
export function venueNode() {
  const lat = Number(process.env.NEXT_PUBLIC_VENUE_LAT);
  const lng = Number(process.env.NEXT_PUBLIC_VENUE_LNG);
  const hasGeo = Boolean(process.env.NEXT_PUBLIC_VENUE_LAT && process.env.NEXT_PUBLIC_VENUE_LNG) &&
    Number.isFinite(lat) && Number.isFinite(lng);
  return {
    '@type': 'EventVenue',
    '@id': VENUE_ID(),
    name: VENUE_NAME,
    address: {
      '@type': 'PostalAddress',
      ...(process.env.NEXT_PUBLIC_VENUE_ADDRESS?.trim() ? { streetAddress: VENUE_ADDRESS } : {}),
      addressLocality: CONTACT.city,
      addressRegion: CONTACT.state,
      addressCountry: 'MX',
    },
    ...(hasGeo ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
  };
}

function breadcrumbNode(pageUrl: string, crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

type WebPageOpts = {
  path: string;
  name: string;
  description?: string;
  crumbs?: Crumb[];
  mentions?: Array<{ '@id': string }>;
  type?: string;
};

export function webPageNode({ path, name, description, crumbs, mentions, type = 'WebPage' }: WebPageOpts) {
  const url = absoluteUrl(path);
  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name,
    description: description || SITE_DESCRIPTION,
    isPartOf: { '@id': WEBSITE_ID() },
    about: { '@id': ORG_ID() },
    publisher: { '@id': ORG_ID() },
    primaryImageOfPage: { '@type': 'ImageObject', url: absoluteUrl(OG_IMAGE.url) },
    inLanguage: 'es-MX',
    ...(crumbs?.length ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    ...(mentions?.length ? { mentions } : {}),
  };
}

/** Preguntas de arranque; las que el visitante ve (y las del JSON-LD) son las de Studio. */
export const PUBLIC_FAQ = DEFAULT_CONTENT.home_faq.faqs as PublicSiteFaq[];

export function faqPageNode(faqs: PublicSiteFaq[] = PUBLIC_FAQ) {
  const home = absoluteUrl(HOME_PATH);
  return {
    '@type': 'FAQPage',
    '@id': `${home}#faq-page`,
    url: `${home}#faq`,
    isPartOf: { '@id': WEBSITE_ID() },
    inLanguage: 'es-MX',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Servicios = las tarjetas visibles de `#modulos` (editables en Studio), no una lista aparte. */
export function serviceNodes(tiles: PublicSiteTile[]) {
  const home = absoluteUrl(HOME_PATH);
  return tiles
    .filter((t) => t.title?.trim())
    .map((t) => ({
      '@type': 'Service',
      '@id': `${home}#servicio-${slugify(t.title)}`,
      name: t.title,
      serviceType: t.title,
      description: t.body,
      provider: { '@id': ORG_ID() },
      areaServed: [
        { '@type': 'State', name: 'Puebla' },
        { '@type': 'Country', name: 'México' },
      ],
      url: `${home}#modulos`,
    }));
}

const EVENT_STATUS: Record<string, string> = {
  cancelado: 'https://schema.org/EventCancelled',
  pospuesto: 'https://schema.org/EventPostponed',
};

const OFFER_AVAILABILITY: Record<string, string> = {
  venta: 'https://schema.org/InStock',
  agotado: 'https://schema.org/SoldOut',
  pronto: 'https://schema.org/PreOrder',
};

/** Un show de la cartelera como evento: Google los enseña con su fecha en los resultados. */
export function showEventNode(show: PublicNewsPost | PublicSiteNewsItem) {
  const url = absoluteUrl(`${HOME_PATH}/cartelera/${show.slug}`);
  const image = absoluteMediaUrl(show.coverUrl);
  const time = show.eventTime && show.eventDate ? `${show.eventDate.slice(0, 10)}T${show.eventTime}:00-06:00` : show.eventDate?.slice(0, 10);
  const status = show.showStatus || (show.ctaHref ? 'venta' : 'pronto');
  return {
    '@type': 'Event',
    '@id': `${url}#evento`,
    name: show.title,
    url,
    ...(time ? { startDate: time } : {}),
    ...(show.excerpt ? { description: show.excerpt } : {}),
    ...(image ? { image: [image] } : {}),
    eventStatus: EVENT_STATUS[status] || 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: show.venue || VENUE_NAME,
      address: {
        '@type': 'PostalAddress',
        addressLocality: show.city || CONTACT.city,
        addressRegion: CONTACT.state,
        addressCountry: 'MX',
      },
    },
    organizer: { '@id': ORG_ID() },
    ...(show.ctaHref && /^https?:/i.test(show.ctaHref) && OFFER_AVAILABILITY[status]
      ? { offers: { '@type': 'Offer', url: show.ctaHref, availability: OFFER_AVAILABILITY[status] } }
      : {}),
  };
}

/** `@graph` de la portada con lo que la página realmente muestra (Studio). */
export function homePageGraphJsonLd(data?: PublicSiteData) {
  const pages = data?.pages ?? [];
  const blocks = resolveLayout(pages.find((p) => p.sectionKey === LAYOUT_KEY)?.contentJson).filter((b) => b.visible);
  const contentOf = (key: string) => sectionContent({ pages }, key);
  const has = (type: keyof typeof BLOCK_META) => blocks.some((b) => b.type === type);
  const settings = siteSettings({ pages });
  const tiles = contentOf('home_modulos').tiles ?? [];
  const faqs = contentOf('home_faq').faqs?.filter((f) => f.question?.trim()) ?? [];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(settings),
      websiteNode(),
      webPageNode({
        path: HOME_PATH,
        name: `${SITE_NAME} · ${SITE_TAGLINE}`,
        mentions: [{ '@id': VENUE_ID() }],
      }),
      venueNode(),
      ...(has('faq') && faqs.length ? [faqPageNode(faqs)] : []),
      ...(has('servicios') ? serviceNodes(tiles) : []),
      ...(has('cartelera') ? (data?.shows ?? []).map(showEventNode) : []),
    ],
  };
}

/** `@graph` de una noticia publicada en Studio. */
export function newsArticleGraphJsonLd(post: PublicNewsPost) {
  const path = `${HOME_PATH}/noticias/${post.slug}`;
  const url = absoluteUrl(path);
  const cover = absoluteMediaUrl(post.coverUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        headline: post.title.slice(0, 110),
        description: post.excerpt || SITE_DESCRIPTION,
        image: [cover || absoluteUrl(OG_IMAGE.url)],
        ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
        ...(post.updatedAt || post.publishedAt
          ? { dateModified: post.updatedAt || post.publishedAt }
          : {}),
        author: { '@id': ORG_ID() },
        publisher: { '@id': ORG_ID() },
        mainEntityOfPage: { '@id': `${url}#webpage` },
        isPartOf: { '@id': `${url}#webpage` },
        url,
        inLanguage: 'es-MX',
      },
      webPageNode({
        path,
        name: post.title,
        description: post.excerpt || undefined,
        crumbs: [
          { name: 'Inicio', path: HOME_PATH },
          { name: 'Noticias', path: `${HOME_PATH}/noticias` },
          { name: post.title, path },
        ],
      }),
      breadcrumbNode(url, [
        { name: 'Inicio', path: HOME_PATH },
        { name: 'Noticias', path: `${HOME_PATH}/noticias` },
        { name: post.title, path },
      ]),
    ],
  };
}

/** `@graph` de un show: el evento, su página y las migas desde la cartelera. */
export function showGraphJsonLd(show: PublicNewsPost) {
  const path = `${HOME_PATH}/cartelera/${show.slug}`;
  const url = absoluteUrl(path);
  const crumbs: Crumb[] = [
    { name: 'Inicio', path: HOME_PATH },
    { name: 'Cartelera', path: `${HOME_PATH}/cartelera` },
    { name: show.title, path },
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      showEventNode(show),
      webPageNode({ path, name: show.title, description: show.excerpt || undefined, crumbs }),
      breadcrumbNode(url, crumbs),
    ],
  };
}

/** `@graph` de una página suelta (contratar, legales): página + migas desde la portada. */
export function simplePageGraphJsonLd(opts: { path: string; name: string; description?: string }) {
  const url = absoluteUrl(opts.path);
  const crumbs: Crumb[] = [
    { name: 'Inicio', path: HOME_PATH },
    { name: opts.name, path: opts.path },
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      webPageNode({ path: opts.path, name: opts.name, description: opts.description, crumbs }),
      breadcrumbNode(url, crumbs),
    ],
  };
}
