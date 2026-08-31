import type { MetadataRoute } from 'next';
import { buildPublicSitemap } from '@/lib/public-sitemap';

/** Sitemap del sitio público indexable (artaproducciones.com). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildPublicSitemap();
}
