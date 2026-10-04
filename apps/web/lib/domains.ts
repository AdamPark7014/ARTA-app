export type EntityKey = 'ARTA' | 'EXPLANADA';

export const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'artaproducciones.com';

export const ARTA_HOST =
  process.env.NEXT_PUBLIC_ARTA_HOST || `arta.${ROOT_DOMAIN}`;

export const AUDITORIO_HOST =
  process.env.NEXT_PUBLIC_AUDITORIO_HOST || `auditorio.${ROOT_DOMAIN}`;

export const SESSION_COOKIE = 'arta_session';
export const ENTITY_COOKIE = 'arta_host_entity';
export const HANDOFF_PARAM = '_nxt';

/** Hostnames that map to a fixed entity panel. */
export function entityFromHost(hostname: string): EntityKey | null {
  const host = hostname.toLowerCase().split(':')[0];
  if (host === ARTA_HOST.toLowerCase() || host === `arta.localhost`) return 'ARTA';
  if (host === AUDITORIO_HOST.toLowerCase() || host === `auditorio.localhost`) {
    return 'EXPLANADA';
  }
  if (host.startsWith('arta.') && host.endsWith(`.${ROOT_DOMAIN}`)) return 'ARTA';
  if (host.startsWith('auditorio.') && host.endsWith(`.${ROOT_DOMAIN}`)) return 'EXPLANADA';
  return null;
}

export function hostForEntity(entity: EntityKey): string {
  return entity === 'ARTA' ? ARTA_HOST : AUDITORIO_HOST;
}

/** URL absoluta al panel (login, dashboard, etc.) desde sitio público o correos. */
export function panelUrl(entity: EntityKey, path = '/dashboard'): string {
  const host = hostForEntity(entity);
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${host}${clean}`;
  }
  return `https://${host}${clean}`;
}

export function panelLoginUrl(entity: EntityKey = 'ARTA'): string {
  return panelUrl(entity, '/login');
}

/** Sitio público en el dominio raíz (marketing). */
export function publicSiteUrl(path = '/p/arta'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${ROOT_DOMAIN}${clean}`;
  }
  return `https://${ROOT_DOMAIN}${clean}`;
}

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().split(':')[0];
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

/** True when we are on a dedicated entity subdomain (prod or hosts-file). */
export function isEntitySubdomain(hostname: string): boolean {
  return entityFromHost(hostname) !== null;
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true;
  if (pathname.startsWith('/invite')) return true;
  if (pathname.startsWith('/p/')) return true;
  // Aviso de privacidad, términos, eliminar cuenta y soporte: los enlazan App Store y Google Play.
  if (pathname.startsWith('/legal')) return true;
  if (pathname.startsWith('/v/')) return true;
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/brand')) return true;
  if (pathname.startsWith('/uploads')) return true;
  if (pathname.startsWith('/api')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

/** Only panel routes should hard-redirect to /login on 401. */
export function shouldAuthRedirectOn401(pathname: string, hostname: string): boolean {
  if (isPublicPath(pathname)) return false;
  const hostEntity = entityFromHost(hostname);
  // Apex/www: public marketing site — never yank visitors to login on auth errors.
  if (!hostEntity) return false;
  return true;
}

/** Safe post-login destination (never bounce to public site). */
export function safePanelPath(next: string | null | undefined): string {
  const path = (next || '/dashboard').trim() || '/dashboard';
  if (!path.startsWith('/')) return '/dashboard';
  if (path === '/' || path.startsWith('/p/') || path.startsWith('/login') || path.startsWith('/v/')) {
    return '/dashboard';
  }
  return path;
}
