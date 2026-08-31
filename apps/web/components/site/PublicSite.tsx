'use client';

import { useEffect, useState } from 'react';
import { PublicSiteContent } from '@/components/site/PublicSiteContent';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { FALLBACK_SLIDES, type PublicSiteData } from '@/lib/public-site-data';

/** Client preview wrapper (panel /site) — live public page uses SSR via PublicSiteShell. */
export function PublicSite() {
  const [data, setData] = useState<PublicSiteData>({
    pages: [],
    slides: FALLBACK_SLIDES,
    news: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/studio/public/ARTA')
      .then((r) => r.json())
      .then((d) => {
        setData({
          pages: d.pages || [],
          slides: d.slides?.length ? d.slides : FALLBACK_SLIDES,
          news: d.news || [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingBlock rows={6} label="Cargando sitio…" />;
  }

  return <PublicSiteContent data={data} />;
}
