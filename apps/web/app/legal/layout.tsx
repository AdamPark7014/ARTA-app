import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './legal.module.css';

export const metadata: Metadata = {
  openGraph: { type: 'website', locale: 'es_MX', siteName: 'ARTA' },
  robots: { index: true, follow: true },
};

/** Páginas públicas que enlazan App Store y Google Play: sin sesión ni barra del panel. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <Link className={styles.brand} href="/">
        ARTA
      </Link>
      {children}
      <nav className={styles.nav} aria-label="Páginas legales">
        <Link className={styles.link} href="/legal/privacidad">
          Aviso de privacidad
        </Link>
        <Link className={styles.link} href="/legal/terminos">
          Términos de uso
        </Link>
        <Link className={styles.link} href="/legal/eliminar-cuenta">
          Eliminar cuenta
        </Link>
        <Link className={styles.link} href="/legal/soporte">
          Soporte
        </Link>
      </nav>
    </div>
  );
}
