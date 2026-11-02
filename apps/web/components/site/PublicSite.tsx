'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicSiteContent } from '@/components/site/PublicSiteContent';
import {
  CarteleraView,
  ContactoView,
  GaleriaView,
  HistoriasView,
  NoticiaView,
  NoticiasView,
  NosotrosView,
  NotFoundView,
  PreguntasView,
  ServicioView,
  ServiciosView,
  ShowView,
} from '@/components/site/SiteViews';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { normalizeSiteData, type PublicSiteData, type PublicSitePage } from '@/lib/public-site-data';
import { LAYOUT_KEY, pageHref, type PageKey, type PreviewMessage } from '@/lib/site-blocks';
import { parseSitePath, servicesOf, type SiteRoute } from '@/lib/site-model';

type PublicSiteProps = {
  /** `publicado` = tal como lo ve el público; si no, con borradores. */
  mode?: 'borradores' | 'publicado';
  /** Dentro de Studio: lo que salga del sitio no navega. */
  embed?: boolean;
  /** Página con que abre la vista previa. */
  initial?: SiteRoute;
};

function withSection(pages: PublicSitePage[], sectionKey: string, contentJson: PublicSitePage['contentJson']) {
  const rest = pages.filter((p) => p.sectionKey !== sectionKey);
  return [...rest, { sectionKey, contentJson, draft: true }];
}

/** La página que toca, con lo que aún no se publica. Las rutas públicas pintan estas mismas vistas. */
function RouteView({ route, data, preview }: { route: SiteRoute; data: PublicSiteData; preview: boolean }) {
  const shared = { data, preview };
  const back = (title: string, text: string, page: PageKey, linkLabel: string) => (
    <NotFoundView {...shared} title={title} text={text} href={pageHref(page)} linkLabel={linkLabel} />
  );
  switch (route.page) {
    case 'cartelera': {
      if (!route.slug) return <CarteleraView {...shared} upcoming={data.shows} />;
      const show = data.shows.find((s) => s.slug === route.slug);
      return show ? (
        <ShowView {...shared} show={show} others={data.shows.filter((s) => s.slug !== route.slug)} />
      ) : (
        back('Show no encontrado', 'No está en la lista de próximos shows.', 'cartelera', 'Ver la cartelera')
      );
    }
    case 'nosotros':
      return <NosotrosView {...shared} />;
    case 'servicios': {
      if (!route.slug) return <ServiciosView {...shared} />;
      const service = servicesOf(data).find((s) => s.slug === route.slug);
      return service ? (
        <ServicioView {...shared} service={service} />
      ) : (
        back('Servicio no encontrado', 'Puede que le hayan cambiado el nombre.', 'servicios', 'Ver los servicios')
      );
    }
    case 'noticias': {
      if (!route.slug) return <NoticiasView {...shared} news={data.news} />;
      const post = data.news.find((n) => n.slug === route.slug);
      return post ? (
        <NoticiaView {...shared} post={post} />
      ) : (
        back('Noticia no encontrada', 'Puede que se haya quitado.', 'noticias', 'Ver las noticias')
      );
    }
    case 'historias':
      return <HistoriasView {...shared} />;
    case 'galeria':
      return <GaleriaView {...shared} />;
    case 'preguntas':
      return <PreguntasView {...shared} />;
    case 'contacto':
      return <ContactoView {...shared} />;
    default:
      return <PublicSiteContent data={data} preview={preview} />;
  }
}

/**
 * Vista previa del sitio (`/site`): las mismas páginas que ve el público, con lo que aún no se
 * publica. Navega por dentro para no perder los borradores, y Studio le manda por `postMessage` qué
 * página abrir y lo que se va escribiendo, sin guardar, para verlo al momento.
 */
export function PublicSite({ mode = 'borradores', embed = false, initial = { page: 'inicio' } }: PublicSiteProps) {
  const [data, setData] = useState<PublicSiteData | null>(null);
  const [error, setError] = useState(false);
  const [noDrafts, setNoDrafts] = useState(false);
  const [route, setRoute] = useState<SiteRoute>(initial);
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
      } else if (message.type === 'page') {
        setRoute({ page: message.page });
        window.scrollTo(0, 0);
      } else if (message.type === 'scrollTo') {
        document.getElementById(message.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (includeDrafts && message.type === 'section') {
        setData((d) => (d ? { ...d, pages: withSection(d.pages, message.sectionKey, message.contentJson) } : d));
      } else if (includeDrafts && message.type === 'layout') {
        setData((d) => (d ? { ...d, pages: withSection(d.pages, LAYOUT_KEY, { blocks: message.blocks, pages: message.pages } as PublicSitePage['contentJson']) } : d));
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

  // Las ligas del sitio se quedan en la vista previa: fuera de ella se perderían los borradores.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const next = parseSitePath(href);
      if (next) {
        e.preventDefault();
        setRoute(next);
        window.scrollTo(0, 0);
      } else if (embed && !href.startsWith('#')) {
        e.preventDefault();
      }
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
  return <RouteView route={route} data={data} preview={includeDrafts} />;
}
