jest.mock('otplib', () => ({
  generateSecret: () => 'secret',
  generateURI: () => 'uri',
  verifySync: () => true,
}));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

describe('AppModule boot (smoke)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: async () => 1,
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('GET /health returns ok without DB', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
  it('GET /ready returns 200 with mocked DB', async () => {
    await request(app.getHttpServer()).get('/ready').expect(200);
  });
});

