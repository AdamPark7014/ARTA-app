import type { Page, Route } from '@playwright/test';

/**
 * Doble de la capa `/api/*`.
 *
 * El navegador siempre pega a `/api<path>` (rewrite de Next hacia el
 * workspace `api`). Interceptamos antes del rewrite, así que los e2e del web
 * no necesitan Postgres ni NestJS levantados: el contrato que se prueba es el
 * de `lib/api.ts` + `lib/user-context.tsx`, no el del backend (ése ya está
 * cubierto por los e2e de `apps/api`).
 */

export type AuthUserFixture = {
  id: string;
  email: string;
  fullName: string;
  title?: string | null;
  roleKey: string;
  entities: Array<'ARTA' | 'EXPLANADA'>;
  permissions: string[];
  organizationId?: string;
  totpEnabled?: boolean;
};

export const TEST_USER: AuthUserFixture = {
  id: 'usr-e2e-super',
  email: 'e2e@arta.test',
  fullName: 'Ana Robles',
  title: 'Dirección de operaciones',
  roleKey: 'super_admin',
  entities: ['ARTA', 'EXPLANADA'],
  permissions: ['everything'],
  organizationId: 'org-e2e',
  totpEnabled: true,
};

export const TEST_DIRECTORY = [
  { id: 'usr-e2e-super', fullName: 'Ana Robles', title: 'Dirección de operaciones' },
  { id: 'usr-e2e-logi', fullName: 'Beto Sandoval', title: 'Logística y producción' },
];

export const TEST_EVENTS = [
  {
    id: 'evt-e2e-1',
    name: 'Noche de Bandas',
    artist: 'Los Ecos',
    venue: 'Auditorio Arema',
    status: 'ACTIVE',
    campaignType: 'CONCERT',
    startsAt: '2026-09-20T02:00:00.000Z',
    updatedAt: '2026-08-20T18:00:00.000Z',
    _count: { checklists: 4, purchaseOrders: 2, tasks: 7 },
  },
  {
    id: 'evt-e2e-2',
    name: 'Festival Explanada',
    artist: 'Varios',
    venue: 'Explanada',
    status: 'DRAFT',
    campaignType: 'FESTIVAL',
    startsAt: '2026-11-02T02:00:00.000Z',
    updatedAt: '2026-08-25T18:00:00.000Z',
    _count: { checklists: 1, purchaseOrders: 0, tasks: 2 },
  },
];

/** Payload completo de `/analytics/overview` — el dashboard lee casi todos los campos. */
export const TEST_OVERVIEW = {
  generatedAt: '2026-08-27T12:00:00.000Z',
  kpis: {
    eventsTotal: 2,
    eventsActive: 1,
    eventsDraft: 1,
    eventsClosed: 0,
    eventsAtRisk: 1,
    upcoming14d: 1,
    avgOpsProgress: 62,
    pendingDelivered: 1,
    pendingAuthorized: 0,
    openTasks: 5,
    blockedTasks: 1,
    overdueTasks: 2,
    poPipelineAmount: 128000,
    poPaidAmount: 64000,
    poAgingOver7: 1,
    portfolioIncome: 480000,
    portfolioExpense: 310000,
    portfolioNet: 170000,
    advanceTotal: 90000,
    activity90d: 41,
  },
  eventsByStatus: { ACTIVE: 1, DRAFT: 1 },
  createdTrend: [
    { month: '2026-06', count: 1 },
    { month: '2026-07', count: 0 },
    { month: '2026-08', count: 1 },
  ],
  atRisk: [
    {
      id: 'evt-e2e-1',
      name: 'Noche de Bandas',
      artist: 'Los Ecos',
      avgProgress: 41,
      risk: 'critical',
      daysToShow: 9,
    },
  ],
  upcoming: [
    {
      id: 'evt-e2e-1',
      name: 'Noche de Bandas',
      artist: 'Los Ecos',
      startsAt: '2026-09-20T02:00:00.000Z',
      avgProgress: 41,
    },
  ],
  eventHealth: [
    {
      id: 'evt-e2e-1',
      name: 'Noche de Bandas',
      artist: 'Los Ecos',
      status: 'ACTIVE',
      startsAt: '2026-09-20T02:00:00.000Z',
      avgProgress: 41,
      risk: 'critical',
      daysToShow: 9,
    },
    {
      id: 'evt-e2e-2',
      name: 'Festival Explanada',
      artist: 'Varios',
      status: 'DRAFT',
      startsAt: '2026-11-02T02:00:00.000Z',
      avgProgress: 80,
      risk: 'healthy',
      daysToShow: 52,
    },
  ],
  topMargin: [
    { eventId: 'evt-e2e-1', name: 'Noche de Bandas', net: 170000, income: 480000, expense: 310000 },
  ],
  bottomMargin: [{ eventId: 'evt-e2e-2', name: 'Festival Explanada', net: -12000 }],
  checklistByTemplate: {
    'Producción técnica': { count: 2, avgProgress: 41, pendingAuth: 1 },
    Hospitalidad: { count: 1, avgProgress: 88, pendingAuth: 0 },
  },
  alerts: [
    {
      severity: 'critical',
      code: 'EVENT_AT_RISK',
      message: 'Noche de Bandas va al 41% a 9 días del show.',
      href: '/events/evt-e2e-1',
    },
  ],
  recentActivity: [
    {
      id: 'act-1',
      action: 'checklist.item.check',
      resource: 'Checklist Producción técnica',
      at: '2026-08-27T11:30:00.000Z',
      user: 'Ana Robles',
    },
  ],
};

