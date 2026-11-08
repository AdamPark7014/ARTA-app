import { headers } from 'next/headers';
import { permanentRedirect, redirect } from 'next/navigation';
import { entityFromHost } from '@/lib/domains';

export default async function Home() {
  const host = (await headers()).get('host') || '';
  // Paneles arta/auditorio → dashboard; apex/www → sitio público
  if (entityFromHost(host)) redirect('/dashboard');
  permanentRedirect('/p/arta');
}
