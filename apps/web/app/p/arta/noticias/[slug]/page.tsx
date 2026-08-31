import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  buildPublicMetadata,
  fetchPublicNews,
  newsArticleGraphJsonLd,
} from '@/lib/site-seo';
import { NewsArticleView } from './NewsArticleView';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await fetchPublicNews(params.slug);
  if (!post) {
    return buildPublicMetadata({
      title: 'Noticia no encontrada',
      description: 'La noticia que buscas no está disponible.',
      path: `/p/arta/noticias/${params.slug}`,
      noIndex: true,
    });
  }

  const description =
    post.excerpt?.trim() ||
    post.body?.slice(0, 160).trim() ||
    `${post.title} — Arta Producciones`;

  return buildPublicMetadata({
    title: post.title,
    description,
    path: `/p/arta/noticias/${post.slug}`,
    image: post.coverUrl,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt || post.publishedAt,
  });
}

export default async function NewsDetailPage({ params }: Props) {
  const post = await fetchPublicNews(params.slug);

  return (
    <>
      {post ? <JsonLd data={newsArticleGraphJsonLd(post)} /> : null}
      <NewsArticleView post={post} />
    </>
  );
}
