'use client';

import { useEffect, useState } from 'react';
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
      <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.25rem' }}>
        <p>{error}</p>
        <Link href="/p/arta">← Volver</Link>
      </main>
    );
  }

  if (!post) {
    return (
      <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.25rem' }}>
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="news-detail">
      <div className="news-detail-inner">
        <Link href="/p/arta#noticias" className="muted">
          ← Noticias
        </Link>
        <time className="muted" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
          {post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ''}
        </time>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', margin: '0.4rem 0 1rem' }}>
          {post.title}
        </h1>
        {post.excerpt ? <p style={{ fontSize: '1.15rem', opacity: 0.85 }}>{post.excerpt}</p> : null}
        {post.coverUrl ? (
          <div
            style={{
              margin: '1.5rem 0',
              height: 'min(52vh, 420px)',
              borderRadius: 12,
              backgroundImage: `url(${post.coverUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : null}
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '1.05rem' }}>
          {post.body || post.excerpt || ''}
        </div>
      </div>
      <style jsx>{`
        .news-detail {
          min-height: 100vh;
          background: linear-gradient(165deg, #0c0c0c 0%, #1a1512 45%, #121212 100%);
          color: #f4efe8;
          padding: 3rem 1.25rem 5rem;
        }
        .news-detail-inner {
          max-width: 720px;
          margin: 0 auto;
        }
        a {
          color: inherit;
        }
      `}</style>
    </main>
  );
}
