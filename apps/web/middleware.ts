import { NextRequest, NextResponse } from 'next/server';
import {
  ENTITY_COOKIE,
  HANDOFF_PARAM,
  SESSION_COOKIE,
  entityFromHost,
  isPublicPath,
  safePanelPath,
} from '@/lib/domains';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const hostEntity = entityFromHost(hostname);

  const requestHeaders = new Headers(request.headers);
  if (hostEntity) {
    requestHeaders.set('x-arta-entity', hostEntity);
  }

  // Panel hosts: / → dashboard (no sitio público)
  if (hostEntity && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Apex / www: la raíz siempre es el sitio público (no panel).
  if (!hostEntity && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/p/arta';
    return NextResponse.redirect(url);
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
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
