import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';
import {
  APP_ID,
  APP_NAME,
  LEGAL_UPDATED,
  ORGANIZATION,
  ORGANIZATION_EMAIL,
  PUBLISHER,
  PUBLISHER_ADDRESS,
  PUBLISHER_EMAIL,
  PUBLISHER_PHONE,
  PUBLISHER_PHONE_HREF,
} from '../legal-data';

export const metadata: Metadata = {
  title: 'Eliminar cuenta',
  description: `Cómo dar de baja tu cuenta de ${APP_NAME} y qué pasa con lo que creaste.`,
  alternates: { canonical: '/legal/eliminar-cuenta' },
};

const SUBJECT = encodeURIComponent(`Eliminación de cuenta ${APP_NAME}`);

export default function EliminarCuentaPage() {
  return (
    <main>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Eliminar cuenta</h1>
      <p className={styles.updated}>Última actualización: {LEGAL_UPDATED}</p>

      <p className={styles.lead}>
        Cómo dar de baja tu cuenta de la aplicación <strong>{APP_NAME}</strong> (identificador{' '}
        <code>{APP_ID}</code>), publicada por <strong>{PUBLISHER}</strong>, y del panel web de {ORGANIZATION}.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Antes de empezar</h2>
        <p className={styles.p}>
          Las cuentas no se crean desde la aplicación: las da de alta un administrador de {ORGANIZATION}. Por eso
          hay dos caminos:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Si trabajas con {ORGANIZATION}:</strong> pídeselo al administrador de tu equipo; puede dar de baja
            tu cuenta desde el panel en ese momento.
          </li>
          <li>
            <strong>Si prefieres pedirlo tú directamente</strong>, o ya no tienes contacto con el equipo: escríbenos
            como se indica abajo.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cómo solicitarlo</h2>
        <p className={styles.p}>
          Envía un correo a{' '}
          <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}?subject=${SUBJECT}`}>
            {PUBLISHER_EMAIL}
          </a>{' '}
          con el asunto <strong>«Eliminación de cuenta {APP_NAME}»</strong> e incluye:
        </p>
        <ul className={styles.list}>
          <li>Tu nombre completo.</li>
          <li>El correo con el que inicias sesión en {APP_NAME}.</li>
          <li>Un documento que acredite tu identidad.</li>
        </ul>
        <p className={styles.p}>
          Verificamos tu identidad antes de dar de baja la cuenta y respondemos en los plazos que fija la ley. Para
          cualquier otro tratamiento de tus datos personales puedes ejercer tus{' '}
          <Link className={styles.link} href="/legal/privacidad">
            derechos ARCO
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué pasa con tu cuenta</h2>
        <p className={styles.p}>La baja es definitiva desde que se aplica:</p>
        <ul className={styles.list}>
          <li>La cuenta queda desactivada: ya no se puede iniciar sesión con ella, ni en la aplicación ni en la web.</li>
          <li>Se cierran sus sesiones abiertas en todos los dispositivos.</li>
          <li>Deja de recibir avisos y notificaciones.</li>
        </ul>
        <p className={styles.p}>
          Desinstalar la aplicación borra lo que hay en el teléfono, pero no da de baja la cuenta en el servidor: para
          eso hace falta la solicitud.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué se conserva</h2>
        <p className={styles.p}>
          Lo que creaste con la cuenta es parte del trabajo de {ORGANIZATION} y se queda en la organización, con tu
          nombre como autor, para que el equipo conserve el historial de cada evento:
        </p>
        <ul className={styles.list}>
          <li>Tareas, entregas, evidencias y su historial.</li>
          <li>Órdenes de compra, anticipos, comprobantes y registros contables y fiscales.</li>
          <li>Formatos, documentos y archivos de los eventos.</li>
          <li>Mensajes del chat del equipo.</li>
          <li>Bitácoras de seguridad y de cambios.</li>
        </ul>
        <p className={styles.p}>
          Esa información solo la ve el equipo de {ORGANIZATION} y se usa para la operación y las obligaciones legales
          de la organización.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contacto</h2>
        <div className={styles.contactBox}>
          <p>
            <strong>{PUBLISHER}</strong>
          </p>
          <p>
            <strong>Domicilio:</strong> {PUBLISHER_ADDRESS}
          </p>
          <p>
            <strong>Correo:</strong>{' '}
            <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}`}>
              {PUBLISHER_EMAIL}
            </a>
          </p>
          <p>
            <strong>Teléfono:</strong>{' '}
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
        <p className={styles.note}>
          Esta página es pública y no requiere iniciar sesión, conforme a los requisitos de Google Play y de la App
          Store.
        </p>
      </section>
    </main>
  );
}
