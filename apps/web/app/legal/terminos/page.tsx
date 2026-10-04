import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';
import {
  APP_NAME,
  LEGAL_UPDATED,
  ORGANIZATION,
  PUBLISHER,
  PUBLISHER_ADDRESS,
  PUBLISHER_EMAIL,
  PUBLISHER_PHONE,
  PUBLISHER_PHONE_HREF,
  PUBLISHER_SHORT,
} from '../legal-data';

export const metadata: Metadata = {
  title: 'Términos de uso',
  description: `Términos de uso de la aplicación ${APP_NAME} y del panel de operación de ${ORGANIZATION}.`,
  alternates: { canonical: '/legal/terminos' },
};

export default function TerminosPage() {
  return (
    <main>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Términos de uso</h1>
      <p className={styles.updated}>Última actualización: {LEGAL_UPDATED}</p>

      <p className={styles.lead}>
        La aplicación <strong>{APP_NAME}</strong> y su panel web los desarrolla y opera <strong>{PUBLISHER}</strong>{' '}
        ({PUBLISHER_SHORT}) para el equipo de <strong>{ORGANIZATION}</strong>. Al usarlos aceptas estos términos.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Para qué sirve</h2>
        <p className={styles.p}>
          Es una herramienta de trabajo para coordinar la producción de eventos: tareas, chat del equipo,
          aprobaciones, anticipos, órdenes de compra, formatos y documentos. No es un servicio para el público en
          general.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cuentas</h2>
        <ul className={styles.list}>
          <li>Las cuentas las crea un administrador de {ORGANIZATION}; no hay registro abierto.</li>
          <li>Tu cuenta es personal: no compartas tu contraseña ni tu código de verificación.</li>
          <li>
            Lo que ves depende de tu rol. El administrador puede cambiar tus permisos o desactivar tu cuenta cuando
            termine tu relación con {ORGANIZATION}.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Uso aceptable</h2>
        <ul className={styles.list}>
          <li>Usa la aplicación solo para fines de trabajo y de forma lícita.</li>
          <li>No publiques contenido ofensivo, ilegal o que vulnere derechos de terceros en el chat o en los archivos.</li>
          <li>No intentes acceder a información, cuentas o sistemas que no te corresponden.</li>
          <li>La información de los eventos es confidencial de {ORGANIZATION}: no la divulgues fuera del equipo.</li>
        </ul>
        <p className={styles.p}>
          Si algo en el chat o en un archivo te parece indebido, repórtalo al administrador de {ORGANIZATION} o a{' '}
          <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}`}>
            {PUBLISHER_EMAIL}
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos personales</h2>
        <p className={styles.p}>
          El tratamiento de tus datos se rige por el{' '}
          <Link className={styles.link} href="/legal/privacidad">
            Aviso de privacidad
          </Link>
          . Puedes pedir la eliminación de tu cuenta en{' '}
          <Link className={styles.link} href="/legal/eliminar-cuenta">
            Eliminar cuenta
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cambios</h2>
        <p className={styles.p}>
          Las funciones y estos términos pueden actualizarse. La versión vigente siempre está en esta página.
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
        </div>
      </section>
    </main>
  );
}
