import { fromAccessCookie } from './jwt.strategy';

describe('fromAccessCookie', () => {
  it('reads arta_access cookie', () => {
    expect(fromAccessCookie({ cookies: { arta_access: 'tok' } } as never)).toBe('tok');
  });

  it('ignores Authorization Bearer (cookie-only staff auth)', () => {
    expect(
      fromAccessCookie({
        cookies: {},
        headers: { authorization: 'Bearer ignore-me' },
      } as never),
    ).toBeNull();
  });
});
