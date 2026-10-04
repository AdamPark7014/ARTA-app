import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';
import {
  APP_NAME,
  ORGANIZATION,
  ORGANIZATION_EMAIL,
  PUBLISHER,
  PUBLISHER_EMAIL,
  PUBLISHER_PHONE,
  PUBLISHER_PHONE_HREF,
} from '../legal-data';

export const metadata: Metadata = {
  title: 'Soporte',
  description: `Ayuda con la aplicación ${APP_NAME}: acceso, notificaciones y contacto.`,
  alternates: { canonical: '/legal/soporte' },
};

/** URL de soporte que pide App Store Connect. */
export default function SoportePage() {
  return (
    <main>
      <p className={styles.eyebrow}>Ayuda</p>
      <h1 className={styles.title}>Soporte de {APP_NAME}</h1>

      <p className={styles.lead}>
        {APP_NAME} es la aplicación de trabajo del equipo de {ORGANIZATION}: tareas, chat, aprobaciones, anticipos y
        eventos en el teléfono, con la misma cuenta del panel web.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preguntas frecuentes</h2>
        <ul className={styles.list}>
          <li>
            <strong>¿Cómo obtengo una cuenta?</strong> Te la da de alta un administrador de {ORGANIZATION}; no hay
            registro abierto. Recibirás una invitación por correo.
          </li>
          <li>
            <strong>Olvidé mi contraseña.</strong> Pídele al administrador de tu equipo que la restablezca desde el
            panel.
          </li>
          <li>
            <strong>No me llegan los avisos.</strong> Revisa que las notificaciones de {APP_NAME} estén permitidas en
            los ajustes del teléfono y que hayas iniciado sesión. Si «No molestar» está activo en el chat, los avisos
            se pausan hasta la hora que elegiste.
          </li>
          <li>
            <strong>Veo pocas secciones.</strong> Lo que aparece depende de tu rol; el administrador puede ajustar tus
            accesos.
          </li>
          <li>
            <strong>Quiero borrar mi cuenta.</strong> Sigue los pasos en{' '}
            <Link className={styles.link} href="/legal/eliminar-cuenta">
              Eliminar cuenta
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contacto</h2>
        <div className={styles.contactBox}>
          <p>
            <strong>Soporte técnico ({PUBLISHER}):</strong>{' '}
            <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}?subject=${encodeURIComponent(`Soporte ${APP_NAME}`)}`}>
              {PUBLISHER_EMAIL}
            </a>{' '}
            ·{' '}
            <a className={styles.link} href={PUBLISHER_PHONE_HREF}>
              {PUBLISHER_PHONE}
            </a>
          </p>
          <p>
            <strong>{ORGANIZATION}:</strong>{' '}
            <a className={styles.link} href={`mailto:${ORGANIZATION_EMAIL}`}>
              {ORGANIZATION_EMAIL}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
