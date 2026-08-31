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

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
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
    sameAs: [
      'https://arta.artaproducciones.com',
      'https://auditorio.artaproducciones.com',
    ],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteOrigin()}/#website`,
    name: SITE_NAME,
    url: siteOrigin(),
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${siteOrigin()}/#organization` },
    inLanguage: 'es-MX',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/p/arta')}#noticias`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
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
