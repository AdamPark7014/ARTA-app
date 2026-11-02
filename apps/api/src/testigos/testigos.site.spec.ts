import { BadRequestException } from '@nestjs/common';
import { TestigosController } from './testigos.controller';

/** «Subible a la página web» (01-11-2026): la foto cae como borrador en la galería de Studio. */
const user = { id: 'u1', roleKey: 'dir_general', entities: ['ARTA'], permissions: [], organizationId: 'org' };
const proof = {
  id: 't1',
  eventId: 'e1',
  title: 'Espectacular Atlixcáyotl',
  note: 'Del 1 al 20',
  fileUrl: '/uploads/a.jpg',
  mimeType: 'image/jpeg',
  isPublic: false,
  siteItemId: null as string | null,
  createdById: 'u1',
};

function build(row = proof) {
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', entity: 'ARTA', organizationId: 'org' }) },
    publicityProof: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data })),
      delete: jest.fn().mockResolvedValue(row),
    },
    siteItem: {
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma, controller: new TestigosController(prisma as never, {} as never) };
}

describe('testigos hacia el sitio', () => {
  it('mandar una foto crea un borrador en la galería, sin publicarla', async () => {
    const { controller, prisma } = build();
    await controller.update({ user }, 't1', { isPublic: true });
    expect(prisma.siteItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'foto', mediaUrl: '/uploads/a.jpg', active: false, title: proof.title }),
    });
    expect(prisma.publicityProof.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPublic: true, siteItemId: 'item-1' }) }),
    );
  });

  it('lo que no es foto no va a la galería', async () => {
    const { controller, prisma } = build({ ...proof, fileUrl: '/uploads/nota.pdf', mimeType: 'application/pdf' });
    await expect(controller.update({ user }, 't1', { isPublic: true })).rejects.toThrow(BadRequestException);
    expect(prisma.siteItem.create).not.toHaveBeenCalled();
  });

  it('volver a mandarla no la duplica', async () => {
    const { controller, prisma } = build({ ...proof, isPublic: true, siteItemId: 'item-1' });
    await controller.update({ user }, 't1', { isPublic: true });
    expect(prisma.siteItem.create).not.toHaveBeenCalled();
  });

  it('quitarla, o borrar el testigo, la quita también de la galería', async () => {
    const sent = { ...proof, isPublic: true, siteItemId: 'item-1' };
    const off = build(sent);
    await off.controller.update({ user }, 't1', { isPublic: false });
    expect(off.prisma.siteItem.deleteMany).toHaveBeenCalledWith({ where: { id: 'item-1' } });

    const gone = build(sent);
    await gone.controller.remove({ user }, 't1');
    expect(gone.prisma.siteItem.deleteMany).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });
});
