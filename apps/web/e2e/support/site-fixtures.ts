import type { Page, Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_USER, type AuthUserFixture } from './mock-api';

/**
 * Contenido ficticio del sitio y un Studio de mentira con memoria: guarda lo que recibe y lo
 * regresa en la siguiente lectura, igual que el API. La regla de publicar la prueba el API en
 * `apps/api/src/studio/studio.maqueta.spec.ts`; aquí se prueba lo que ve y hace quien edita.
 */

// Una imagen real (1×1) para que `/uploads/*` no ensucie la consola con 404.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) + 'T12:00:00.000Z';

export type Row = Record<string, any> & { id: string };

export type StudioState = {
  pages: Row[];
  slides: Row[];
  news: Row[];
  items: Row[];
  /** Lo que recibió el API de mentira, en orden. */
  calls: Array<{ method: string; path: string; body: any }>;
};

export function siteState(): StudioState {
  return {
    calls: [],
    pages: [
      { id: 'p1', sectionKey: 'home_hero', title: 'Portada', published: true, contentJson: { headline: 'La experiencia del Show', sub: 'Producimos conciertos en Puebla', showCount: '1', ticker: 'Conciertos\nPuebla' } },
      { id: 'p2', sectionKey: 'home_about', title: 'Nosotros', published: true, contentJson: { eyebrow: 'Nosotros', headline: 'Producimos el show completo', body: 'Una sola mano de principio a fin.', stats: [{ label: '120 shows', text: 'En diez años' }] } },
      { id: 'p3', sectionKey: 'home_cta', title: 'Contacto', published: true, contentJson: { headline: 'Hablemos de tu próximo show', body: 'Cuéntanos la fecha.', cta: 'Escribir a Arta' } },
    ],
    slides: [
      { id: 's1', title: 'Escenario, luz y público', subtitle: 'Cada fecha con cuidado', imageUrl: '/uploads/foto-1.jpg', ctaLabel: 'Ver cartelera', ctaHref: '#cartelera', sortOrder: 0, active: true },
      { id: 's2', title: 'Cada detalle cuenta', subtitle: 'Una sola mano', imageUrl: '/uploads/foto-2.jpg', ctaLabel: 'Conoce Arta', ctaHref: '#nosotros', sortOrder: 1, active: true },
    ],
    news: [
      { id: 'n1', slug: 'festival-de-verano', title: 'Así se vivió el festival de verano', excerpt: 'Tres días y doce artistas.', body: 'Texto.', coverUrl: '/uploads/nota-1.jpg', published: true, publishedAt: '2026-10-20T18:00:00.000Z', template: 'publicacion', sortOrder: 0 },
      { id: 'n2', slug: 'temporada-de-invierno', title: 'Arrancan los ensayos de invierno', excerpt: 'Lo que viene.', body: 'Texto.', coverUrl: '/uploads/nota-2.jpg', published: true, publishedAt: '2026-10-10T18:00:00.000Z', template: 'publicacion', sortOrder: 1 },
      { id: 'n3', slug: 'nota-en-borrador', title: 'Nota que sigue en borrador', excerpt: 'Aún no sale.', body: '', coverUrl: '/uploads/nota-3.jpg', published: false, publishedAt: null, template: 'publicacion', sortOrder: 2 },
      { id: 'e1', slug: 'los-ecos', title: 'Los Ecos de Cholula', excerpt: 'De regreso a casa.', body: '', coverUrl: '/uploads/poster-1.jpg', published: true, publishedAt: '2026-10-01T18:00:00.000Z', template: 'evento', eventDate: inDays(18), eventTime: '21:00', venue: 'Auditorio Explanada', city: 'Puebla', showStatus: 'venta', ctaLabel: 'Comprar boletos', ctaHref: 'https://boletos.example.com/ecos' },
      { id: 'e2', slug: 'trio-malinche', title: 'Trío Malinche', excerpt: 'Acústico.', body: '', coverUrl: '/uploads/poster-2.jpg', published: true, publishedAt: '2026-10-02T18:00:00.000Z', template: 'evento', eventDate: inDays(40), eventTime: '20:00', venue: 'Teatro de la Ciudad', city: 'Tlaxcala', showStatus: 'agotado', ctaLabel: 'Comprar boletos', ctaHref: 'https://boletos.example.com/trio' },
    ],
    items: [
      { id: 'h1', kind: 'historia', title: 'Así se ve desde el escenario', caption: 'Un solo coro.', mediaUrl: '/uploads/historia-1.jpg', mediaType: 'image', linkLabel: 'Ver más', linkHref: 'https://example.com/mas', sortOrder: 0, active: true },
      { id: 'h2', kind: 'historia', title: 'Prueba de luces', caption: 'Antes de abrir.', mediaUrl: '/uploads/historia-2.jpg', mediaType: 'image', sortOrder: 1, active: true },
      { id: 'h3', kind: 'historia', title: 'Historia en borrador', caption: '', mediaUrl: '/uploads/historia-3.jpg', mediaType: 'image', sortOrder: 2, active: false },
      { id: 'f1', kind: 'foto', title: 'Festival', mediaUrl: '/uploads/galeria-1.jpg', mediaType: 'image', sortOrder: 0, active: true },
      { id: 'f2', kind: 'foto', title: '', mediaUrl: '/uploads/galeria-2.jpg', mediaType: 'image', sortOrder: 1, active: true },
      { id: 'a1', kind: 'aliado', title: 'Radio 98.7', mediaUrl: '/uploads/logo-1.png', mediaType: 'image', linkHref: 'https://example.com', sortOrder: 0, active: true },
    ],
  };
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function isShow(row: Row) {
  return row.template === 'evento';
}

/** Lo que devuelve `GET /studio/preview`: lo publicado con los borradores encima. */
export function previewOf(state: StudioState) {
  const merged = new Map<string, Row>();
  for (const page of state.pages) if (!page.sectionKey.endsWith('__propuesta')) merged.set(page.sectionKey, page);
  for (const page of state.pages) {
    if (!page.sectionKey.endsWith('__propuesta')) continue;
    const sectionKey = page.sectionKey.replace('__propuesta', '');
    merged.set(sectionKey, { ...page, sectionKey, draft: true });
  }
  return {
    pages: [...merged.values()],
    slides: state.slides,
    news: state.news.filter((n) => !isShow(n)),
    shows: state.news.filter(isShow),
    items: state.items,
  };
}

export function publicOf(state: StudioState) {
  return {
    pages: state.pages.filter((p) => p.published),
    slides: state.slides.filter((s) => s.active),
    news: state.news.filter((n) => n.published && !isShow(n)),
    shows: state.news.filter((n) => n.published && isShow(n)),
    items: state.items.filter((i) => i.active),
  };
}

/** Instala el API de mentira. `user` decide si la pantalla actúa como dirección o practicante. */
export async function mockStudio(page: Page, state: StudioState, user: AuthUserFixture = TEST_USER) {
  await seedSession(page, new URL(process.env.E2E_ORIGIN_URL || `http://arta.localhost:${process.env.E2E_PORT || 3100}`).origin);
  await mockAuthenticatedApi(page, { '/auth/me': { user } });

  let seq = 100;
  await page.route('**/uploads/**', (route) => {
    if (route.request().url().includes('/api/uploads')) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
  });
  await page.route('**/p/arta/revalidar', (route) => json(route, { ok: true }));
  await page.route('**/www.google.com/maps**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<body></body>' }),
  );

  await page.route('**/api/uploads', (route) => json(route, { url: `/uploads/subida-${seq++}.jpg` }));

  await page.route('**/api/studio/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    const body = method === 'GET' ? null : request.postDataJSON();
    if (method !== 'GET') state.calls.push({ method, path, body });

    if (method === 'GET') {
      if (path === '/studio/pages') return json(route, state.pages);
      if (path === '/studio/slides') return json(route, state.slides);
      if (path === '/studio/news') return json(route, state.news);
      if (path === '/studio/items') return json(route, state.items);
      if (path === '/studio/preview') return json(route, previewOf(state));
      if (path === '/studio/public/ARTA') return json(route, publicOf(state));
      return json(route, []);
    }

    if (path === '/studio/pages' && method === 'PUT') {
      const key = body.draft ? `${body.sectionKey}__propuesta` : body.sectionKey;
      state.pages = state.pages.filter((p) => p.sectionKey !== key);
      if (!body.draft) state.pages = state.pages.filter((p) => p.sectionKey !== `${body.sectionKey}__propuesta`);
      state.pages.push({ id: `p${seq++}`, sectionKey: key, title: body.title, contentJson: body.contentJson, published: !body.draft });
      return json(route, { ok: true });
    }
    if (path === '/studio/pages/publish') {
      for (const row of state.pages.filter((p) => p.sectionKey.endsWith('__propuesta'))) {
        const sectionKey = row.sectionKey.replace('__propuesta', '');
        state.pages = state.pages.filter((p) => p.sectionKey !== sectionKey && p.id !== row.id);
        state.pages.push({ ...row, sectionKey, published: true });
      }
      return json(route, { ok: true });
    }
    const proposal = /^\/studio\/pages\/(.+)\/proposal$/.exec(path);
    if (proposal && method === 'DELETE') {
      state.pages = state.pages.filter((p) => p.sectionKey !== `${proposal[1]}__propuesta`);
      return json(route, { ok: true });
    }
    if (path === '/studio/review') {
      const row = [...state.news, ...state.items].find((r) => r.id === body.id);
      if (row) row.reviewRequestedAt = new Date().toISOString();
      return json(route, { ok: true, notified: 2 });
    }
    if (path === '/studio/reorder') {
      const list = (body.kind === 'slide' ? state.slides : body.kind === 'news' ? state.news : state.items) as Row[];
      body.ids.forEach((id: string, index: number) => {
        const row = list.find((r) => r.id === id);
        if (row) row.sortOrder = index;
      });
      if (body.kind === 'slide') state.slides = [...state.slides].sort((a, b) => a.sortOrder - b.sortOrder);
      else if (body.kind === 'news') state.news = [...state.news].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
      else state.items = [...state.items].sort((a, b) => a.sortOrder - b.sortOrder);
      return json(route, { ok: true });
    }

    const row = /^\/studio\/(slides|news|items)(?:\/(.+))?$/.exec(path);
    if (row) {
      const table = row[1] === 'slides' ? 'slides' : row[1] === 'news' ? 'news' : 'items';
      if (method === 'POST') {
        const created = { id: `new-${seq++}`, ...body };
        state[table] = [created, ...state[table]];
        return json(route, created);
      }
      if (method === 'PUT') {
        const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
        state[table] = state[table].map((r) => (r.id === row[2] ? { ...r, ...clean } : r));
        return json(route, { ok: true });
      }
      if (method === 'DELETE') {
        state[table] = state[table].filter((r) => r.id !== row[2]);
        return json(route, { ok: true });
      }
    }
    return json(route, { ok: true });
  });
}

export const PRACTICANTE_USER: AuthUserFixture = {
  ...TEST_USER,
  id: 'usr-e2e-prac',
  email: 'practicante@arta.test',
  fullName: 'Ana Practicante',
  roleKey: 'practicante',
  entities: ['ARTA'],
  permissions: [],
};
