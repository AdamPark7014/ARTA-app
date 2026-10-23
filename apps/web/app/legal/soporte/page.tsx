import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildPublicMetadata, simplePageGraphJsonLd } from '@/lib/site-seo';
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

const PAGE = {
  path: '/legal/soporte',
  name: `Soporte de la app ${APP_NAME}`,
  description: `Ayuda con la aplicación ${APP_NAME}: acceso, notificaciones y contacto.`,
};

export const metadata: Metadata = buildPublicMetadata({
  title: PAGE.name,
  description: PAGE.description,
  path: PAGE.path,
});

/** URL de soporte que pide App Store Connect. */
export default function SoportePage() {
  return (
    <main>
      <JsonLd data={simplePageGraphJsonLd(PAGE)} />
      <p className={styles.eyebrow}>Ayuda</p>
      <h1 className={styles.title}>Soporte de {APP_NAME}</h1>

      <p className={styles.lead}>
        {APP_NAME} es la aplicación de trabajo de los equipos que producen eventos en vivo (productoras y recintos):
        tareas, chat, aprobaciones, anticipos y eventos en el teléfono, con la misma cuenta del panel web.{' '}
        {ORGANIZATION} es la primera organización que la usa.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preguntas frecuentes</h2>
        <ul className={styles.list}>
          <li>
            <strong>¿Cómo obtengo una cuenta?</strong> Te la da de alta un administrador de tu organización; no hay
            registro abierto en la app. Recibirás una invitación por correo. Si tu productora o recinto aún no usa{' '}
            {APP_NAME}, pide tu espacio en{' '}
            <Link className={styles.link} href="/contratar">
              Contratar {APP_NAME}
            </Link>
            ; mientras, puedes recorrer la app con «Explorar {APP_NAME} con datos de muestra».
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
