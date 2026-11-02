import { ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { seedStudioContent } from '../prisma/seed-studio';
import { DEFAULT_ORG_ID } from '../src/common/tenant';
import { StudioController, UpsertPageDto } from '../src/studio/studio.controller';

/**
 * El sitio público contra una base real. Las pruebas unitarias usan Prisma de mentira y dan por bueno
 * un filtro que en SQL deja fuera los NULL, o una tabla que no existe (incidente del chat, 01-11-2026).
 */
describe('Sitio público (e2e, base real)', () => {
  const prisma = new PrismaClient();
  const controller = new StudioController(prisma as never);
  const suffix = Date.now().toString(36);
  const director = { id: undefined, roleKey: 'dir_general', permissions: [], organizationId: DEFAULT_ORG_ID, fullName: 'Dirección' };
  const req = { user: director } as never;

  const day = (delta: number) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);
  const slug = (name: string) => `${name}-${suffix}`;

  afterAll(async () => {
    await prisma.newsPost.deleteMany({ where: { slug: { endsWith: suffix } } });
    await prisma.siteItem.deleteMany({ where: { title: { endsWith: suffix } } });
    await prisma.$disconnect();
  });

  it('noticias sin plantilla salen en Noticias; los shows, en cartelera; los pasados, en ninguna de las dos', async () => {
    await prisma.newsPost.createMany({
      data: [
        { entity: 'ARTA', slug: slug('sin-plantilla'), title: 'Sin plantilla', published: true, publishedAt: new Date() },
        { entity: 'ARTA', slug: slug('nota'), title: 'Nota', template: 'publicacion', published: true, publishedAt: new Date() },
        { entity: 'ARTA', slug: slug('borrador'), title: 'Borrador', published: false },
      ],
    });
    await controller.createNews(req, { slug: slug('viene'), title: 'Viene', template: 'evento', eventDate: day(10), published: true, venue: 'Explanada', eventTime: '21:00' });
    await controller.createNews(req, { slug: slug('hoy'), title: 'Hoy', template: 'evento', eventDate: day(0), published: true });
    await controller.createNews(req, { slug: slug('paso'), title: 'Pasó', template: 'evento', eventDate: day(-10), published: true });

    const site = await controller.publicContent('ARTA');
    const news = site.news.map((n) => n.slug);
    const shows = site.shows.map((n) => n.slug);
    expect(news).toEqual(expect.arrayContaining([slug('sin-plantilla'), slug('nota')]));
    expect(news).not.toContain(slug('borrador'));
    expect(news).not.toContain(slug('viene'));
    expect(shows).toEqual(expect.arrayContaining([slug('viene'), slug('hoy')]));
    expect(shows).not.toContain(slug('paso'));
    expect(site.shows.find((s) => s.slug === slug('viene'))).toMatchObject({ venue: 'Explanada', eventTime: '21:00' });

    const all = await controller.publicShows();
    expect(all.past.map((s) => s.slug)).toContain(slug('paso'));
    expect(all.upcoming.map((s) => s.slug)).not.toContain(slug('paso'));
  });

  it('una historia en borrador no sale al público y sí en la vista previa', async () => {
    const draft = await controller.createItem(req, { kind: 'historia', mediaUrl: '/uploads/a.jpg', title: `Borrador ${suffix}` });
    const live = await controller.createItem(req, { kind: 'historia', mediaUrl: '/uploads/b.jpg', title: `Publicada ${suffix}`, active: true });

    const site = await controller.publicContent('ARTA');
    expect(site.items.map((i) => i.id)).toContain(live.id);
    expect(site.items.map((i) => i.id)).not.toContain(draft.id);

    const preview = await controller.preview(req);
    expect(preview.items.map((i) => i.id)).toEqual(expect.arrayContaining([draft.id, live.id]));

    await controller.reorder(req, { kind: 'historia', ids: (await controller.items(req, 'historia')).map((i) => i.id).reverse() });
    await controller.deleteItem(req, draft.id);
    expect(await prisma.siteItem.findUnique({ where: { id: draft.id } })).toBeNull();
  });

  it('el borrador de una sección no toca lo publicado hasta publicarlo', async () => {
    const key = `prueba_${suffix}`;
    await controller.upsert(req, { sectionKey: key, title: 'Prueba', contentJson: { headline: 'Publicado' }, published: true });
    await controller.upsert(req, { sectionKey: key, title: 'Prueba', contentJson: { headline: 'Borrador' }, draft: true });

    const site = await controller.publicContent('ARTA');
    expect(site.pages.find((p) => p.sectionKey === key)?.contentJson).toEqual({ headline: 'Publicado' });
    const preview = await controller.preview(req);
    expect(preview.pages.find((p) => p.sectionKey === key)).toMatchObject({ draft: true, contentJson: { headline: 'Borrador' } });

    await controller.publishPages(req, { keys: [key] });
    const after = await controller.publicContent('ARTA');
    expect(after.pages.find((p) => p.sectionKey === key)?.contentJson).toEqual({ headline: 'Borrador' });
    expect(await prisma.pageContent.count({ where: { sectionKey: `${key}__propuesta` } })).toBe(0);
    await prisma.pageContent.deleteMany({ where: { sectionKey: key } });
  });

  it('el ValidationPipe de producción deja pasar el contenido de la sección', async () => {
    // Sin decorador, `whitelist` tiraba `contentJson` y guardar no cambiaba nada.
    const pipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const dto = (await pipe.transform(
      { sectionKey: 'home_hero', contentJson: { headline: 'Hola' }, published: true, draft: true },
      { type: 'body', metatype: UpsertPageDto },
    )) as UpsertPageDto;
    expect(dto.contentJson).toEqual({ headline: 'Hola' });
    expect(dto.draft).toBe(true);
  });

  describe('la semilla corre en cada arranque', () => {
    const asset = (file: string) => `/uploads/${file}`;
    const pageOf = (sectionKey: string) =>
      prisma.pageContent.findUnique({ where: { entity_sectionKey: { entity: 'ARTA', sectionKey } } });

    it('respeta lo editado en Studio y solo retira el relleno viejo', async () => {
      const legacyAbout = {
        headline: 'Producimos el show completo',
        body: 'Somos la productora detrás de la experiencia: producción técnica, hospitality, artes, boletera, campaña y cierre financiero. Operamos con el mismo rigor en cada concierto.',
        location: 'Base operativa en Puebla y venue aliado Auditorio Arema Explanada. Producción integral de conciertos y eventos en la región.',
        stats: [
          { label: 'Shows', text: 'Producción integral de conciertos' },
          { label: 'Puebla', text: 'Base operativa y venues aliados' },
          { label: 'Experiencia', text: 'Del rider al cierre del evento' },
        ],
      };
      const set = (sectionKey: string, contentJson: object) =>
        prisma.pageContent.upsert({
          where: { entity_sectionKey: { entity: 'ARTA', sectionKey } },
          create: { entity: 'ARTA', sectionKey, title: 'x', published: true, contentJson },
          update: { contentJson, published: true },
        });
      await set('home_about', legacyAbout);
      await set('home_cta', { headline: 'Editado por una persona' });
      const slide = await prisma.heroSlide.create({
        data: { entity: 'ARTA', title: `Mi foto ${suffix}`, imageUrl: '/uploads/mia.jpg', active: true },
      });
      const old = await prisma.newsPost.upsert({
        where: { entity_slug: { entity: 'ARTA', slug: 'checklists-digitales' } },
        create: { entity: 'ARTA', slug: 'checklists-digitales', title: 'Checklists digitales con firma', published: true, publishedAt: new Date() },
        update: { title: 'Checklists digitales con firma', body: null, published: true, publishedAt: new Date() },
      });
      const real = await prisma.newsPost.create({
        data: { entity: 'ARTA', slug: slug('real'), title: 'Noticia real', published: true, publishedAt: new Date() },
      });

      await seedStudioContent(prisma, asset);

      expect((await pageOf('home_about'))?.contentJson).toMatchObject({ eyebrow: 'Nosotros' });
      expect((await pageOf('home_cta'))?.contentJson).toEqual({ headline: 'Editado por una persona' });
      expect(await prisma.heroSlide.findUnique({ where: { id: slide.id } })).not.toBeNull();
      expect((await prisma.newsPost.findUnique({ where: { id: old.id } }))?.published).toBe(false);
      expect((await prisma.newsPost.findUnique({ where: { id: real.id } }))?.published).toBe(true);

      // Lo que la persona edite después del primer arranque se queda en los siguientes.
      await set('home_about', { headline: 'Ya lo editaron' });
      await seedStudioContent(prisma, asset);
      expect((await pageOf('home_about'))?.contentJson).toEqual({ headline: 'Ya lo editaron' });

      await prisma.heroSlide.delete({ where: { id: slide.id } });
      await prisma.newsPost.delete({ where: { id: old.id } });
    });
  });
});
