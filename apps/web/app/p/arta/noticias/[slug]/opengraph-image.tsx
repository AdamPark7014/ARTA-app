import { ImageResponse } from 'next/og';
import { fetchPublicNews, SITE_NAME } from '@/lib/site-seo';

export const runtime = 'edge';
export const alt = 'Noticia · Arta Producciones';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = { params: { slug: string } };

export default async function NewsOgImage({ params }: Props) {
  const post = await fetchPublicNews(params.slug);
  const title = post?.title || 'Noticias';
  const subtitle = post?.excerpt?.slice(0, 120) || SITE_NAME;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 64,
          background: post?.coverUrl
            ? `linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%), url(${post.coverUrl}) center/cover`
            : 'linear-gradient(135deg, #0a0a0b 0%, #1a1510 45%, #0a0a0b 100%)',
          color: '#f5f0e8',
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 4, color: '#c9a227', marginBottom: 16 }}>
          ARTA PRODUCCIONES
        </div>
        <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ fontSize: 24, marginTop: 20, color: '#d4cdc3', maxWidth: 900 }}>{subtitle}</div>
      </div>
    ),
    { ...size },
  );
}
