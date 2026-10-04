import type { Metadata } from 'next';
import { WebPushPrompt } from '@/components/web-push/WebPushPrompt';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <WebPushPrompt />
    </>
  );
}
