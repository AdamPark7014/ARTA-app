import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

describe('AppModule DI smoke test', () => {
  it('compiles AppModule with Prisma mocked (no DB required)', async () => {
    // Minimal env required by AuthModule
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn(),
      })
      .compile();
    expect(moduleRef).toBeDefined();
  });
});

