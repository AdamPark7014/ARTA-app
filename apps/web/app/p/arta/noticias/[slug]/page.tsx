'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
      <header className="site-nav is-scrolled">
        <Link href="/p/arta" className="site-brand">
          <Image
            src="/brand/arta-logo.png"
            alt="arta"
            width={140}
            height={56}
            className="site-logo-img"
            priority
          />
        </Link>
        <nav className="site-nav-links">
          <Link href="/p/arta#noticias">← Noticias</Link>
        </nav>
      </header>
      <article className="site-section panel--narrow">{children}</article>
    </div>
  );
}

export default function NewsDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [post, setPost] = useState<NewsPost | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/studio/public/news/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Noticia no encontrada');
        return r.json();
      })
      .then(setPost)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <NewsShell>
        <div className="stack">
          <p>{error}</p>
          <Link href="/p/arta" className="btn ghost">
            Volver al inicio
          </Link>
        </div>
      </NewsShell>
    );
  }

  if (!post) {
    return (
      <NewsShell>
        <p className="muted">Cargando…</p>
      </NewsShell>
    );
  }

  return (
    <NewsShell>
      <div className="stack">
        <Link href="/p/arta#noticias" className="muted">
          ← Noticias
        </Link>
        <time className="muted">
          {post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ''}
        </time>
        <h1>{post.title}</h1>
        {post.excerpt ? <p className="lead">{post.excerpt}</p> : null}
        {post.coverUrl ? (
          <div
            className="about-visual"
            style={{ backgroundImage: `url(${post.coverUrl})` }}
          />
        ) : null}
        {post.body ? (
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{post.body}</div>
        ) : null}
      </div>
    </NewsShell>
  );
}
