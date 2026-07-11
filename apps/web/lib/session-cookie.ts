import {
  ENTITY_COOKIE,
  ROOT_DOMAIN,
  SESSION_COOKIE,
  isLocalHostname,
  type EntityKey,
} from '@/lib/domains';

export function setSessionCookie(active: boolean) {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname;
  const isHttps = window.location.protocol === 'https:';
  const onRootDomain = hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
  const secureFlag = isHttps ? '; Secure' : '';
  const domainFlag = onRootDomain && !isLocalHostname(hostname) ? `; Domain=.${ROOT_DOMAIN}` : '';

  if (active) {
    document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=86400${domainFlag}${secureFlag}`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${domainFlag}${secureFlag}`;
  }
}

export function setEntityCookie(entity: EntityKey) {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname;
  const isHttps = window.location.protocol === 'https:';
  const onRootDomain = hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
  const secureFlag = isHttps ? '; Secure' : '';
  const domainFlag = onRootDomain && !isLocalHostname(hostname) ? `; Domain=.${ROOT_DOMAIN}` : '';
  document.cookie = `${ENTITY_COOKIE}=${entity}; Path=/; SameSite=Lax; Max-Age=86400${domainFlag}${secureFlag}`;
}
