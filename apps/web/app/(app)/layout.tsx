import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { AskDialogHost } from '@/components/ui/AskDialog';
import { WebPushPrompt } from '@/components/web-push/WebPushPrompt';
import { entityFromHost } from '@/lib/domains';
import { PANEL_THEME_SCRIPT } from '@/lib/entity-theme';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Las apps nativas (Android/iOS) abren el panel en una vista web con este User-Agent. */
function isArtaApp(): boolean {
  return (headers().get('user-agent') || '').includes('ArtaApp/');
}

export function generateViewport(): Viewport {
  // Safari y Chrome en el teléfono tiñen su barra con esto: papel en ARTA, negro en el Auditorio.
  const host = (headers().get('host') || '').split(':')[0];
  const themeColor = entityFromHost(host) === 'EXPLANADA' ? '#08080a' : '#f7f6f3';
  // Solo en la app: en Safari normal `cover` metería el contenido bajo la muesca.
  return isArtaApp() ? { viewportFit: 'cover', themeColor } : { themeColor };
}

const APP_SHELL_SCRIPT =
  "document.documentElement.setAttribute('data-shell','app');document.body&&document.body.setAttribute('data-shell','app');";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PANEL_THEME_SCRIPT }} />
      {isArtaApp() ? <script dangerouslySetInnerHTML={{ __html: APP_SHELL_SCRIPT }} /> : null}
      {children}
      <AskDialogHost />
      {isArtaApp() ? null : <WebPushPrompt />}
    </>
  );
}
