import { PushDispatchService } from './push-dispatch.service';

describe('PushDispatchService', () => {
  const prisma = {
    notification: { count: jest.fn() },
    $queryRaw: jest.fn(),
    userPushEndpoint: { findMany: jest.fn(), delete: jest.fn() },
  };
  const service = new PushDispatchService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('appBadge suma avisos sin leer y chat sin leer', async () => {
    prisma.notification.count.mockResolvedValue(2);
    prisma.$queryRaw.mockResolvedValue([{ n: 5 }]);
    await expect(service.appBadge('u1')).resolves.toBe(7);
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'u1', readAt: null } });
  });

  it('appBadge tolera chat vacío', async () => {
    prisma.notification.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.appBadge('u1')).resolves.toBe(0);
  });

  it('buildData deja el globo vacío si es null y lo pasa a texto si es número', () => {
    expect(service.buildData({ title: 't', body: 'b', badge: null }).badge).toBe('');
    expect(service.buildData({ title: 't', body: 'b', badge: 4 }).badge).toBe('4');
  });
});
