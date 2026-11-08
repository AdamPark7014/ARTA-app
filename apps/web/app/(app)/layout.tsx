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
async function isArtaApp(): Promise<boolean> {
  return ((await headers()).get('user-agent') || '').includes('ArtaApp/');
}

export async function generateViewport(): Promise<Viewport> {
  // Safari y Chrome en el teléfono tiñen su barra con esto: papel en ARTA, negro en el Auditorio.
  const host = ((await headers()).get('host') || '').split(':')[0];
  const themeColor = entityFromHost(host) === 'EXPLANADA' ? '#08080a' : '#f7f6f3';
  // Solo en la app: en Safari normal `cover` metería el contenido bajo la muesca.
  return (await isArtaApp()) ? { viewportFit: 'cover', themeColor } : { themeColor };
}

const APP_SHELL_SCRIPT =
  "document.documentElement.setAttribute('data-shell','app');document.body&&document.body.setAttribute('data-shell','app');";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const inApp = await isArtaApp();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PANEL_THEME_SCRIPT }} />
      {inApp ? <script dangerouslySetInnerHTML={{ __html: APP_SHELL_SCRIPT }} /> : null}
      {children}
      <AskDialogHost />
      {inApp ? null : <WebPushPrompt />}
    </>
  );
}
