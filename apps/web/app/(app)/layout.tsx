import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { WebPushPrompt } from '@/components/web-push/WebPushPrompt';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Las apps nativas (Android/iOS) abren el panel en una vista web con este User-Agent. */
function isArtaApp(): boolean {
  return (headers().get('user-agent') || '').includes('ArtaApp/');
}

export function generateViewport(): Viewport {
  // Solo en la app: en Safari normal `cover` metería el contenido bajo la muesca.
  return isArtaApp() ? { viewportFit: 'cover' } : {};
}

const APP_SHELL_SCRIPT =
  "document.documentElement.setAttribute('data-shell','app');document.body&&document.body.setAttribute('data-shell','app');";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isArtaApp() ? <script dangerouslySetInnerHTML={{ __html: APP_SHELL_SCRIPT }} /> : null}
      {children}
      {isArtaApp() ? null : <WebPushPrompt />}
    </>
  );
}
