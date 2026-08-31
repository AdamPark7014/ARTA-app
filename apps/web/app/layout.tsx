import type { Metadata } from 'next';
import '../styles/globals.scss';
import { UserProvider } from '@/lib/user-context';
import { ROOT_DOMAIN } from '@/lib/domains';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site-seo';

export const metadata: Metadata = {
  metadataBase: new URL(`https://${ROOT_DOMAIN}`),
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  referrer: 'origin-when-cross-origin',
  formatDetection: { email: false, address: false, telephone: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/brand/arta-logo.png',
    apple: '/brand/arta-logo.png',
  },
  other: {
    'geo.region': 'MX-PUE',
    'geo.placename': 'Puebla',
    'content-language': 'es-MX',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
