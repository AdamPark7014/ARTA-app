import { NextRequest, NextResponse } from 'next/server';
import {
  ENTITY_COOKIE,
  HANDOFF_PARAM,
  ROOT_DOMAIN,
  SESSION_COOKIE,
  entityFromHost,
  isPublicPath,
  safePanelPath,
} from '@/lib/domains';

/** Paneles fuera de Google: también cubre /p, /legal y /login servidos en arta.* y auditorio.*. */
function panelNoIndex<T extends NextResponse>(response: T, isPanelHost: boolean): T {
  if (isPanelHost) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const hostEntity = entityFromHost(hostname);

  // www → dominio raíz (permanente): una sola versión del sitio para buscadores y enlaces.
  if (hostname.toLowerCase().split(':')[0] === `www.${ROOT_DOMAIN}`) {
    return NextResponse.redirect(
      new URL(`${pathname}${request.nextUrl.search}`, `https://${ROOT_DOMAIN}`),
      308,
    );
  }

  const requestHeaders = new Headers(request.headers);
  if (hostEntity) {
    requestHeaders.set('x-arta-entity', hostEntity);
  }

  // Panel hosts: / → dashboard (no sitio público)
  if (hostEntity && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return panelNoIndex(NextResponse.redirect(url), true);
  }

  // Apex / www: la raíz siempre es el sitio público (no panel). Permanente (308): la portada canónica es
  // /p/arta y Google consolida ahí la raíz; con 307 la trataba como temporal y no pasaba la relevancia.
  if (!hostEntity && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/p/arta';
    return NextResponse.redirect(url, 308);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (hostEntity) {
    response.cookies.set(ENTITY_COOKIE, hostEntity, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });
  }

  // Auth gate only on entity subdomains for panel routes
  if (hostEntity && !isPublicPath(pathname)) {
    const session = request.cookies.get(SESSION_COOKIE);
    const access = request.cookies.get('arta_access');
    const hasHandoff = searchParams.has(HANDOFF_PARAM);
    const authed = (session && session.value === '1') || !!access?.value;
    if (!authed && !hasHandoff) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      loginUrl.searchParams.set('next', safePanelPath(pathname + (request.nextUrl.search || '')));
      return panelNoIndex(NextResponse.redirect(loginUrl), true);
    }
  }

  return panelNoIndex(response, Boolean(hostEntity));
}

export const config = {
  // `pdf.worker.min.mjs` es el worker de pdf.js que sirve el editor de PDF:
  // es un asset estático de public/ y no debe pasar por el gate de sesión.
  // El manifiesto y los íconos se piden sin cookies (instalar la PWA) y el SW de
  // avisos se revisa en segundo plano: una redirección a /login los rompería.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|manifest.webmanifest|firebase-messaging-sw.js|icons/).*)',
  ],
};
