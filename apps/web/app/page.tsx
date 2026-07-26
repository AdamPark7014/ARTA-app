import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { entityFromHost } from '@/lib/domains';

export default function Home() {
  const host = headers().get('host') || '';
  // Paneles arta/auditorio → dashboard; apex/www → sitio público
  if (entityFromHost(host)) redirect('/dashboard');
  redirect('/p/arta');
}
