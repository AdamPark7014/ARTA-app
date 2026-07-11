import { NextRequest, NextResponse } from 'next/server';
import {
  ENTITY_COOKIE,
  HANDOFF_PARAM,
  SESSION_COOKIE,
  entityFromHost,
  isPublicPath,
} from '@/lib/domains';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const hostEntity = entityFromHost(hostname);

  const requestHeaders = new Headers(request.headers);
  if (hostEntity) {
    requestHeaders.set('x-arta-entity', hostEntity);
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
    const hasHandoff = searchParams.has(HANDOFF_PARAM);
    if ((!session || session.value !== '1') && !hasHandoff) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      loginUrl.searchParams.set('next', pathname + (request.nextUrl.search || ''));
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
