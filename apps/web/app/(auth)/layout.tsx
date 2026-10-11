import type { Metadata } from 'next';
import { AuthEntityTheme } from '@/components/app-shell/AuthEntityTheme';
import { AUTH_THEME_SCRIPT } from '@/lib/entity-theme';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Acceso',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: AUTH_THEME_SCRIPT }} />
      <AuthEntityTheme />
      {children}
    </>
  );
}
