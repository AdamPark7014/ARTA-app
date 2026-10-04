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
  description: `Cómo solicitar la eliminación de tu cuenta de ${APP_NAME} y de los datos asociados.`,
  alternates: { canonical: '/legal/eliminar-cuenta' },
};

const SUBJECT = encodeURIComponent(`Eliminación de cuenta ${APP_NAME}`);

export default function EliminarCuentaPage() {
  return (
    <main>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Eliminar cuenta y datos</h1>
      <p className={styles.updated}>Última actualización: {LEGAL_UPDATED}</p>

      <p className={styles.lead}>
        Cómo pedir que se elimine tu cuenta de la aplicación <strong>{APP_NAME}</strong> (identificador{' '}
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
          <li>Si solo quieres borrar cierta información y no toda la cuenta, descríbela.</li>
        </ul>
        <p className={styles.p}>
          Verificamos tu identidad antes de eliminar nada y respondemos en los plazos que fija la ley. También puedes
          ejercer tus{' '}
          <Link className={styles.link} href="/legal/privacidad">
            derechos ARCO
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué se elimina</h2>
        <ul className={styles.list}>
          <li>Tu perfil: nombre, correo, puesto y contraseña.</li>
          <li>Sesiones abiertas y el token de notificaciones de tus dispositivos.</li>
          <li>Tus preferencias, avisos y mensajes guardados.</li>
        </ul>
        <p className={styles.p}>
          Desinstalar la aplicación borra lo que hay en el teléfono, pero no elimina la cuenta en el servidor: para
          eso hace falta la solicitud.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué puede conservarse</h2>
        <p className={styles.p}>
          Parte de la información pertenece a {ORGANIZATION} y no al titular de la cuenta, o la ley obliga a
          guardarla durante un tiempo:
        </p>
        <ul className={styles.list}>
          <li>Órdenes de compra, anticipos, comprobantes y registros contables y fiscales.</li>
          <li>Formatos firmados, documentos y archivos de los eventos.</li>
          <li>Mensajes que forman parte de conversaciones del equipo.</li>
          <li>Bitácoras de seguridad y de cambios.</li>
        </ul>
        <p className={styles.p}>
          En esos casos la información se desvincula de tu cuenta y su uso se limita al fin que obliga a conservarla.
          Al vencer el plazo, se elimina.
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
          Esta página es pública y no requiere iniciar sesión, conforme a los requisitos de eliminación de datos de
          Google Play.
        </p>
      </section>
    </main>
  );
}
