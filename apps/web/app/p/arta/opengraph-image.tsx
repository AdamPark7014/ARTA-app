import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site-seo';

export const runtime = 'edge';
export const alt = `${SITE_NAME} · ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 64,
          background: 'linear-gradient(135deg, #0a0a0b 0%, #1a1510 45%, #0a0a0b 100%)',
          color: '#f5f0e8',
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: '#c9a227', marginBottom: 24 }}>
          ARTA PRODUCCIONES
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ fontSize: 28, marginTop: 32, color: '#b8b0a4', maxWidth: 800 }}>
          Producción integral de conciertos y eventos · Puebla, México
        </div>
      </div>
    ),
    { ...size },
  );
}
