import { generateSecret, generateSync } from 'otplib';

import { verifyTotpCode } from './totp';

describe('verifyTotpCode', () => {
  const secret = generateSecret();
  const now = Math.floor(Date.now() / 1000);
  const codeAt = (epoch: number) => generateSync({ secret, epoch });

  it('acepta el código del periodo actual', () => {
    expect(verifyTotpCode(codeAt(now), secret)).toBe(true);
  });

  it('acepta el del periodo anterior y el siguiente (tecleado al filo o reloj corrido)', () => {
    expect(verifyTotpCode(codeAt(now - 30), secret)).toBe(true);
    expect(verifyTotpCode(codeAt(now + 30), secret)).toBe(true);
  });

  it('rechaza un código de hace más de un periodo', () => {
    expect(verifyTotpCode(codeAt(now - 120), secret)).toBe(false);
  });

  it('limpia espacios y guiones del autollenado', () => {
    const code = codeAt(now);
    expect(verifyTotpCode(`${code.slice(0, 3)} ${code.slice(3)}`, secret)).toBe(true);
    expect(verifyTotpCode(`${code.slice(0, 3)}-${code.slice(3)}`, secret)).toBe(true);
  });

  it('un código mal formado es inválido, no una excepción', () => {
    expect(verifyTotpCode('12345', secret)).toBe(false);
    expect(verifyTotpCode('abcdef', secret)).toBe(false);
    expect(verifyTotpCode('', secret)).toBe(false);
  });
});
