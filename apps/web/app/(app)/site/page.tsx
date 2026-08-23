'use client';

import { useEffect } from 'react';
import { PublicSite } from '@/components/site/PublicSite';
import { useUser } from '@/lib/user-context';
import { ActionLink, PageHeader } from '@/components/ui/PageChrome';

/** Preview autenticado del sitio Arta */
export default function SitePreviewPage() {
  const { user, entity, setEntity } = useUser();

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  if (!user) {
    return (
      <div className="login-wrap">
        <div className="stack page-workspace" style={{ textAlign: 'center' }}>
          <PageHeader
            title="Sitio público Arta"
            description="Vista previa del sitio corporativo Arta."
          >
            <ActionLink href="/p/arta">Ver sitio</ActionLink>
          </PageHeader>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="page-intro"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          padding: '0.65rem 1rem',
          background: 'rgba(0,0,0,0.75)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          margin: 0,
        }}
      >
        <PageHeader hint="Preview · sitio Arta">
          <ActionLink href="/studio" variant="ghost">
            ← Studio
          </ActionLink>
          <ActionLink href="/dashboard" variant="ghost">
            Panel
          </ActionLink>
        </PageHeader>
      </div>
      <PublicSite />
    </div>
  );
}
