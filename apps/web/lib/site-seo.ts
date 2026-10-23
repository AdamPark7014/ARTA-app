import type { Metadata } from 'next';
import { ROOT_DOMAIN } from '@/lib/domains';
import {
  FALLBACK_MODULE_TILES,
  type PublicSiteData,
  type PublicSiteTile,
} from '@/lib/public-site-data';

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
};

export async function fetchPublicNews(slug: string): Promise<PublicNewsPost | null> {
  try {
    const res = await fetch(`${apiBase()}/studio/public/news/${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicNewsPost;
  } catch {
    return null;
  }
}

/**
 * Redes sociales de Arta. Solo las configuradas en el build, y el pie del sitio las muestra todas:
 * `sameAs` nunca lleva un perfil que el visitante no pueda ver (ni uno inventado).
 */
export function socialProfiles(): Array<{ label: string; url: string }> {
  const candidates: Array<[string, string | undefined]> = [
    ['Instagram', process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM],
    ['Facebook', process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK],
    ['YouTube', process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE],
    ['TikTok', process.env.NEXT_PUBLIC_SOCIAL_TIKTOK],
    ['X', process.env.NEXT_PUBLIC_SOCIAL_TWITTER],
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
export function organizationNode() {
  const logoUrl = absoluteUrl(LOGO_IMAGE.url);
  const sameAs = socialProfiles().map((p) => p.url);
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
    email: CONTACT.email,
    ...(CONTACT.phone ? { telephone: CONTACT.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: CONTACT.city,
      addressRegion: CONTACT.state,
      addressCountry: 'MX',
    },
    areaServed: [
      { '@type': 'State', name: 'Puebla' },
      { '@type': 'Country', name: 'México' },
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: CONTACT.email,
      ...(CONTACT.phone ? { telephone: CONTACT.phone } : {}),
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

/** Preguntas visibles en `/p/arta#faq` (la sección las pinta de aquí mismo). */
export const PUBLIC_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: '¿Qué hace Arta Producciones?',
    answer:
      'Producción integral de conciertos y eventos: checklists operativos, hospitality, campaña, boletera, corrida financiera y cierre con firmas digitales.',
  },
  {
    question: '¿Dónde opera Arta?',
    answer:
      'Base operativa en Puebla, Puebla (México), con venue aliado Auditorio Arema Explanada y shows en la región.',
  },
  {
    question: '¿Qué incluye la operación del evento?',
    answer:
      'Producción técnica, hospitality, comercial (boletera y patrocinios), artes/campaña autorizada y cierre financiero con órdenes de compra y anticipos.',
  },
  {
    question: '¿Cómo contacto a Arta para un show?',
    answer: `Escríbenos a ${CONTACT.email} con fecha, venue y alcance. Respondemos con una propuesta de producción.`,
  },
];

export function faqPageNode() {
  const home = absoluteUrl(HOME_PATH);
  return {
    '@type': 'FAQPage',
    '@id': `${home}#faq-page`,
    url: `${home}#faq`,
    isPartOf: { '@id': WEBSITE_ID() },
    inLanguage: 'es-MX',
    mainEntity: PUBLIC_FAQ.map((item) => ({
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

/** `@graph` de la portada con lo que la página realmente muestra (Studio). */
export function homePageGraphJsonLd(data?: Pick<PublicSiteData, 'pages'>) {
  const mods = data?.pages.find((p) => p.sectionKey === 'home_modulos')?.contentJson;
  const tiles = mods?.tiles?.length ? mods.tiles : FALLBACK_MODULE_TILES;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      webPageNode({
        path: HOME_PATH,
        name: `${SITE_NAME} · ${SITE_TAGLINE}`,
        mentions: [{ '@id': VENUE_ID() }],
      }),
      venueNode(),
      faqPageNode(),
      ...serviceNodes(tiles),
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
          { name: 'Noticias', path: `${HOME_PATH}#noticias` },
          { name: post.title, path },
        ],
      }),
      breadcrumbNode(url, [
        { name: 'Inicio', path: HOME_PATH },
        { name: 'Noticias', path: `${HOME_PATH}#noticias` },
        { name: post.title, path },
      ]),
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
