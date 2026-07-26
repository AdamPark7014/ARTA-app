import { ForbiddenException } from '@nestjs/common';
import { CsrfMiddleware } from './csrf.middleware';

function mockReq(partial: {
  method?: string;
  url?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  return {
    method: partial.method || 'POST',
    originalUrl: partial.url || '/events',
    url: partial.url || '/events',
    cookies: partial.cookies || {},
    headers: partial.headers || {},
  } as never;
}

describe('CsrfMiddleware (cookie-only session)', () => {
  const mw = new CsrfMiddleware();
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  it('skips safe methods', () => {
    expect(() => mw.use(mockReq({ method: 'GET' }), {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('skips when no session cookie (anonymous)', () => {
    expect(() => mw.use(mockReq({ method: 'POST' }), {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('does not treat Authorization Bearer as a session (cookie-only)', () => {
    expect(() =>
      mw.use(
        mockReq({
          method: 'POST',
          headers: { authorization: 'Bearer stolen.jwt.here' },
        }),
        {} as never,
        next,
      ),
    ).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('rejects authenticated mutation without matching CSRF header', () => {
    expect(() =>
      mw.use(
        mockReq({
          method: 'POST',
          cookies: { arta_access: 'jwt', arta_csrf: 'abc' },
        }),
        {} as never,
        next,
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows when cookie and header CSRF match', () => {
    expect(() =>
      mw.use(
        mockReq({
          method: 'PATCH',
          cookies: { arta_access: 'jwt', arta_csrf: 'abc' },
          headers: { 'x-csrf-token': 'abc' },
        }),
        {} as never,
        next,
      ),
    ).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
