import Link from 'next/link';
import { panelLoginUrl } from '@/lib/domains';
import { siteSettings, type PublicSiteData } from '@/lib/public-site-data';
import { serviceHref } from '@/lib/site-blocks';
import { servicesOf, type SiteLink } from '@/lib/site-model';
import { contactFromSettings, socialProfiles } from '@/lib/site-seo';

type SiteFooterProps = {
  data: Pick<PublicSiteData, 'pages'>;
  links: SiteLink[];
  /** Foto que se asoma dentro de las letras. */
  markImage?: string | null;
};

/** El pie es el mapa del sitio: todas las páginas, los servicios, cómo escribir y lo legal. */
export function SiteFooter({ data, links, markImage }: SiteFooterProps) {
  const settings = siteSettings(data);
  const contact = contactFromSettings(settings);
  const socials = socialProfiles(settings);
  const services = links.some((link) => link.key === 'servicios') ? servicesOf(data) : [];

  return (
    <footer className="sa-footer">
      <div className="sa-footer__top">
        <div className="sa-footer__brand">
          <p className="sa-footer__tagline">{settings.tagline || 'La experiencia del Show'}</p>
          {settings.footerNote ? <p className="sa-footer__note">{settings.footerNote}</p> : null}
          <p className="sa-footer__tag">#LaExperienciadelShow</p>
        </div>
        <nav className="sa-footer__col" aria-label="Mapa del sitio">
          <h2>Sitio</h2>
          {links.map((link) => (
            <Link key={link.key} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        {services.length ? (
          <nav className="sa-footer__col" aria-label="Servicios">
            <h2>Servicios</h2>
            {services.map((service) => (
              <Link key={service.slug} href={serviceHref(service.slug)}>
                {service.title}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="sa-footer__col sa-footer__col--wide">
          <h2>Contacto</h2>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a> : null}
          <span>
            {contact.city}, {contact.state}
          </span>
          {socials.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer me">
              {p.label}
            </a>
          ))}
        </div>
        <div className="sa-footer__col">
          <h2>Legal</h2>
          <Link href="/legal/privacidad">Aviso de privacidad</Link>
          <Link href="/legal/terminos">Términos</Link>
          <a href={panelLoginUrl('ARTA')} rel="nofollow">
            Acceso del equipo
          </a>
        </div>
      </div>
      <div
        className="sa-footer__mark"
        role="img"
        aria-label="Arta"
        style={markImage ? { backgroundImage: `url(${markImage})` } : undefined}
      />
      <div className="sa-footer__bottom">
        <span>© {new Date().getFullYear()} Arta Producciones</span>
        <span>{contact.city}, México</span>
      </div>
    </footer>
  );
}
