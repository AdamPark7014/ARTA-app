import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join, sep } from 'path';
import * as os from 'os';
import * as FS from 'fs';

describe('Static /uploads guard order + in-app inline (no DB)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let uploadDir: string;
  const testFileName = 'test-static.xlsx';
  let testFilePath: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
    // Asegura que controladores que usan uploadRoot apunten a un dir temporal REAL.
    uploadDir = mkdtempSync(join(os.tmpdir(), 'arta-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
    testFilePath = join(uploadDir, testFileName);

    const mockPrisma: Partial<PrismaService> = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      // Inline endpoint lookups
      eventFile: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where?.id === 'f1') {
            return {
              id: 'f1',
              fileName: testFileName,
              url: `/uploads/${testFileName}`,
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              kind: 'excel',
              eventId: 'e1',
              event: { id: 'e1', name: 'Demo', entity: 'ARTA', organizationId: 'org1', status: 'DRAFT' },
            };
          }
          return null;
        }),
      } as any,
      event: {
        findUnique: jest.fn().mockResolvedValue({ id: 'e1', entity: 'ARTA', organizationId: 'org1', status: 'DRAFT' }),
      } as any,
      organization: {
        findUnique: jest.fn().mockResolvedValue(null),
      } as any,
      userSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          lastSeenAt: new Date(),
        }),
        update: jest.fn(),
      } as any,
    };

    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts setup to ensure /uploads static + guard + cookies exist
    const { configureApp } = await import('../bootstrap-config');
    await configureApp(app as any);
    await app.init();
    jwt = app.get(JwtService);

    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    writeFileSync(testFilePath, Buffer.from('dummy'));
  });

  afterAll(async () => {
    await app.close();
    try {
      rmSync(uploadDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('direction cookie gets 200 on static .xlsx', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      email: 'a@b.com',
      roleKey: 'super_admin',
      entities: ['ARTA', 'EXPLANADA'],
      permissions: [],
      fullName: 'Direction',
      jti: 'jti-dir',
    } as any);
    await request(app.getHttpServer())
      .get(`/uploads/${testFileName}`)
      .set('Cookie', [`arta_access=${token}`])
      .expect(200);
  });

  it('non-direction gets 403 on static .xlsx', async () => {
    const token = await jwt.signAsync({
      sub: 'u2',
      email: 'l@b.com',
      roleKey: 'logistica',
      entities: ['ARTA'],
      permissions: [],
      fullName: 'Logistica',
      jti: 'jti-log',
    } as any);
    await request(app.getHttpServer()).get(`/uploads/${testFileName}`).set('Cookie', [`arta_access=${token}`]).expect(403);
  });

  it('non-direction with event access gets 200 via in-app inline endpoint', async () => {
    // Bypass full JWT guard by issuing a cookie with valid jti via AuthService policy; here we reuse JwtService and mock userSession
    const token = await jwt.signAsync({
      sub: 'u3',
      email: 'l@b.com',
      roleKey: 'logistica',
      entities: ['ARTA'],
      permissions: ['checklist.edit', 'campaign.view', 'finance.view'],
      fullName: 'Logistica',
      jti: 'test-jti',
      organizationId: 'org1',
    } as any);
    await request(app.getHttpServer())
      .get('/files/f1/inline')
      .set('Cookie', [`arta_access=${token}`, 'arta_session=1', 'arta_csrf=abc'])
      .expect(200);
  });

  it('eventless EventFile inline denies non-direction', async () => {
    // Rewire prisma mock to return an eventless file
    const prisma = app.get(PrismaService) as any;
    prisma.eventFile.findUnique = jest.fn().mockResolvedValue({
      id: 'f2',
      fileName: testFileName,
      url: `/uploads/${testFileName}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'excel',
      eventId: null,
      event: null,
    });
    const token = await jwt.signAsync({
      sub: 'u4',
      email: 'u@b.com',
      roleKey: 'logistica',
      entities: ['ARTA'],
      permissions: [],
      organizationId: 'org1',
      jti: 'test-jti-2',
      fullName: 'Usuario Logistica',
    } as any);
    await request(app.getHttpServer())
      .get('/files/f2/inline')
      .set('Cookie', [`arta_access=${token}`, 'arta_session=1', 'arta_csrf=abc'])
      .expect(403);
  });

  it('eventless EventFile inline allows direction', async () => {
    const prisma = app.get(PrismaService) as any;
    prisma.eventFile.findUnique = jest.fn().mockResolvedValue({
      id: 'f3',
      fileName: testFileName,
      url: `/uploads/${testFileName}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'excel',
      eventId: null,
      event: null,
    });
    const token = await jwt.signAsync({
      sub: 'u5',
      email: 'd@b.com',
      roleKey: 'dir_general',
      entities: ['ARTA', 'EXPLANADA'],
      permissions: [],
      organizationId: 'org1',
      jti: 'test-jti-3',
      fullName: 'Dirección',
    } as any);
    await request(app.getHttpServer())
      .get('/files/f3/inline')
      .set('Cookie', [`arta_access=${token}`, 'arta_session=1', 'arta_csrf=abc'])
      .expect(200);
  });

  it('no cookie gets 401 on static .xlsx', async () => {
    await request(app.getHttpServer()).get(`/uploads/${testFileName}`).expect(401);
  });

  it('public root image needs no session', async () => {
    writeFileSync(join(uploadDir, 'portada.jpg'), Buffer.from('jpg'));
    await request(app.getHttpServer()).get('/uploads/portada.jpg').expect(200);
  });

  it('private PDF and chat image need a session', async () => {
    writeFileSync(join(uploadDir, 'comprobante.pdf'), Buffer.from('%PDF'));
    mkdirSync(join(uploadDir, 'chat'), { recursive: true });
    writeFileSync(join(uploadDir, 'chat', 'foto.jpg'), Buffer.from('jpg'));
    await request(app.getHttpServer()).get('/uploads/comprobante.pdf').expect(401);
    await request(app.getHttpServer()).get('/uploads/chat/foto.jpg').expect(401);
    const token = await jwt.signAsync({
      sub: 'u6', email: 'x@b.com', roleKey: 'logistica', entities: ['ARTA'], permissions: [],
      fullName: 'X', jti: 'jti-x',
    } as any);
    await request(app.getHttpServer()).get('/uploads/comprobante.pdf').set('Cookie', [`arta_access=${token}`]).expect(200);
    await request(app.getHttpServer()).get('/uploads/chat/foto.jpg').set('Cookie', [`arta_access=${token}`]).expect(200);
  });

  it('revoked session is rejected on private files', async () => {
    const prisma = app.get(PrismaService) as any;
    const prev = prisma.userSession.findFirst;
    prisma.userSession.findFirst = jest.fn().mockResolvedValue({
      id: 's2', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(),
    });
    const token = await jwt.signAsync({
      sub: 'u7', email: 'r@b.com', roleKey: 'logistica', entities: ['ARTA'], permissions: [],
      fullName: 'R', jti: 'jti-revoked',
    } as any);
    await request(app.getHttpServer()).get('/uploads/comprobante.pdf').set('Cookie', [`arta_access=${token}`]).expect(401);
    prisma.userSession.findFirst = prev;
  });

  it('vendor portal token can read private files but not originals', async () => {
    const token = await jwt.signAsync({ typ: 'vendor', pinId: 'p1' } as any);
    await request(app.getHttpServer()).get('/uploads/comprobante.pdf').set('Cookie', [`arta_vendor=${token}`]).expect(200);
    await request(app.getHttpServer()).get(`/uploads/${testFileName}`).set('Cookie', [`arta_vendor=${token}`]).expect(403);
  });
});

