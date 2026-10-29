import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { isSafeCtaHref, newsTemplateFields, PROPOSAL_SUFFIX, StudioController } from './studio.controller';

/**
 * Junta 23-10-2026 · «Montse redes sociales: plantilla de página web y acceso para practicantes».
 *
 * El practicante escribe en Studio, pero nada suyo sale al sitio sin que dirección lo publique:
 * noticias y slides quedan en borrador, los cambios a una sección del inicio quedan como propuesta
 * aparte, y lo que ya está publicado no lo toca. «Enviar a revisión» le avisa a quien publica.
 */
describe('Studio · practicante deja borradores, dirección publica', () => {
  const practicante = { id: 'u-prac', roleKey: 'practicante', permissions: [] as string[], organizationId: DEFAULT_ORG_ID, fullName: 'Ana Practicante' };
  const montse = { id: 'u-monse', roleKey: 'dir_adjunta', permissions: [] as string[], organizationId: DEFAULT_ORG_ID, fullName: 'Monse' };

  function setup(state: { newsPublished?: boolean; slideActive?: boolean; proposal?: boolean } = {}) {
    const calls: Record<string, any[]> = {};
    const track = (name: string, result: (args: any) => unknown) =>
      jest.fn(async (args: any) => {
        (calls[name] ||= []).push(args);
        return result(args);
      });
    const prisma = {
      pageContent: {
        findMany: track('page.findMany', () => []),
        findUnique: track('page.findUnique', () => (state.proposal ? { id: 'prop', title: 'Hero', sectionKey: `home_hero${PROPOSAL_SUFFIX}` } : null)),
        upsert: track('page.upsert', ({ create }) => ({ id: 'pagina', ...create })),
        deleteMany: track('page.deleteMany', () => ({ count: 1 })),
      },
      heroSlide: {
        findUnique: track('slide.findUnique', () => ({ id: 's-1', title: 'Slide', active: !!state.slideActive })),
        create: track('slide.create', ({ data }) => ({ id: 's-new', ...data })),
        update: track('slide.update', ({ data }) => ({ id: 's-1', ...data })),
        delete: track('slide.delete', () => ({ id: 's-1' })),
      },
      newsPost: {
        findUnique: track('news.findUnique', () => ({
          id: 'n-1',
          title: 'Nota',
          published: !!state.newsPublished,
          template: null,
          eventDate: null,
        })),
        create: track('news.create', ({ data }) => ({ id: 'n-new', ...data })),
        update: track('news.update', ({ data }) => ({ id: 'n-1', ...data })),
        delete: track('news.delete', () => ({ id: 'n-1' })),
      },
      auditLog: { create: track('audit', () => ({})) },
    };
    const notifications = {
      whoCan: jest.fn(async () => ['u-monse', 'u-arturo']),
      notifyMany: jest.fn(async (rows: unknown[]) => rows.map((_, i) => ({ id: `nt-${i}` }))),
    };
    const controller = new StudioController(prisma as never, notifications as never);
    return { controller, prisma, notifications, calls };
  }

  const news = { slug: 'concierto-noviembre', title: 'Concierto en noviembre' };

  describe('noticias', () => {
    it('crea un borrador con la plantilla «Evento destacado»', async () => {
      const { controller, prisma } = setup();
      await controller.createNews({ user: practicante } as never, {
        ...news,
        template: 'evento',
        eventDate: '2026-11-21',
        ctaLabel: 'Comprar boletos',
        ctaHref: 'https://boletos.example.com/arta',
      });
      expect(prisma.newsPost.create.mock.calls[0][0].data).toMatchObject({
        published: false,
        publishedAt: null,
        template: 'evento',
        ctaLabel: 'Comprar boletos',
        ctaHref: 'https://boletos.example.com/arta',
      });
      const eventDate = prisma.newsPost.create.mock.calls[0][0].data.eventDate as Date;
      expect(eventDate.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    });

    it('no publica al crear ni al editar', async () => {
      const { controller, prisma } = setup();
      await expect(
        controller.createNews({ user: practicante } as never, { ...news, published: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        controller.updateNews({ user: practicante } as never, 'n-1', { ...news, published: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.newsPost.create).not.toHaveBeenCalled();
      expect(prisma.newsPost.update).not.toHaveBeenCalled();
    });

    it('edita su borrador, pero no lo que ya está en el sitio', async () => {
      const draft = setup();
      await draft.controller.updateNews({ user: practicante } as never, 'n-1', { ...news, body: 'Texto' });
      expect(draft.prisma.newsPost.update).toHaveBeenCalledTimes(1);

      const live = setup({ newsPublished: true });
      await expect(
        live.controller.updateNews({ user: practicante } as never, 'n-1', { ...news, body: 'Texto' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(live.controller.deleteNews({ user: practicante } as never, 'n-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(live.prisma.newsPost.update).not.toHaveBeenCalled();
      expect(live.prisma.newsPost.delete).not.toHaveBeenCalled();
    });

    it('dirección publica y la noticia deja de esperar revisión', async () => {
      const { controller, prisma } = setup();
      await controller.updateNews({ user: montse } as never, 'n-1', { ...news, published: true });
      expect(prisma.newsPost.update.mock.calls[0][0].data).toMatchObject({ published: true, reviewRequestedAt: null });
    });

    it('un «Evento destacado» no se publica sin fecha del show', async () => {
      const { controller } = setup();
      await expect(
        controller.createNews({ user: montse } as never, { ...news, template: 'evento', published: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('carrusel', () => {
    it('el slide del practicante nace inactivo y no lo activa', async () => {
      const { controller, prisma } = setup();
      await controller.createSlide({ user: practicante } as never, { imageUrl: '/uploads/a.jpg' });
      expect(prisma.heroSlide.create.mock.calls[0][0].data.active).toBe(false);
      await expect(
        controller.createSlide({ user: practicante } as never, { imageUrl: '/uploads/a.jpg', active: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        controller.updateSlide({ user: practicante } as never, 's-1', { imageUrl: '/uploads/a.jpg', active: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no toca un slide que ya está en el sitio', async () => {
      const { controller, prisma } = setup({ slideActive: true });
      await expect(
        controller.updateSlide({ user: practicante } as never, 's-1', { imageUrl: '/uploads/b.jpg' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.deleteSlide({ user: practicante } as never, 's-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.heroSlide.update).not.toHaveBeenCalled();
      expect(prisma.heroSlide.delete).not.toHaveBeenCalled();
    });

    it('dirección sigue creando slides activos como siempre', async () => {
      const { controller, prisma } = setup();
      await controller.createSlide({ user: montse } as never, { imageUrl: '/uploads/a.jpg' });
      expect(prisma.heroSlide.create.mock.calls[0][0].data.active).toBe(true);
    });
  });

  describe('secciones del inicio', () => {
    const page = { sectionKey: 'home_hero', title: 'Hero', contentJson: { headline: 'Nuevo titular' } };

    it('el practicante guarda una propuesta aparte, nunca la sección publicada', async () => {
      const { controller, prisma } = setup();
      const saved = await controller.upsert({ user: practicante } as never, page as never);
      const args = prisma.pageContent.upsert.mock.calls[0][0];
      expect(args.where.entity_sectionKey.sectionKey).toBe(`home_hero${PROPOSAL_SUFFIX}`);
      expect(args.create.published).toBe(false);
      expect(args.update.published).toBe(false);
      expect(saved).toMatchObject({ proposal: true });
      expect(prisma.pageContent.deleteMany).not.toHaveBeenCalled();
      await expect(
        controller.upsert({ user: practicante } as never, { ...page, published: true } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('al guardar dirección la sección, la propuesta se da por revisada', async () => {
      const { controller, prisma } = setup();
      await controller.upsert({ user: montse } as never, { ...page, published: true } as never);
      expect(prisma.pageContent.upsert.mock.calls[0][0].where.entity_sectionKey.sectionKey).toBe('home_hero');
      expect(prisma.pageContent.deleteMany.mock.calls[0][0].where.sectionKey).toBe(`home_hero${PROPOSAL_SUFFIX}`);
    });

    it('nadie escribe directo en la fila de propuesta, y solo quien publica la descarta', async () => {
      const { controller } = setup();
      await expect(
        controller.upsert({ user: montse } as never, { ...page, sectionKey: `home_hero${PROPOSAL_SUFFIX}` } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.discardProposal({ user: practicante } as never, 'home_hero')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(controller.discardProposal({ user: montse } as never, 'home_hero')).resolves.toMatchObject({ ok: true });
    });
  });

  describe('enviar a revisión', () => {
    it('marca la noticia y avisa a quien publica', async () => {
      const { controller, prisma, notifications } = setup();
      const res = await controller.requestReview({ user: practicante } as never, { kind: 'news', id: 'n-1' });
      expect(prisma.newsPost.update.mock.calls[0][0].data.reviewRequestedAt).toBeInstanceOf(Date);
      expect(notifications.whoCan).toHaveBeenCalledWith(
        expect.objectContaining({ permission: 'studio.publish', entity: 'ARTA', exclude: 'u-prac' }),
      );
      const rows = (notifications.notifyMany.mock.calls[0] as unknown[])[0] as Array<Record<string, unknown>>;
      expect(rows.map((r) => r.userId)).toEqual(['u-monse', 'u-arturo']);
      expect(rows[0]).toMatchObject({ type: 'studio.review', linkUrl: '/studio?tab=news' });
      expect(String(rows[0].title)).toContain('Ana Practicante');
      expect(res).toEqual({ ok: true, notified: 2 });
    });

    it('una propuesta de sección inexistente es 404; un slide publicado no se manda', async () => {
      await expect(
        setup().controller.requestReview({ user: practicante } as never, { kind: 'section', id: 'home_hero' }),
      ).rejects.toThrow('No hay propuesta');
      await expect(
        setup({ slideActive: true }).controller.requestReview({ user: practicante } as never, { kind: 'slide', id: 's-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        setup({ proposal: true }).controller.requestReview({ user: practicante } as never, { kind: 'section', id: 'home_hero' }),
      ).resolves.toMatchObject({ ok: true });
    });
  });

  it('un practicante con studio.publish extra (lo da dirección) sí publica', async () => {
    const { controller, prisma } = setup();
    await controller.createNews({ user: { ...practicante, permissions: ['studio.publish'] } } as never, {
      ...news,
      published: true,
    });
    expect(prisma.newsPost.create.mock.calls[0][0].data.published).toBe(true);
  });
});

describe('Studio · campos de la plantilla', () => {
  it('valida plantilla, fecha y enlace del botón', () => {
    expect(() => newsTemplateFields({ template: 'otra' })).toThrow(BadRequestException);
    expect(() => newsTemplateFields({ eventDate: 'mañana' })).toThrow(BadRequestException);
    expect(() => newsTemplateFields({ ctaHref: 'javascript:alert(1)' })).toThrow(BadRequestException);
    expect(newsTemplateFields({})).toEqual({ template: undefined, eventDate: undefined, ctaLabel: undefined, ctaHref: undefined });
    // Vacío = quitar el campo.
    expect(newsTemplateFields({ template: '', ctaLabel: '  ', ctaHref: '' })).toMatchObject({
      template: null,
      ctaLabel: null,
      ctaHref: null,
    });
  });

  it('enlaces permitidos en el botón', () => {
    for (const ok of ['https://boletos.mx/x', 'http://a.b', '/p/arta#contacto', '#contacto', 'mailto:hola@arta.mx', 'tel:+522221234567']) {
      expect(isSafeCtaHref(ok)).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', '//evil.example', 'data:text/html,x', 'ftp://x', '', 'https://a b']) {
      expect(isSafeCtaHref(bad)).toBe(false);
    }
  });
});
