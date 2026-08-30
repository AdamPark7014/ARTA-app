'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { PublicSite } from '@/components/site/PublicSite';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { ActionLink, PageHeader } from '@/components/ui/PageChrome';
import { useUser } from '@/lib/user-context';

/** Preview autenticado del sitio Arta */
export default function SitePreviewPage() {
  const { user, entity, setEntity, loading } = useUser();

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <LoadingBlock rows={3} label="Cargando vista previa…" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="eyebrow">arta · sitio público</p>
          <h1>Sitio corporativo Arta</h1>
          <p className="lead">
            Vista previa autenticada del sitio. Inicia sesión para ver el banner de edición o abre
            el sitio live directamente.
          </p>
          <EmptyState
            title="Sesión requerida"
            description="La vista previa con barra de Studio requiere acceso al panel Arta."
            actionHref="/login?next=/site"
            actionLabel="Iniciar sesión"
          >
            <Link className="btn ghost" href="/p/arta">
              Ver sitio público
            </Link>
          </EmptyState>
        </div>
      </main>
    );
  }

  return (
    <div>
      <div className="site-preview-bar">
        <PageHeader hint="Vista previa del sitio público — no es la URL pública">
          <ActionLink href="/studio" variant="ghost">
            Studio
          </ActionLink>
          <Link className="btn" href="/p/arta" target="_blank" rel="noopener noreferrer">
            Abrir sitio en vivo
          </Link>
          <ActionLink href="/dashboard" variant="ghost">
            Panel
          </ActionLink>
        </PageHeader>
      </div>
      <PublicSite />
    </div>
  );
}
