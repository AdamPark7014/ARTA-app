'use client';

import { useEffect } from 'react';
import { PublicSite } from '@/components/site/PublicSite';
import { useUser } from '@/lib/user-context';
import Link from 'next/link';

/** Preview autenticado del sitio Arta */
export default function SitePreviewPage() {
  const { user, entity, setEntity } = useUser();

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  if (!user) {
    return (
      <div className="login-wrap">
        <div className="stack" style={{ textAlign: 'center' }}>
          <p className="muted">Sitio público Arta</p>
          <Link className="btn" href="/p/arta">
            Ver sitio
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          padding: '0.65rem 1rem',
          background: 'rgba(0,0,0,0.75)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Link className="btn ghost" href="/studio">
          ← Studio
        </Link>
        <span className="muted" style={{ fontSize: 13 }}>
          Preview · sitio Arta
        </span>
        <Link className="btn ghost" href="/dashboard" style={{ marginLeft: 'auto' }}>
          Panel
        </Link>
      </div>
      <PublicSite />
    </div>
  );
}
