'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import '@/styles/sitio.scss';
import { PublicSite } from '@/components/site/PublicSite';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { SITE_PAGES } from '@/lib/site-blocks';
import type { SiteRoute } from '@/lib/site-model';
import { useUser } from '@/lib/user-context';

/**
 * Vista previa del sitio con lo que aún no se publica. La usa Studio dentro de un marco
 * (`?embed=1`) y también se puede abrir sola, a pantalla completa, para revisarla en el teléfono.
 */
export default function SitePreviewPage() {
  const { user, entity, setEntity, loading } = useUser();
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);

  useEffect(() => {
    if (entity !== 'ARTA') setEntity('ARTA');
  }, [entity, setEntity]);

  const embed = params?.get('embed') === '1';
  const mode = useMemo(() => (params?.get('modo') === 'publicado' ? 'publicado' : 'borradores'), [params]);
  const initial = useMemo<SiteRoute>(() => {
    const page = SITE_PAGES.find((p) => p.key === params?.get('pagina'))?.key ?? 'inicio';
    return { page, slug: params?.get('slug') || undefined };
  }, [params]);

  if (loading || !params) {
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
          <EmptyState
            title="Sesión requerida"
            description="La vista previa enseña lo que aún no se publica: entra con tu cuenta."
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
    <>
      {embed ? null : (
        <div className="sa-previewbar">
          <span>
            <strong>Vista previa.</strong> {mode === 'publicado' ? 'Así está publicado.' : 'Incluye lo que aún no se publica.'}
          </span>
          <Link href="/studio">Volver a Studio</Link>
        </div>
      )}
      <PublicSite mode={mode} embed={embed} initial={initial} />
    </>
  );
}
