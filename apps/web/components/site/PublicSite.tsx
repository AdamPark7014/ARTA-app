'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicSiteContent } from '@/components/site/PublicSiteContent';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { normalizeSiteData, type PublicSiteData, type PublicSitePage } from '@/lib/public-site-data';
import { LAYOUT_KEY, type PreviewMessage } from '@/lib/site-blocks';

type PublicSiteProps = {
  /** `publicado` = tal como lo ve el público; si no, con borradores. */
  mode?: 'borradores' | 'publicado';
  /** Dentro de Studio: las ligas no navegan fuera de la vista previa. */
  embed?: boolean;
};

function withSection(pages: PublicSitePage[], sectionKey: string, contentJson: PublicSitePage['contentJson']) {
  const rest = pages.filter((p) => p.sectionKey !== sectionKey);
  return [...rest, { sectionKey, contentJson, draft: true }];
}

/**
 * Vista previa del sitio (`/site`): la misma página que ve el público, con lo que aún no se publica.
 * Studio le manda por `postMessage` lo que se va escribiendo, sin guardar, para verlo al momento.
 */
export function PublicSite({ mode = 'borradores', embed = false }: PublicSiteProps) {
  const [data, setData] = useState<PublicSiteData | null>(null);
  const [error, setError] = useState(false);
  const [noDrafts, setNoDrafts] = useState(false);
  const includeDrafts = mode !== 'publicado' && !noDrafts;

  const load = useCallback(async () => {
    const published = () => fetch('/api/studio/public/ARTA').then((r) => r.json() as Promise<Partial<PublicSiteData>>);
    try {
      let fresh: Partial<PublicSiteData>;
      if (includeDrafts) {
        try {
          fresh = await api<Partial<PublicSiteData>>('/studio/preview');
        } catch {
          // El menú lleva aquí a todos, también a quien no edita Studio: ve lo publicado.
          setNoDrafts(true);
          fresh = await published();
        }
      } else {
        fresh = await published();
      }
      setData(normalizeSiteData(fresh));
      setError(false);
    } catch {
      setError(true);
    }
  }, [includeDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== window.location.origin || event.data?.source !== 'arta-studio') return;
      const message = event.data;
      if (message.type === 'reload') {
        void load();
      } else if (message.type === 'scrollTo') {
        const target = message.anchor === 'portada' ? document.body : document.getElementById(message.anchor);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (includeDrafts && message.type === 'section') {
        setData((d) => (d ? { ...d, pages: withSection(d.pages, message.sectionKey, message.contentJson) } : d));
      } else if (includeDrafts && message.type === 'layout') {
        setData((d) => (d ? { ...d, pages: withSection(d.pages, LAYOUT_KEY, { blocks: message.blocks }) } : d));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [load, includeDrafts]);

  // Ya hay página: Studio reenvía lo que se escribió mientras este marco cargaba.
  const ready = data !== null;
  useEffect(() => {
    if (ready && embed) window.parent?.postMessage({ source: 'arta-preview', type: 'ready' }, window.location.origin);
  }, [ready, embed]);

  // En la vista previa de Studio, solo las anclas de la misma página navegan.
  useEffect(() => {
    if (!embed) return;
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#')) e.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [embed]);

  if (error && !data) {
    return <p className="sa-preview-error">No se pudo cargar la vista previa. Revisa tu conexión y recarga la página.</p>;
  }
  if (!data) {
    return <LoadingBlock rows={6} label="Cargando vista previa…" />;
  }
  return <PublicSiteContent data={data} preview={includeDrafts} />;
}
