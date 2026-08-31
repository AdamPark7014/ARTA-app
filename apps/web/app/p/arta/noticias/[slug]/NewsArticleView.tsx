import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PublicNewsPost } from '@/lib/site-seo';

type NewsArticleViewProps = {
  post: PublicNewsPost | null;
};

export function NewsArticleView({ post }: NewsArticleViewProps) {
  if (!post) {
    return (
      <div className="site site-arta">
        <SiteHeader mode="article" />
        <article className="site-section news-article">
          <EmptyState
            title="Noticia no encontrada"
            description="El enlace puede estar desactualizado o la noticia fue retirada."
            actionHref="/p/arta#noticias"
            actionLabel="Ver todas las noticias"
          />
        </article>
      </div>
    );
  }

  return (
    <div className="site site-arta">
      <SiteHeader mode="article" />
      <article className="site-section news-article" itemScope itemType="https://schema.org/NewsArticle">
        <div className="news-article__inner">
          <time
            className="muted news-article__date"
            dateTime={post.publishedAt || undefined}
            itemProp="datePublished"
          >
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : ''}
          </time>
          <h1 className="news-article__title" itemProp="headline">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="lead news-article__excerpt" itemProp="description">
              {post.excerpt}
            </p>
          ) : null}
          {post.coverUrl ? (
            <div className="news-article__cover">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica de Studio */}
              <img src={post.coverUrl} alt={post.title} itemProp="image" />
            </div>
          ) : null}
          {post.body ? (
            <div className="article-prose" itemProp="articleBody">
              {post.body}
            </div>
          ) : null}
        </div>
      </article>
      <footer className="news-article__footer">
        <Link className="btn ghost" href="/p/arta#noticias">
          ← Todas las noticias
        </Link>
        <Link className="btn" href="/p/arta#contacto">
          Contactar a Arta
        </Link>
      </footer>
    </div>
  );
}
