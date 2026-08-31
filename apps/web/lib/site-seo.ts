import type { Metadata } from 'next';
import { ROOT_DOMAIN } from '@/lib/domains';

export const SITE_NAME = 'Arta Producciones';
export const SITE_TAGLINE = 'La experiencia del Show';
export const SITE_DESCRIPTION =
  'Producción integral de conciertos y eventos en Puebla y México: checklists, campaña, boletera, corrida financiera y cierre con firmas digitales. Arta Producciones y Auditorio Arema Explanada.';

export const SITE_KEYWORDS = [
  'Arta Producciones',
  'producción de eventos',
  'conciertos Puebla',
  'productora de shows',
  'Auditorio Arema',
  'Explanada Puebla',
  'producción escénica',
  'eventos en vivo',
  'gestión de eventos',
  'productora musical México',
];

export const CONTACT_EMAIL = 'contacto@artaproducciones.com';

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

type BuildMetadataOpts = {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: 'website' | 'article';
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noIndex?: boolean;
};

/** Metadatos completos para sitio público y noticias (OG, Twitter, canonical). */
export function buildPublicMetadata(opts: BuildMetadataOpts): Metadata {
  const {
    title,
    description = SITE_DESCRIPTION,
    path = '/p/arta',
    image,
    type = 'website',
    publishedTime,
    modifiedTime,
    noIndex = false,
  } = opts;

  const url = absoluteUrl(path);
  const ogImage = absoluteMediaUrl(image) || absoluteUrl('/brand/arta-logo.png');

  return {
    title,
    description,
    keywords: SITE_KEYWORDS,
    authors: [{ name: SITE_NAME, url: siteOrigin() }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: 'Entretenimiento',
    alternates: {
      canonical: url,
    },
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
      images: [
        {
          url: ogImage,
          width: type === 'article' ? 1200 : 1200,
          height: type === 'article' ? 630 : 630,
          alt: title,
        },
      ],
      ...(type === 'article' && publishedTime
        ? { publishedTime, modifiedTime: modifiedTime || publishedTime }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      site: '@artaproducciones',
      creator: '@artaproducciones',
      title,
      description,
      images: [ogImage],
    },
  };
}

export function socialSameAs(): string[] {
  const urls = [
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    process.env.NEXT_PUBLIC_SOCIAL_TWITTER,
    'https://arta.artaproducciones.com',
    'https://auditorio.artaproducciones.com',
  ];
  return urls.filter((u): u is string => Boolean(u?.trim()));
}

export function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${siteOrigin()}/#organization`,
    name: SITE_NAME,
    alternateName: ['ARTA', 'Arta Producciones S.A. de C.V.'],
    url: siteOrigin(),
    logo: absoluteUrl('/brand/arta-logo.png'),
    description: SITE_DESCRIPTION,
    email: CONTACT_EMAIL,
    areaServed: { '@type': 'Country', name: 'México' },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Puebla',
      addressRegion: 'Puebla',
      addressCountry: 'MX',
    },
    sameAs: socialSameAs(),
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${siteOrigin()}/#website`,
    name: SITE_NAME,
    url: siteOrigin(),
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${siteOrigin()}/#organization` },
    inLanguage: 'es-MX',
  };
}

export function localBusinessNode() {
  const address =
    process.env.NEXT_PUBLIC_VENUE_ADDRESS ||
    'Auditorio Arema Explanada, Puebla, Puebla, México';
  const lat = process.env.NEXT_PUBLIC_VENUE_LAT ? Number(process.env.NEXT_PUBLIC_VENUE_LAT) : 19.0414;
  const lng = process.env.NEXT_PUBLIC_VENUE_LNG ? Number(process.env.NEXT_PUBLIC_VENUE_LNG) : -98.2063;
  return {
    '@type': ['EntertainmentBusiness', 'LocalBusiness'],
    '@id': `${siteOrigin()}/#venue-explanada`,
    name: 'Auditorio Arema Explanada',
    parentOrganization: { '@id': `${siteOrigin()}/#organization` },
    url: 'https://auditorio.artaproducciones.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: address,
      addressLocality: process.env.NEXT_PUBLIC_CITY || 'Puebla',
      addressRegion: process.env.NEXT_PUBLIC_STATE || 'Puebla',
      addressCountry: 'MX',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng,
    },
  };
}

export function webPageNode(path = '/p/arta', name?: string) {
  const url = absoluteUrl(path);
  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: name || `${SITE_TAGLINE} · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    isPartOf: { '@id': `${siteOrigin()}/#website` },
    about: { '@id': `${siteOrigin()}/#organization` },
    inLanguage: 'es-MX',
  };
}

/** Unified JSON-LD @graph for the public home page. */
export function homePageGraphJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationNode(), websiteNode(), webPageNode('/p/arta'), localBusinessNode()],
  };
}

/** @graph for a news article page. */
export function newsArticleGraphJsonLd(post: PublicNewsPost) {
  const url = absoluteUrl(`/p/arta/noticias/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      websiteNode(),
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.excerpt || SITE_DESCRIPTION,
        image: absoluteMediaUrl(post.coverUrl)
          ? [absoluteMediaUrl(post.coverUrl)]
          : [absoluteUrl('/brand/arta-logo.png')],
        datePublished: post.publishedAt || undefined,
        dateModified: post.updatedAt || post.publishedAt || undefined,
        author: { '@id': `${siteOrigin()}/#organization` },
        publisher: { '@id': `${siteOrigin()}/#organization` },
        mainEntityOfPage: { '@id': `${url}#webpage` },
        url,
        inLanguage: 'es-MX',
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: post.title,
        isPartOf: { '@id': `${siteOrigin()}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluteUrl('/p/arta') },
          { '@type': 'ListItem', position: 2, name: 'Noticias', item: absoluteUrl('/p/arta#noticias') },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  };
}

/** @deprecated Use organizationNode() inside @graph */
export function organizationJsonLd() {
  return { '@context': 'https://schema.org', ...organizationNode() };
}

/** @deprecated Use websiteNode() inside @graph — no fake SearchAction */
export function websiteJsonLd() {
  return { '@context': 'https://schema.org', ...websiteNode() };
}

export function articleJsonLd(post: PublicNewsPost) {
  const url = absoluteUrl(`/p/arta/noticias/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.excerpt || SITE_DESCRIPTION,
    image: absoluteMediaUrl(post.coverUrl) ? [absoluteMediaUrl(post.coverUrl)] : [absoluteUrl('/brand/arta-logo.png')],
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || post.publishedAt || undefined,
    author: { '@type': 'Organization', name: SITE_NAME, url: siteOrigin() },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/brand/arta-logo.png') },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    inLanguage: 'es-MX',
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
