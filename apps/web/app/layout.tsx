import type { Metadata } from 'next';
import { Fraunces, Inter, Nunito, Outfit } from 'next/font/google';
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
 * Letra del panel (docs/diseno/SISTEMA-VISUAL.md): Nunito en toda la interfaz y
 * Outfit solo para la palabra «EXPLANADA» del Auditorio. Se sirven desde el
 * propio dominio (next/font), sin pedirle nada a Google en cada visita.
 * Nunito va como fuente variable: cubre del 300 al 800 del sistema y también
 * los pesos intermedios (560, 650) que usan títulos y etiquetas.
 */
const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['800', '900'],
  display: 'swap',
  variable: '--font-outfit',
});

/**
 * El sitio público y el portal de proveedores usan Fraunces e Inter. Sin `preload`:
 * el navegador solo las baja donde se usan, y el panel, que va en Nunito, ni las
 * pide. Antes salían de una hoja de Google que frenaba el primer pintado de todo.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-fraunces',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
});

/**
 * Respaldo del «modo app» del lado cliente: `(app)/layout` lo decide en el
 * servidor, pero el login (y cualquier ruta fuera de ese grupo) llega aquí y
 * una navegación suave posterior no vuelve a ejecutar scripts del servidor.
 */
const APP_SHELL_FALLBACK =
  "try{if(/ArtaApp\\//.test(navigator.userAgent)){document.documentElement.setAttribute('data-shell','app');document.body.setAttribute('data-shell','app');}}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${nunito.variable} ${outfit.variable} ${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: APP_SHELL_FALLBACK }} />
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
