import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { NotFoundView, ServicioView } from '@/components/site/SiteViews';
import { fetchPublicSiteData } from '@/lib/public-site-data';
import { pageHref, serviceHref } from '@/lib/site-blocks';
import { isPageOff, servicesOf } from '@/lib/site-model';
import { buildPublicMetadata, serviceGraphJsonLd } from '@/lib/site-seo';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const service = servicesOf(await fetchPublicSiteData('ARTA')).find((s) => s.slug === params.slug);
  const path = serviceHref(params.slug);
  if (!service) {
    return buildPublicMetadata({ title: 'Servicio no encontrado', description: 'El servicio que buscas no está disponible.', path, noIndex: true });
  }
  return buildPublicMetadata({
    title: service.title,
    description: service.body || service.detail,
    path,
    image: service.imageUrl,
    imageAlt: service.title,
  });
}

export default async function ServicioPage({ params }: Props) {
  const data = await fetchPublicSiteData('ARTA');
  if (isPageOff(data, 'servicios')) notFound();
  const service = servicesOf(data).find((s) => s.slug === params.slug);
  if (!service) {
    return (
      <NotFoundView
        data={data}
        title="Servicio no encontrado"
        text="El enlace puede estar desactualizado o el servicio cambió de nombre."
        href={pageHref('servicios')}
        linkLabel="Ver los servicios"
      />
    );
  }
  return (
    <>
      <JsonLd data={serviceGraphJsonLd(data, service)} />
      <ServicioView data={data} service={service} />
    </>
  );
}
