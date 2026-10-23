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
      <article className="site-section news-article">
        <div className="news-article__inner">
          <time
            className="muted news-article__date"
            dateTime={post.publishedAt || undefined}
          >
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : ''}
          </time>
          <h1 className="news-article__title">{post.title}</h1>
          {post.excerpt ? (
            <p className="lead news-article__excerpt">{post.excerpt}</p>
          ) : null}
          {post.coverUrl ? (
            <div className="news-article__cover">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica de Studio */}
              <img src={post.coverUrl} alt={post.title} width={1280} height={720} decoding="async" />
            </div>
          ) : null}
          {post.body ? (
            <div className="article-prose">{post.body}</div>
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
