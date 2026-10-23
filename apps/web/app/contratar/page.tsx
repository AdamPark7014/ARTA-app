import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildPublicMetadata, simplePageGraphJsonLd } from '@/lib/site-seo';
import LegalLayout from '../legal/layout';
import styles from '../legal/legal.module.css';
import {
  APP_NAME,
  ORGANIZATION,
  PUBLISHER,
  PUBLISHER_EMAIL,
  PUBLISHER_PHONE,
  PUBLISHER_PHONE_HREF,
  PUBLISHER_SHORT,
} from '../legal/legal-data';

const PAGE = {
  path: '/contratar',
  name: 'Contratar ARTA para tu productora o recinto',
  description:
    'ARTA para productoras de eventos y recintos: tareas, chat por evento, aprobaciones, anticipos y formatos. Solicita el espacio de tu organización.',
};

export const metadata: Metadata = buildPublicMetadata({
  title: PAGE.name,
  description: PAGE.description,
  path: PAGE.path,
});

const NEXARA_CONTACT_URL = 'https://nexara.com.mx/contacto';
const MAIL_SUBJECT = encodeURIComponent(`Quiero ${APP_NAME} para mi organización`);

/**
 * Vía pública para contratar la plataforma (la enlazan la ficha de App Store y
 * Google Play y la pantalla de entrada de la app). Sin sesión ni barra del panel.
 */
export default function ContratarPage() {
  return (
    <LegalLayout>
      <main>
        <JsonLd data={simplePageGraphJsonLd(PAGE)} />
        <p className={styles.eyebrow}>Contratar</p>
        <h1 className={styles.title}>{APP_NAME} para tu productora o recinto</h1>

        <p className={styles.lead}>
          {APP_NAME} es la plataforma de operación de eventos en vivo: tareas con evidencia y vencimiento, chat del
          equipo por evento, aprobación de órdenes de compra y anticipos desde el teléfono, formatos estándar,
          calendario y corrida financiera. Cada organización tiene su propio espacio aislado: su administrador da de
          alta a su equipo y decide qué ve cada persona.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Qué incluye</h2>
          <ul className={styles.list}>
            <li>
              <strong>App para iPhone y Android</strong> con Inicio, Chats, Tareas, Avisos y Más, y el panel web
              completo con la misma cuenta.
            </li>
            <li>
              <strong>Tareas y aprobaciones:</strong> entregas con evidencia, órdenes de compra, anticipos y firmas, con
              avisos al momento.
            </li>
            <li>
              <strong>Chat del equipo:</strong> canales por evento, mensajes directos y grupos, con fotos, videos, notas
              de voz y documentos; reporte y bloqueo de personas.
            </li>
            <li>
              <strong>Eventos y formatos:</strong> calendario, ficha de cada show, checklists de producción, catering,
              hospedaje, transportación, rueda de prensa y más.
            </li>
            <li>
              <strong>Varias unidades de negocio</strong> en una misma organización (por ejemplo, una productora y el
              recinto que opera), cada una con su propio tema y datos.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Cómo empezar</h2>
          <ol className={styles.list}>
            <li>
              <strong>Pruébala antes.</strong> En la app, toca «Explorar {APP_NAME} con datos de muestra» en la pantalla
              de entrada: recorres todas las funciones sin cuenta ni conexión, con datos ficticios.
            </li>
            <li>
              <strong>Escríbenos.</strong> Cuéntanos quién eres y cuántas personas operan tus eventos:{' '}
              <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}?subject=${MAIL_SUBJECT}`}>
                {PUBLISHER_EMAIL}
              </a>
              , llámanos al{' '}
              <a className={styles.link} href={PUBLISHER_PHONE_HREF}>
                {PUBLISHER_PHONE}
              </a>{' '}
              o deja tus datos en{' '}
              <a className={styles.link} href={NEXARA_CONTACT_URL} rel="noopener noreferrer">
                nexara.com.mx/contacto
              </a>
              .
            </li>
            <li>
              <strong>Creamos tu espacio.</strong> Te entregamos la organización con tu cuenta de administración; desde
              ahí das de alta a tu equipo, sus roles y tus unidades de negocio.
            </li>
            <li>
              <strong>Entra con tu equipo.</strong> Cada persona instala la app desde App Store o Google Play, o usa el
              panel web, con la cuenta que le creó su administrador.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Quién la desarrolla</h2>
          <p className={styles.p}>
            {APP_NAME} la desarrolla y opera <strong>{PUBLISHER}</strong> ({PUBLISHER_SHORT}).{' '}
            <strong>{ORGANIZATION}</strong>, productora de eventos en Puebla, es la primera organización que la usa y
            presta su nombre a la plataforma. Las condiciones del servicio están en los{' '}
            <Link className={styles.link} href="/legal/terminos">
              Términos de uso
            </Link>{' '}
            y el tratamiento de datos en el{' '}
            <Link className={styles.link} href="/legal/privacidad">
              Aviso de privacidad
            </Link>
            .
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Contacto</h2>
          <div className={styles.contactBox}>
            <p>
              <strong>{PUBLISHER_SHORT}:</strong>{' '}
              <a className={styles.link} href={`mailto:${PUBLISHER_EMAIL}?subject=${MAIL_SUBJECT}`}>
                {PUBLISHER_EMAIL}
              </a>{' '}
              ·{' '}
              <a className={styles.link} href={PUBLISHER_PHONE_HREF}>
                {PUBLISHER_PHONE}
              </a>{' '}
              ·{' '}
              <a className={styles.link} href={NEXARA_CONTACT_URL} rel="noopener noreferrer">
                nexara.com.mx/contacto
              </a>
            </p>
          </div>
        </section>
      </main>
    </LegalLayout>
  );
}
