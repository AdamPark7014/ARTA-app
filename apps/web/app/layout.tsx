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
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  appleWebApp: { capable: true, title: 'ARTA', statusBarStyle: 'black' },
  other: {
    'geo.region': 'MX-PUE',
    'geo.placename': 'Puebla',
    'content-language': 'es-MX',
  },
};

/**
 * Respaldo del «modo app» del lado cliente: `(app)/layout` lo decide en el
 * servidor, pero el login (y cualquier ruta fuera de ese grupo) llega aquí y
 * una navegación suave posterior no vuelve a ejecutar scripts del servidor.
 */
const APP_SHELL_FALLBACK =
  "try{if(/ArtaApp\\//.test(navigator.userAgent)){document.documentElement.setAttribute('data-shell','app');document.body.setAttribute('data-shell','app');}}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: APP_SHELL_FALLBACK }} />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
