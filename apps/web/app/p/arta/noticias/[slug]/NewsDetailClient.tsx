'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SiteHeader } from '@/components/site/SiteHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';

type NewsPost = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
};

function NewsShell({ children }: { children: ReactNode }) {
  return (
    <div className="site site-arta">
      <SiteHeader mode="article" />
      <article className="site-section news-article" itemScope itemType="https://schema.org/NewsArticle">
        {children}
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

export function NewsDetailClient() {
  const params = useParams();
  const slug = params.slug as string;
  const [post, setPost] = useState<NewsPost | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/studio/public/news/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Noticia no encontrada');
        return r.json();
      })
      .then(setPost)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <NewsShell>
        <LoadingBlock rows={5} label="Cargando noticia…" />
      </NewsShell>
    );
  }

  if (error || !post) {
    return (
      <NewsShell>
        <EmptyState
          title="Noticia no encontrada"
          description={error || 'El enlace puede estar desactualizado o la noticia fue retirada.'}
          actionHref="/p/arta#noticias"
          actionLabel="Ver todas las noticias"
        />
      </NewsShell>
    );
  }

  return (
    <NewsShell>
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
    </NewsShell>
  );
}
