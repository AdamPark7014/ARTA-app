import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { generateSync } from 'otplib';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';

/**
 * Proves the org-level 2FA enforcement path end-to-end against a real DB:
 * a user with no 2FA enrolled, logging into an org with settingsJson.require2fa,
 * must be blocked from getting a real session until they complete enrollment.
 */
describe('Org-enforced 2FA (e2e, real DB)', () => {
  const prisma = new PrismaClient();
  const jwt = new JwtService({ secret: 'e2e-test-secret', signOptions: { expiresIn: '7d' } });
  let auth: AuthService;

  let enforcedOrg: { id: string };
  let openOrg: { id: string };
  let enforcedUser: { id: string; email: string };
  let openUser: { id: string; email: string };
  const PASSWORD = 'correct-horse-battery-staple';

  beforeAll(async () => {
    auth = new AuthService(prisma as never, jwt);
    const suffix = Date.now().toString(36);

    enforcedOrg = await prisma.organization.create({
      data: { slug: `org-2fa-on-${suffix}`, name: 'Org 2FA On', settingsJson: { require2fa: true } },
    });
    openOrg = await prisma.organization.create({
      data: { slug: `org-2fa-off-${suffix}`, name: 'Org 2FA Off' },
    });

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    enforcedUser = await prisma.user.create({
      data: {
        email: `enforced-${suffix}@example.com`,
        passwordHash,
        fullName: 'Enforced User',
        roleKey: 'gerente_arta',
        entities: ['ARTA'],
        organizationId: enforcedOrg.id,
      },
    });
    openUser = await prisma.user.create({
      data: {
        email: `open-${suffix}@example.com`,
        passwordHash,
        fullName: 'Open User',
        roleKey: 'gerente_arta',
        entities: ['ARTA'],
        organizationId: openOrg.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({ where: { userId: { in: [enforcedUser.id, openUser.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [enforcedUser.id, openUser.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [enforcedOrg.id, openOrg.id] } } });
    await prisma.$disconnect();
  });

  it('logs a user straight in when their org does not require 2FA', async () => {
    const result = await auth.login(openUser.email, PASSWORD);
    expect(result.requires2fa).toBe(false);
    expect((result as { requiresTotpEnrollment?: boolean }).requiresTotpEnrollment).toBeUndefined();
  });

  it('blocks a normal session and returns an enroll token when the org requires 2FA', async () => {
    const result = (await auth.login(enforcedUser.email, PASSWORD)) as {
      requiresTotpEnrollment?: boolean;
      enrollToken?: string;
    };
    expect(result.requiresTotpEnrollment).toBe(true);
    expect(typeof result.enrollToken).toBe('string');

    const payload = await jwt.verifyAsync<{ sub: string; scope: string }>(result.enrollToken!);
    expect(payload.scope).toBe('totp-enroll');
    expect(payload.sub).toBe(enforcedUser.id);
  });

  it('rejects completing enrollment before /2fa/setup has generated a secret', async () => {
    // Fresh user, never called setupTotp — no totpSecret on file yet.
    await expect(auth.completeTotpEnrollment(enforcedUser.id, '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an incorrect TOTP code during enrollment completion', async () => {
    await auth.setupTotp(enforcedUser.id);
    await expect(auth.completeTotpEnrollment(enforcedUser.id, '000000')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('completes enrollment with a valid code and issues a real session (the actual login)', async () => {
    const { secret } = await auth.setupTotp(enforcedUser.id);
    const code = generateSync({ secret });

    const result = await auth.completeTotpEnrollment(enforcedUser.id, code);
    expect(result.requires2fa).toBe(false);
    expect(result.user.id).toBe(enforcedUser.id);

    const dbUser = await prisma.user.findUnique({ where: { id: enforcedUser.id } });
    expect(dbUser?.totpEnabled).toBe(true);

    // Now that 2FA is enrolled, subsequent logins hit the normal challenge flow,
    // not the enrollment-forcing branch.
    const nextLogin = (await auth.login(enforcedUser.email, PASSWORD)) as {
      requires2fa?: boolean;
      requiresTotpEnrollment?: boolean;
    };
    expect(nextLogin.requires2fa).toBe(true);
    expect(nextLogin.requiresTotpEnrollment).toBeUndefined();
  });
});
