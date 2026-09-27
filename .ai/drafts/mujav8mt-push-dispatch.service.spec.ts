import { PushDispatchService } from './push-dispatch.service';
import { PrismaService } from '@nestjs/prisma';
import { Injectable } from '@nestjs/common';
import { RawQueryBuilderService } from '@nestjs/typeorm';

describe('PushDispatchService', () => {
  let service: PushDispatchService;
  let prismaService: PrismaService;
  let rawQueryBuilderService: RawQueryBuilderService;

  beforeEach(() => {
    prismaService = {
      notification: {
        count: jest.fn(),
      },
    } as PrismaService;

    rawQueryBuilderService = {
      buildRawQuery: jest.fn(),
    } as RawQueryBuilderService;

    service = new PushDispatchService(prismaService, rawQueryBuilderService);
  });

  describe('appBadge', () => {
    it('sums prisma.notification.count and the chat raw query count', async () => {
      const prismaCount = 10;
      const rawQueryCount = 5;
      const expectedResult = prismaCount + rawQueryCount;

      prismaService.notification.count.mockResolvedValue(prismaCount);
      rawQueryBuilderService.buildRawQuery.mockResolvedValue(rawQueryCount);

      const result = await service.appBadge();

      expect(result).toBe(expectedResult);
      expect(prismaService.notification.count).toHaveBeenCalled();
      expect(rawQueryBuilderService.buildRawQuery).toHaveBeenCalled();
    });

    it('returns 0 when both prisma and raw query counts are 0', async () => {
      prismaService.notification.count.mockResolvedValue(0);
      rawQueryBuilderService.buildRawQuery.mockResolvedValue(0);

      const result = await service.appBadge();

      expect(result).toBe(0);
      expect(prismaService.notification.count).toHaveBeenCalled();
      expect(rawQueryBuilderService.buildRawQuery).toHaveBeenCalled();
    });
  });

  describe('buildData', () => {
    it('keeps badge empty string when null', () => {
      const input = null;
      const expectedResult = '';

      const result = service.buildData(input, '');

      expect(result).toBe(expectedResult);
    });

    it('stringifies numbers', () => {
      const input = 123;
      const expectedResult = '123';

      const result = service.buildData(input, '');

      expect(result).toBe(expectedResult);
    });
  });
});