type JsonBody = unknown;
type RouteHandler = (route: Route) => unknown | Promise<unknown>;
export type ApiStubs = Record<string, JsonBody | RouteHandler>;

/** `/auth/me` sin sesión: el default deja la app en estado deslogueado. */
const DEFAULT_STUBS: ApiStubs = {
  '/auth/me': (route: Route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'No autorizado' }),
    }),
  '/analytics/overview': TEST_OVERVIEW,
  '/events': TEST_EVENTS,
  // Campana de avisos: el AppShell la consulta en cada carga.
  '/notifications/unread-count': { count: 0 },
  '/notifications': [],
  // Ventana de solicitud de OC (junta 2026-08-28).
  '/purchase-orders/window': {
    config: {
      enabled: true,
      days: [1, 4],
      start: '10:00',
      end: '14:00',
      timeZone: 'America/Mexico_City',
      note: '',
    },
    open: true,
    scheduleLabel: 'lunes y jueves de 10:00 a 14:00',
    nextOpenLabel: null,
    nowMinutes: 660,
    canRequestNow: true,
    bypass: false,
    canEdit: true,
  },
};

function isHandler(value: JsonBody | RouteHandler): value is RouteHandler {
  return typeof value === 'function';
}

/**
 * Registra el intercept. `stubs` se indexa por path SIN el prefijo `/api` y
 * SIN query string (`/auth/me`, `/analytics/overview`). Lo no declarado
 * responde `[]`, que es lo que esperan las listas del panel.
 */
export async function mockApi(page: Page, stubs: ApiStubs = {}): Promise<void> {
  const table: ApiStubs = { ...DEFAULT_STUBS, ...stubs };

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '') || '/';
    const entry = table[path];

    if (entry !== undefined) {
      if (isHandler(entry)) {
        await entry(route);
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entry),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

/** Deja al navegador con la pista de sesión que middleware + UserProvider exigen. */
export async function seedSession(page: Page, origin: string): Promise<void> {
  const { hostname } = new URL(origin);
  await page.context().addCookies([
    { name: 'arta_session', value: '1', domain: hostname, path: '/' },
    { name: 'arta_csrf', value: 'e2e-csrf-token', domain: hostname, path: '/' },
  ]);
}

/** Atajo: usuario autenticado + overview + eventos. */
export async function mockAuthenticatedApi(page: Page, stubs: ApiStubs = {}): Promise<void> {
  await mockApi(page, { '/auth/me': { user: TEST_USER }, ...stubs });
}
