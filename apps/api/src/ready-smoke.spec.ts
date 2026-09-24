import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

describe('Boot readiness (Prisma mocked)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: async () => 1,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ready → 200', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(res.body?.status).toBe('ready');
    expect(res.body?.checks?.database).toBe('ok');
  });
});

