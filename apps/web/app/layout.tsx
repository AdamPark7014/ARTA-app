import type { Metadata } from 'next';
import '../styles/globals.scss';
import { UserProvider } from '@/lib/user-context';

export const metadata: Metadata = {
  title: 'ARTA · Operaciones',
  description: 'Control operativo Arta Producciones y Auditorio Arema Explanada',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Sora:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
