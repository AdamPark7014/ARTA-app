import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { isSafeMediaUrl, PROPOSAL_SUFFIX, startOfTodayMx, StudioController } from './studio.controller';

/**
 * El sitio público se administra entero desde Studio (01-11-2026): historias, galería, aliados, el
 * orden de todo y borradores de sección con vista previa. La regla de la junta 23-10 no cambia: lo
 * que no pase por quien publica no sale al sitio.
 */
describe('Studio · maqueta del sitio', () => {
  const practicante = { id: 'u-prac', roleKey: 'practicante', permissions: [] as string[], organizationId: DEFAULT_ORG_ID, fullName: 'Ana Practicante' };
  const montse = { id: 'u-monse', roleKey: 'dir_adjunta', permissions: [] as string[], organizationId: DEFAULT_ORG_ID, fullName: 'Monse' };

  type Row = Record<string, unknown>;

  function setup(state: { item?: Row; items?: Row[]; pages?: Row[]; news?: Row } = {}) {
    const prisma = {
      pageContent: {
        findMany: jest.fn(async (args: { where?: { sectionKey?: { in?: string[]; startsWith?: string; endsWith?: string } } }) => {
          const filter = args?.where?.sectionKey;
          return (state.pages ?? []).filter((p) => {
            const key = String(p.sectionKey);
            if (filter?.in) return filter.in.includes(key);
            if (filter?.startsWith) return key.startsWith(filter.startsWith);
            if (filter?.endsWith) return key.endsWith(filter.endsWith);
            return true;
          });
        }),
        upsert: jest.fn(async ({ create }: any) => ({ id: 'pagina', ...create })),
        delete: jest.fn(async () => ({})),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      heroSlide: {
        create: jest.fn(async ({ data }: any) => ({ id: 's-new', ...data })),
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => ({})),
      },
      newsPost: {
        findMany: jest.fn(async (_args?: any) => [] as Row[]),
        findUnique: jest.fn(async () => state.news ?? { id: 'n-1', published: true, publishedAt: new Date('2026-01-02T00:00:00Z'), template: null, eventDate: null }),
        create: jest.fn(async ({ data }: any) => ({ id: 'n-new', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'n-1', ...data })),
      },
      siteItem: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => state.items ?? []),
        findUnique: jest.fn(async () => state.item ?? { id: 'i-1', kind: 'historia', title: 'Montaje', active: false }),
        create: jest.fn(async ({ data }: any) => ({ id: 'i-new', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'i-1', ...data })),
        delete: jest.fn(async () => ({ id: 'i-1' })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    return { controller: new StudioController(prisma as never), prisma };
  }

  const req = (user: object) => ({ user }) as never;
  const story = { kind: 'historia' as const, mediaUrl: '/uploads/a.jpg', title: 'Montaje' };

  describe('historias, galería y aliados', () => {
    it('lo del practicante nace como borrador y no puede publicarlo', async () => {
      const { controller, prisma } = setup();
      await controller.createItem(req(practicante), story);
      expect(prisma.siteItem.create.mock.calls[0][0].data).toMatchObject({ kind: 'historia', active: false });
      await expect(controller.createItem(req(practicante), { ...story, active: true })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.updateItem(req(practicante), 'i-1', { active: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin archivo, o con un enlace peligroso, no se guarda', async () => {
      const { controller, prisma } = setup();
      await expect(controller.createItem(req(montse), { kind: 'foto' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.createItem(req(montse), { kind: 'foto', mediaUrl: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.createItem(req(montse), { ...story, linkHref: 'javascript:alert(1)' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.siteItem.create).not.toHaveBeenCalled();
    });

    it('lo nuevo entra hasta arriba de su lista', async () => {
      const { controller, prisma } = setup();
      prisma.siteItem.findFirst.mockResolvedValueOnce({ sortOrder: 3 } as never);
      await controller.createItem(req(montse), story);
      expect(prisma.siteItem.create.mock.calls[0][0].data.sortOrder).toBe(2);
    });

    it('el practicante edita sus borradores, pero no lo que ya está en el sitio', async () => {
      const draft = setup();
      await draft.controller.updateItem(req(practicante), 'i-1', { title: 'Otro' });
      expect(draft.prisma.siteItem.update).toHaveBeenCalledTimes(1);

      const live = setup({ item: { id: 'i-1', kind: 'historia', active: true } });
      await expect(live.controller.updateItem(req(practicante), 'i-1', { title: 'Otro' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(live.controller.deleteItem(req(practicante), 'i-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(live.prisma.siteItem.update).not.toHaveBeenCalled();
      expect(live.prisma.siteItem.delete).not.toHaveBeenCalled();
    });

    it('quien publica lo publica y deja de esperar revisión', async () => {
      const { controller, prisma } = setup();
      await controller.updateItem(req(montse), 'i-1', { active: true });
      expect(prisma.siteItem.update.mock.calls[0][0].data).toMatchObject({ active: true, reviewRequestedAt: null });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('«Enviar a revisión» marca el contenido y lo publicado no se manda', async () => {
      const { controller, prisma } = setup();
      await controller.requestReview(req(practicante), { kind: 'item', id: 'i-1' });
      expect(prisma.siteItem.update.mock.calls[0][0].data.reviewRequestedAt).toBeInstanceOf(Date);

      const live = setup({ item: { id: 'i-1', kind: 'foto', active: true } });
      await expect(live.controller.requestReview(req(practicante), { kind: 'item', id: 'i-1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Subir y Bajar', () => {
    const items = [
      { id: 'a', active: true },
      { id: 'b', active: true },
      { id: 'c', active: false },
    ];

    it('el practicante no cambia el orden de lo publicado', async () => {
      const { controller, prisma } = setup({ items });
      await expect(controller.reorder(req(practicante), { kind: 'historia', ids: ['b', 'a', 'c'] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el practicante sí acomoda sus borradores', async () => {
      const { controller, prisma } = setup({ items });
      await controller.reorder(req(practicante), { kind: 'historia', ids: ['c', 'a', 'b'] });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('quien publica acomoda todo', async () => {
      const { controller, prisma } = setup({ items });
      await controller.reorder(req(montse), { kind: 'historia', ids: ['b', 'c', 'a'] });
      expect(prisma.siteItem.update.mock.calls.map(([args]: any[]) => [args.where.id, args.data.sortOrder])).toEqual([
        ['b', 0],
        ['c', 1],
        ['a', 2],
      ]);
    });

    it('una lista que no coincide se rechaza (otra persona ya la cambió)', async () => {
      const { controller } = setup({ items });
      await expect(controller.reorder(req(montse), { kind: 'historia', ids: ['a', 'b', 'x'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.reorder(req(montse), { kind: 'historia', ids: ['a', 'a', 'b'] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('borradores de sección', () => {
    const content = { contentJson: { headline: 'Hola' } };

    it('quien publica puede guardar sin tocar lo publicado', async () => {
      const { controller, prisma } = setup();
      const res = await controller.upsert(req(montse), { sectionKey: 'home_hero', draft: true, ...content });
      expect(prisma.pageContent.upsert.mock.calls[0][0].where.entity_sectionKey.sectionKey).toBe(`home_hero${PROPOSAL_SUFFIX}`);
      expect(prisma.pageContent.upsert.mock.calls[0][0].create.published).toBe(false);
      expect(prisma.pageContent.deleteMany).not.toHaveBeenCalled();
      expect(res.proposal).toBe(true);
    });

    it('al publicar directo escribe la sección y se lleva el borrador', async () => {
      const { controller, prisma } = setup();
      await controller.upsert(req(montse), { sectionKey: 'home_hero', published: true, ...content });
      expect(prisma.pageContent.upsert.mock.calls[0][0].where.entity_sectionKey.sectionKey).toBe('home_hero');
      expect(prisma.pageContent.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('publicar borradores: solo quien publica', async () => {
      const { controller, prisma } = setup({ pages: [{ id: 'p', sectionKey: `home_hero${PROPOSAL_SUFFIX}`, title: 'Portada', contentJson: {} }] });
      await expect(controller.publishPages(req(practicante), {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.pageContent.upsert).not.toHaveBeenCalled();
    });

    it('la propuesta pasa a ser la sección y deja de existir', async () => {
      const { controller, prisma } = setup({
        pages: [{ id: 'p', sectionKey: `home_hero${PROPOSAL_SUFFIX}`, title: 'Portada', contentJson: { headline: 'Nuevo' } }],
      });
      const res = await controller.publishPages(req(montse), {});
      expect(res.published).toEqual(['home_hero']);
      expect(prisma.pageContent.upsert.mock.calls[0][0].update).toMatchObject({ contentJson: { headline: 'Nuevo' }, published: true });
      expect(prisma.pageContent.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    });

    it('al publicar la maqueta se borran las secciones agregadas que ya no están en ella', async () => {
      const layout = { blocks: [{ id: 'cartelera', type: 'cartelera' }, { id: 'sigue', type: 'texto' }] };
      const { controller, prisma } = setup({
        pages: [
          { id: 'lay', sectionKey: `site_layout${PROPOSAL_SUFFIX}`, title: 'Maqueta', contentJson: layout },
          { id: 'b1', sectionKey: 'bloque_sigue', contentJson: {} },
          { id: 'b2', sectionKey: 'bloque_fuera', contentJson: {} },
          { id: 'b3', sectionKey: `bloque_fuera${PROPOSAL_SUFFIX}`, contentJson: {} },
        ],
      });
      // Solo la maqueta tiene propuesta que publicar en esta prueba.
      await controller.publishPages(req(montse), { keys: ['site_layout'] });
      expect(prisma.pageContent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b2', 'b3'] } } });
    });
  });

  describe('lo que escribe quien edita', () => {
    it('el botón de un slide no acepta `javascript:`', async () => {
      const { controller, prisma } = setup();
      await expect(
        controller.createSlide(req(montse), { imageUrl: '/uploads/a.jpg', ctaHref: 'javascript:alert(1)' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.createSlide(req(montse), { imageUrl: 'data:text/html,hola' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.heroSlide.create).not.toHaveBeenCalled();
    });

    it('corregir una noticia ya publicada no le cambia la fecha', async () => {
      const publishedAt = new Date('2026-01-02T00:00:00Z');
      const { controller, prisma } = setup();
      await controller.updateNews(req(montse), 'n-1', { slug: 'nota', title: 'Nota', published: true });
      expect(prisma.newsPost.update.mock.calls[0][0].data.publishedAt).toEqual(publishedAt);
    });

    it('un cuerpo sin `published` no le borra la fecha', async () => {
      const { controller, prisma } = setup();
      await controller.updateNews(req(montse), 'n-1', { slug: 'nota', title: 'Nota' });
      expect(prisma.newsPost.update.mock.calls[0][0].data.publishedAt).toBeUndefined();
    });

    it('dos publicaciones con la misma dirección: mensaje claro, no un 500', async () => {
      const { controller, prisma } = setup();
      prisma.newsPost.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(controller.createNews(req(montse), { slug: 'nota', title: 'Nota' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('valida hora y estado de venta de un show', async () => {
      const { controller } = setup();
      const show = { slug: 'show', title: 'Show', template: 'evento', eventDate: '2026-12-01' };
      await expect(controller.createNews(req(montse), { ...show, eventTime: '25:00' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.createNews(req(montse), { ...show, showStatus: 'regalado' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.createNews(req(montse), { ...show, eventTime: '21:30', showStatus: 'agotado' })).resolves.toMatchObject({
        eventTime: '21:30',
        showStatus: 'agotado',
      });
    });

    it('solo acepta archivos subidos o https como foto', () => {
      expect(isSafeMediaUrl('/uploads/a.jpg')).toBe(true);
      expect(isSafeMediaUrl('https://example.com/a.jpg')).toBe(true);
      expect(isSafeMediaUrl('http://example.com/a.jpg')).toBe(false);
      expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeMediaUrl('/uploads/a b.jpg')).toBe(false);
    });
  });

  describe('lo público', () => {
    it('las noticias sin plantilla siguen saliendo: filtrar con `not` dejaría fuera los NULL', async () => {
      const { controller, prisma } = setup();
      await controller.publicContent('ARTA');
      const newsQuery = prisma.newsPost.findMany.mock.calls[0][0];
      expect(newsQuery.where.OR).toEqual([{ template: null }, { template: { not: 'evento' } }]);
    });

    it('un show sale de cartelera cuando termina su día en Puebla', () => {
      // 02-nov 03:00 UTC todavía es 01-nov en Puebla.
      expect(startOfTodayMx(new Date('2026-11-02T03:00:00.000Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(startOfTodayMx(new Date('2026-11-02T07:00:00.000Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
    });

    it('la vista previa pisa la sección publicada con su borrador y no enseña borradores sueltos como publicados', async () => {
      const { controller, prisma } = setup();
      prisma.pageContent.findMany.mockResolvedValueOnce([
        { id: '1', sectionKey: 'home_hero', published: true, contentJson: { headline: 'Publicado' } },
        { id: '2', sectionKey: `home_hero${PROPOSAL_SUFFIX}`, published: false, contentJson: { headline: 'Borrador' } },
        { id: '3', sectionKey: 'home_cta', published: true, contentJson: { headline: 'Contacto' } },
      ] as never);
      const { pages } = await controller.preview(req(practicante));
      expect(pages.find((p) => p.sectionKey === 'home_hero')).toMatchObject({ draft: true, contentJson: { headline: 'Borrador' } });
      expect(pages.find((p) => p.sectionKey === 'home_cta')).toMatchObject({ contentJson: { headline: 'Contacto' } });
      expect(pages.some((p) => p.sectionKey.endsWith(PROPOSAL_SUFFIX))).toBe(false);
    });
  });
});
