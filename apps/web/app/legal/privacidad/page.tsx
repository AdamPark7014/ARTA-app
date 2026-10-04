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
  PUBLISHER_SHORT,
} from '../legal-data';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad',
  description: `Aviso de privacidad de la aplicación ${APP_NAME} y del panel de operación de ${ORGANIZATION}.`,
  alternates: { canonical: '/legal/privacidad' },
};

export default function PrivacidadPage() {
  return (
    <main>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Aviso de Privacidad</h1>
      <p className={styles.updated}>Última actualización: {LEGAL_UPDATED}</p>

      <p className={styles.lead}>
        <strong>{PUBLISHER}</strong> ({PUBLISHER_SHORT}), con domicilio en {PUBLISHER_ADDRESS}, desarrolla y opera
        la aplicación móvil <strong>{APP_NAME}</strong> (identificador <code>{APP_ID}</code>) y el panel web de
        operación que usa el equipo de <strong>{ORGANIZATION}</strong>. Este aviso explica qué datos personales
        se tratan, para qué y cómo ejercer tus derechos, conforme a la Ley Federal de Protección de Datos
        Personales en Posesión de los Particulares.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quién usa la aplicación</h2>
        <p className={styles.p}>
          {APP_NAME} es una herramienta de trabajo para el personal, colaboradores y proveedores autorizados de{' '}
          {ORGANIZATION}. <strong>No tiene registro público</strong>: las cuentas las da de alta un administrador
          de {ORGANIZATION}, que es quien decide qué información de sus eventos y operaciones se registra.{' '}
          {PUBLISHER_SHORT} trata esos datos por cuenta de {ORGANIZATION} para prestar el servicio.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos que se tratan</h2>
        <ul className={styles.list}>
          <li>
            <strong>Datos de la cuenta:</strong> nombre, correo electrónico, puesto o rol y la organización a la que
            perteneces. La contraseña se guarda cifrada y nunca se muestra.
          </li>
          <li>
            <strong>Mensajes y archivos del chat:</strong> los mensajes, reacciones y adjuntos (fotografías,
            videos, notas de voz y documentos) que envías a tus compañeros.
          </li>
          <li>
            <strong>Cámara, micrófono y galería:</strong> son <strong>opcionales</strong> y solo se usan en el
            momento en que tú decides tomar una foto, grabar un video o una nota de voz, o adjuntar un archivo.
            La aplicación no accede a ellos en segundo plano.
          </li>
          <li>
            <strong>Identificador para notificaciones:</strong> un token del dispositivo, necesario para enviarte
            avisos push (tareas, aprobaciones, mensajes) al teléfono correcto. Se borra al cerrar sesión.
          </li>
          <li>
            <strong>Estado de conexión:</strong> si estás en línea mientras la aplicación está abierta, para que tus
            compañeros lo vean en el chat.
          </li>
          <li>
            <strong>Actividad de trabajo:</strong> tareas, aprobaciones, anticipos, órdenes de compra, formatos,
            documentos y demás registros que generas como parte de tu trabajo en los eventos de {ORGANIZATION}.
          </li>
        </ul>
        <p className={styles.p}>
          La aplicación <strong>no recaba tu ubicación</strong>, no contiene publicidad, no usa identificadores
          publicitarios ni herramientas de analítica, y <strong>no vende ni cede datos personales</strong> a terceros.
          No se recaban datos personales sensibles.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Para qué se usan</h2>
        <ul className={styles.list}>
          <li>Darte acceso a la aplicación y al panel con los permisos de tu rol.</li>
          <li>Coordinar la producción de eventos: tareas, chat del equipo, aprobaciones, anticipos y documentos.</li>
          <li>Enviarte avisos de lo que requiere tu atención.</li>
          <li>Mantener la seguridad de la cuenta y el historial de cambios que exige la operación.</li>
          <li>Cumplir obligaciones legales y requerimientos de autoridad competente.</li>
        </ul>
        <p className={styles.p}>No hay finalidades secundarias: los datos no se usan para mercadotecnia.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Con quién se comparten</h2>
        <p className={styles.p}>
          Solo con proveedores que ayudan a prestar el servicio y actúan por cuenta de {PUBLISHER_SHORT}:
          alojamiento de servidores y Google Firebase Cloud Messaging para entregar las notificaciones push. También
          con autoridades cuando exista una obligación legal. Dentro de {ORGANIZATION}, cada persona ve solo lo que
          le permite su rol.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Seguridad y conservación</h2>
        <p className={styles.p}>
          Toda la comunicación entre la aplicación y el servidor viaja <strong>cifrada</strong> (HTTPS). El acceso a
          la información está limitado al personal autorizado. Los datos se conservan mientras la cuenta esté
          activa y, después, solo el tiempo que exijan la ley o el contrato con {ORGANIZATION}.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tus derechos (ARCO) y eliminación de la cuenta</h2>
        <p className={styles.p}>
          Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos, o revocar tu
          consentimiento, escribiendo a{' '}
          <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}`}>
            {PUBLISHER_EMAIL}
          </a>{' '}
          con tu nombre, el correo de tu cuenta, un documento que acredite tu identidad y la descripción de lo que
          solicitas. Respondemos en los plazos que fija la ley.
        </p>
        <p className={styles.p}>
          Para eliminar tu cuenta y sus datos, sigue los pasos en{' '}
          <Link className={styles.link} href="/legal/eliminar-cuenta">
            Eliminar cuenta
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cambios a este aviso</h2>
        <p className={styles.p}>
          Si el aviso cambia, la versión vigente se publica en esta misma página con su fecha de actualización.
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
      </section>
    </main>
  );
}
