import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { NoticiaView, NotFoundView } from '@/components/site/SiteViews';
import { pageHref } from '@/lib/site-blocks';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import {
  HOME_PATH,
  buildPublicMetadata,
  fetchPublicNews,
  newsArticleGraphJsonLd,
} from '@/lib/site-seo';

type Props = { params: { slug: string } };

/** Corta en palabra completa para que la descripción no termine a media palabra. */
function snippet(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).trim()}…`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await fetchPublicNews(params.slug);
  if (!post) {
    return buildPublicMetadata({
      title: 'Noticia no encontrada',
      description: 'La noticia que buscas no está disponible.',
      path: `${HOME_PATH}/noticias/${params.slug}`,
      noIndex: true,
    });
  }

  const description = snippet(
    post.excerpt?.trim() || post.body?.trim() || `${post.title} — Arta Producciones`,
  );

  return buildPublicMetadata({
    title: post.title,
    description,
    path: `${HOME_PATH}/noticias/${post.slug}`,
    image: post.coverUrl,
    imageAlt: post.title,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt || post.publishedAt,
  });
}

export default async function NewsDetailPage({ params }: Props) {
  const [post, data] = await Promise.all([fetchPublicNews(params.slug), fetchPublicSiteData('ARTA')]);
  if (isPageOff(data, 'noticias')) notFound();
  // Un show publicado antes de la cartelera conserva su liga vieja: la dirección buena es esta.
  if (post?.template === 'evento') redirect(`${HOME_PATH}/cartelera/${post.slug}`);

  if (!post) {
    return (
      <NotFoundView
        data={data}
        title="Noticia no encontrada"
        text="El enlace puede estar desactualizado o la noticia fue retirada."
        href={pageHref('noticias')}
        linkLabel="Ver todas las noticias"
      />
    );
  }
  return (
    <>
      <JsonLd data={newsArticleGraphJsonLd(post)} />
      <NoticiaView data={data} post={post} />
    </>
  );
}
