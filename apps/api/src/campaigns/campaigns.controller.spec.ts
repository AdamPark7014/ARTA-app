import { BadRequestException } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';

/**
 * Junta 11-09-2026: la campaña pasa por revisión. Lo que importa proteger:
 * - lo que está en revisión no se edita por debajo;
 * - conceptos y convenios llevan revisiones separadas y no se pisan;
 * - enviar a revisión le avisa a quien autoriza en esa entidad.
 */
describe('CampaignsController · revisión', () => {
  const ORG = 'org_arta_internal';
  const event = { id: 'ev1', name: 'Granja Maldita', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG, campaignType: 'NONE' };

  const user = (roleKey: string) => ({
    id: `u-${roleKey}`,
    roleKey,
    entities: ['ARTA', 'EXPLANADA'],
    permissions: [] as string[],
    fullName: 'Persona de prueba',
    organizationId: ORG,
  });

  function setup(campaign: Record<string, unknown>) {
    const upsert = jest.fn(async (args: unknown) => args);
    const notifyMany = jest.fn(async () => []);
    const notify = jest.fn(async () => null);
    const prisma = {
      event: { findUnique: async () => event },
      campaign: {
        findUnique: async () => campaign,
        upsert,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...campaign, ...data }),
        create: async () => campaign,
      },
      auditLog: { create: async () => ({}), findFirst: async () => null },
      user: {
        findMany: async () => [
          { id: 'g-arta', roleKey: 'gerente_arta', entities: ['ARTA'] },
          { id: 'g-aud', roleKey: 'gerente_arta', entities: ['EXPLANADA'] },
          { id: 'dir', roleKey: 'dir_general', entities: [] },
        ],
      },
    };
    const controller = new CampaignsController(prisma as never, { notify, notifyMany } as never);
    return { controller, upsert, notifyMany };
  }

  const base = {
    id: 'c1',
    eventId: 'ev1',
    authorized: false,
    status: 'DRAFT',
    convenioStatus: 'DRAFT',
    dataJson: { concepts: [{ concept: 'BARDAS', qty: 2 }] },
  };

  it('no deja cambiar conceptos de una campaña en revisión', async () => {
    const { controller, upsert } = setup({ ...base, status: 'REVIEW' });
    await expect(
      controller.upsert({ user: user('dir_general') }, 'ev1', { dataJson: { concepts: [] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('los convenios se guardan aunque la campaña esté en revisión, sin borrar sus conceptos', async () => {
    const { controller, upsert } = setup({ ...base, status: 'REVIEW' });
    await controller.upsert({ user: user('dir_general') }, 'ev1', {
      dataJson: { convenios: [{ concept: 'TV AZTECA', zona: 'Oro', qty: 4, price: 800 }] },
    });
    const args = upsert.mock.calls[0][0] as { update: { dataJson: Record<string, unknown> } };
    expect(args.update.dataJson.concepts).toEqual(base.dataJson.concepts);
    expect(args.update.dataJson.convenios).toHaveLength(1);
  });

  it('enviar a revisión avisa a dirección y a la gerencia de esa entidad, no a la de otra', async () => {
    const { controller, notifyMany } = setup(base);
    await controller.setStatus({ user: user('logistica') }, 'ev1', { status: 'REVIEW' });
    const calls = notifyMany.mock.calls as unknown as Array<[Array<{ userId: string; type: string }>]>;
    const recipients = calls[0][0];
    expect(recipients.map((r) => r.userId).sort()).toEqual(['dir', 'g-arta']);
    expect(recipients[0].type).toBe('campaign.review');
  });

  it('quien solo edita no puede autorizar', async () => {
    const { controller } = setup({ ...base, status: 'REVIEW' });
    await expect(
      controller.setStatus({ user: user('logistica') }, 'ev1', { status: 'AUTHORIZED' }),
    ).rejects.toThrow('Solo gerencia de Arta o dirección');
  });
});
