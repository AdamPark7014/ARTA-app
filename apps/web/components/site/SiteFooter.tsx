import { panelLoginUrl } from '@/lib/domains';
import { siteSettings, type PublicSiteData } from '@/lib/public-site-data';
import { contactFromSettings, socialProfiles } from '@/lib/site-seo';
import type { SiteNavLink } from './SiteHeader';

type SiteFooterProps = {
  data: Pick<PublicSiteData, 'pages'>;
  nav: SiteNavLink[];
  /** Foto que se asoma dentro de las letras. */
  markImage?: string | null;
};

export function SiteFooter({ data, nav, markImage }: SiteFooterProps) {
  const settings = siteSettings(data);
  const contact = contactFromSettings(settings);
  const socials = socialProfiles(settings);

  return (
    <footer className="sa-footer">
      <div className="sa-footer__top">
        <div className="sa-footer__brand">
          <p className="sa-footer__tagline">{settings.tagline || 'La experiencia del Show'}</p>
          {settings.footerNote ? <p className="sa-footer__note">{settings.footerNote}</p> : null}
          <p className="sa-footer__tag">#LaExperienciadelShow</p>
        </div>
        <nav className="sa-footer__col" aria-label="Sitio">
          <h2>Sitio</h2>
          {nav.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="sa-footer__col sa-footer__col--wide">
          <h2>Contacto</h2>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a> : null}
          <span>
            {contact.city}, {contact.state}
          </span>
        </div>
        {socials.length ? (
          <div className="sa-footer__col">
            <h2>Redes</h2>
            {socials.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer me">
                {p.label}
              </a>
            ))}
          </div>
        ) : null}
        <div className="sa-footer__col">
          <h2>Legal</h2>
          <a href="/legal/privacidad">Aviso de privacidad</a>
          <a href="/legal/terminos">Términos</a>
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
        <span>
          {contact.city}, México
        </span>
      </div>
    </footer>
  );
}
