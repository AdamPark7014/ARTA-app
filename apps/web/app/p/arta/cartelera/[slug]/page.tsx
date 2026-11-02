import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { NotFoundView, ShowView } from '@/components/site/SiteViews';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { isPageOff } from '@/lib/site-model';
import { pageHref } from '@/lib/site-blocks';
import { showDateParts } from '@/lib/site-format';
import { HOME_PATH, buildPublicMetadata, fetchPublicNews, showGraphJsonLd } from '@/lib/site-seo';

type Props = { params: { slug: string } };

async function fetchShow(slug: string) {
  const post = await fetchPublicNews(slug);
  return post?.template === 'evento' ? post : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const show = await fetchShow(params.slug);
  const path = `${HOME_PATH}/cartelera/${params.slug}`;
  if (!show) {
    return buildPublicMetadata({
      title: 'Show no encontrado',
      description: 'El show que buscas no está disponible.',
      path,
      noIndex: true,
    });
  }
  const date = showDateParts(show.eventDate);
  const description =
    show.excerpt?.trim() ||
    [show.title, date?.long, show.venue, show.city].filter(Boolean).join(' · ').slice(0, 158);
  return buildPublicMetadata({
    title: show.title,
    description,
    path,
    image: show.coverUrl,
    imageAlt: `Póster de ${show.title}`,
  });
}

export default async function ShowPage({ params }: Props) {
  const [show, data] = await Promise.all([fetchShow(params.slug), fetchPublicSiteData('ARTA')]);
  if (isPageOff(data, 'cartelera')) notFound();
  if (!show) {
    return (
      <NotFoundView
        data={data}
        title="Show no encontrado"
        text="El enlace puede estar desactualizado o el show ya no está en la cartelera."
        href={pageHref('cartelera')}
        linkLabel="Ver la cartelera"
      />
    );
  }
  return (
    <>
      <JsonLd data={showGraphJsonLd(show)} />
      <ShowView data={data} show={show} others={data.shows.filter((s) => s.slug !== show.slug)} />
    </>
  );
}
