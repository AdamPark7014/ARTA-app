import { ForbiddenException } from '@nestjs/common';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { StudioController } from './studio.controller';

/**
 * Studio edita el sitio público artaproducciones.com, que es uno solo (PageContent, HeroSlide y
 * NewsPost no llevan organizationId). Tener studio.edit en otra organización no basta para escribirlo.
 */
describe('StudioController · escrituras solo desde la organización de Arta', () => {
  function setup() {
    const model = () => ({
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: 'nuevo' })),
      update: jest.fn(async () => ({ id: 'x' })),
      upsert: jest.fn(async () => ({ id: 'pagina' })),
      delete: jest.fn(async () => ({ id: 'x' })),
    });
    const prisma = {
      pageContent: model(),
      heroSlide: model(),
      newsPost: model(),
      auditLog: { create: jest.fn(async () => ({})) },
    };
    return { controller: new StudioController(prisma as never), prisma };
  }

  const artaDirector = { id: 'u-arta', roleKey: 'dir_general', permissions: [], organizationId: DEFAULT_ORG_ID };
  const foreignDirector = { id: 'u-otra', roleKey: 'dir_general', permissions: [], organizationId: 'org_cliente_x' };

  const page = { sectionKey: 'hero', title: 'Inicio', contentJson: { titulo: 'Hola' }, published: true };
  const slide = { title: 'Concierto', imageUrl: '/uploads/slide.jpg' };
  const news = { slug: 'nota', title: 'Nota', published: true };

  // [nombre, modelo y método de Prisma que escribe, llamada]
  const writes: Array<[string, string, string, (c: StudioController, user: object) => unknown]> = [
    ['PUT pages', 'pageContent', 'upsert', (c, user) => c.upsert({ user } as never, page as never)],
    ['POST slides', 'heroSlide', 'create', (c, user) => c.createSlide({ user } as never, slide as never)],
    ['PUT slides/:id', 'heroSlide', 'update', (c, user) => c.updateSlide({ user } as never, 's-1', slide as never)],
    ['DELETE slides/:id', 'heroSlide', 'delete', (c, user) => c.deleteSlide({ user } as never, 's-1')],
    ['POST news', 'newsPost', 'create', (c, user) => c.createNews({ user } as never, news as never)],
    ['PUT news/:id', 'newsPost', 'update', (c, user) => c.updateNews({ user } as never, 'n-1', news as never)],
    ['DELETE news/:id', 'newsPost', 'delete', (c, user) => c.deleteNews({ user } as never, 'n-1')],
  ];

  describe.each(writes)('%s', (_name, modelName, method, call) => {
    it('dir_general de otra organización recibe 403 y no se escribe nada', async () => {
      const { controller, prisma } = setup();
      await expect(Promise.resolve().then(() => call(controller, foreignDirector))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect((prisma as any)[modelName][method]).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('dir_general de org_arta_internal sigue escribiendo', async () => {
      const { controller, prisma } = setup();
      await call(controller, artaDirector);
      expect((prisma as any)[modelName][method]).toHaveBeenCalledTimes(1);
    });
  });

  it('super_admin puede escribir desde cualquier organización', async () => {
    const { controller, prisma } = setup();
    await controller.createNews(
      { user: { ...foreignDirector, roleKey: 'super_admin' } } as never,
      news as never,
    );
    expect(prisma.newsPost.create).toHaveBeenCalledTimes(1);
  });

  it('dentro de Arta, un rol sin studio.edit sigue sin poder escribir', async () => {
    const { controller, prisma } = setup();
    await expect(
      Promise.resolve().then(() =>
        controller.createSlide(
          { user: { id: 'u-log', roleKey: 'logistica', permissions: [], organizationId: DEFAULT_ORG_ID } } as never,
          slide as never,
        ),
      ),
    ).rejects.toThrow('Sin permiso de Studio');
    expect(prisma.heroSlide.create).not.toHaveBeenCalled();
  });
});
