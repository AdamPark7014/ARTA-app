import { expect, test, type Page, type Route } from '@playwright/test';

import { mockApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Reglas de acceso del cliente, 01-11-2026 (docs/ROLES-Y-PERMISOS.md): quién ve cada pestaña del
 * evento en cada negocio, quién hace las OC, quién aprueba cada formato y la corrida.
 */

function person(fullName: string, roleKey: string, entities: Array<'ARTA' | 'EXPLANADA'> = ['ARTA', 'EXPLANADA']) {
  return { ...TEST_USER, id: `usr-${roleKey}`, fullName, roleKey, entities, permissions: [] };
}

const CHACHO = person('José Luis Arista', 'dir_general');
const LEIDA = person('Leida Osorio', 'dir_adjunta', ['ARTA']);
const JP = person('Juan Pablo Ramírez', 'compras');
const WILLIAMS = person('Williams Taja', 'produccion');
const RODRIGO = person('Rodrigo López', 'dir_auditorio');
const MONSE = person('Monse', 'contenido');
const ILIANA = person('Iliana', 'catering');
const PAULA = person('Paula Farfán', 'contabilidad');
const PRACTICANTE = person('Valeria Ruiz', 'practicante');

function checklist(id: string, key: string, title: string) {
  return {
    id,
    title,
    status: 'DRAFT',
    progressPct: 40,
    template: { id: `tpl-${key}`, key },
    dataJson: { sections: [] },
    versions: [],
    signatures: [],
  };
}

const EVENT = {
  id: 'evt-1',
  name: 'Noche de Bandas',
  artist: 'Los Ecos',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-12-20T02:00:00.000Z',
  checklists: [
    checklist('cl-general', 'EVENTO_GENERAL', 'Checklist Evento General'),
    checklist('cl-transporte', 'TRANSPORTACION', 'Transportación'),
    checklist('cl-catering', 'CATERING', 'Catering'),
  ],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

async function openEvent(
  page: Page,
  baseURL: string,
  user: ReturnType<typeof person>,
  over: Record<string, unknown> = {},
  query = '',
  stubs: Record<string, unknown> = {},
) {
  const event = { ...EVENT, ...over };
  await seedSession(page, baseURL);
  await mockApi(page, {
    '/auth/me': { user },
    '/events/evt-1': event,
    '/documents/event/evt-1': [],
    '/vendor/event/evt-1': [],
    '/testigos/event/evt-1': [],
    ...Object.fromEntries(event.checklists.map((c) => [`/checklists/${c.id}`, c])),
    ...stubs,
  } as never);
  await page.goto(`/events/evt-1${query}`);
  await expect(page.getByRole('heading', { name: 'Noche de Bandas' }).first()).toBeVisible();
}

const tabNames = async (page: Page) =>
  (await page.locator('.tab-bar__btn').allInnerTexts()).map((t) => t.replace(/\s*\d+\s*$/, '').trim());

test.describe('Pestañas del evento', () => {
  test('en Arta van en el orden que pidió el cliente', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO);
    expect(await tabNames(page)).toEqual([
      'Resumen',
      'Corrida',
      'Campaña',
      'Formatos',
      'Órdenes de compra',
      'Convenios',
      'Boletera',
      'Tareas',
      'Documentos',
      'Adendum',
      'Testigos',
    ]);
  });

  test('el Auditorio no lleva corrida, campaña ni convenios', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO, { entity: 'EXPLANADA' }, '?tab=finance');
    const names = await tabNames(page);
    expect(names).not.toContain('Corrida');
    expect(names).not.toContain('Campaña');
    expect(names).not.toContain('Convenios');
    // La liga vieja a la corrida cae en Resumen en vez de una pantalla vacía.
    await expect(page.locator('.tab-bar__btn.is-active')).toHaveText(/Resumen/);
  });

  const CASES: Array<[string, ReturnType<typeof person>, string[], string[]]> = [
    ['Juan Pablo ve todo menos la corrida', JP, ['Campaña', 'Formatos', 'Órdenes de compra', 'Adendum'], ['Corrida']],
    ['Paula ve todo menos la corrida', PAULA, ['Órdenes de compra', 'Adendum', 'Boletera'], ['Corrida']],
    ['Leida ve la corrida', LEIDA, ['Corrida', 'Órdenes de compra'], []],
    ['Williams no ve corrida ni OC', WILLIAMS, ['Campaña', 'Formatos'], ['Corrida', 'Órdenes de compra', 'Adendum']],
    ['Monse ve formatos y campaña, nada de dinero', MONSE, ['Campaña', 'Formatos'], ['Corrida', 'Órdenes de compra', 'Adendum', 'Tareas', 'Documentos', 'Boletera']],
    ['Iliana solo ve formatos', ILIANA, ['Formatos'], ['Corrida', 'Campaña', 'Órdenes de compra', 'Adendum', 'Tareas', 'Documentos', 'Testigos']],
    ['Rodrigo en Arta solo llega a formatos', RODRIGO, ['Formatos'], ['Corrida', 'Campaña', 'Órdenes de compra', 'Boletera', 'Testigos']],
  ];
  for (const [name, user, visible, hidden] of CASES) {
    test(name, async ({ page, baseURL }) => {
      await openEvent(page, baseURL!, user);
      const names = await tabNames(page);
      for (const tab of visible) expect(names).toContain(tab);
      for (const tab of hidden) expect(names).not.toContain(tab);
    });
  }

  test('Rodrigo en el Auditorio ve todo menos OC', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, RODRIGO, { entity: 'EXPLANADA' });
    const names = await tabNames(page);
    expect(names).toContain('Boletera');
    expect(names).toContain('Tareas');
    expect(names).not.toContain('Órdenes de compra');
  });
});

test.describe('Corrida', () => {
  test('Chacho la genera y el botón sí llama al servidor', async ({ page, baseURL }) => {
    let generated = false;
    await openEvent(page, baseURL!, CHACHO, {}, '?tab=finance');
    await page.route('**/api/finance/event/evt-1/generate', async (route: Route) => {
      generated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"file-1"}' });
    });
    await page.getByRole('button', { name: 'Generar corrida' }).click();
    await expect.poll(() => generated).toBe(true);
  });

  test('con solo un PDF también se puede generar', async ({ page, baseURL }) => {
    const pdf = { id: 'f1', fileName: 'corrida.pdf', url: '/uploads/corrida.pdf', module: 'finance', mimeType: 'application/pdf', createdAt: '2026-10-01T00:00:00.000Z' };
    await openEvent(page, baseURL!, CHACHO, { files: [pdf] }, '?tab=finance');
    await expect(page.getByRole('button', { name: 'Generar en Excel' })).toBeVisible();
  });

  test('Leida la sube, pero no la genera ni la modifica', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, LEIDA, {}, '?tab=finance');
    await expect(page.getByText('Subir corrida')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar corrida' })).toHaveCount(0);
    await expect(page.getByText('Reemplazar por externo')).toHaveCount(0);
  });
});

test.describe('Formatos', () => {
  test('Evento General no lo aprueba Leida; Transportación sí', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, LEIDA, {}, '?tab=checklists&checklist=cl-general');
    await expect(page.getByText('Checklist Evento General').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Aprobar/ })).toHaveCount(0);

    await page.goto('/events/evt-1?tab=checklists&checklist=cl-transporte');
    await expect(page.getByRole('button', { name: /^Aprobar/ })).toBeVisible();
  });

  test('Chacho aprueba Evento General', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO, {}, '?tab=checklists&checklist=cl-general');
    await expect(page.getByRole('button', { name: /^Aprobar/ })).toBeVisible();
  });

  test('Juan Pablo no agrega formatos a un evento de Arta sin barra ni merch', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, JP, {}, '?tab=checklists&checklist=cl-transporte');
    await expect(page.getByRole('button', { name: /^Aprobar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar y generar PDF' })).toHaveCount(0);
  });
});

test.describe('Órdenes de compra', () => {
  test('solo Juan Pablo las hace: Chacho autoriza, pero no crea', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO, {}, '?tab=ocs');
    await expect(page.getByText('Sin órdenes de compra')).toBeVisible();
    await expect(page.getByRole('button', { name: /Nueva orden|Crear orden/ })).toHaveCount(0);
  });

  test('adendum: persona y cuenta son obligatorias y viajan en la orden', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, JP, {}, '?tab=ocs');
    await page.getByRole('button', { name: /Nueva orden|Crear orden/ }).first().click();
    await page.getByRole('radio', { name: 'Adendum' }).click();

    const posted: Array<Record<string, unknown>> = [];
    await page.route('**/api/purchase-orders', async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"po-new"}' });
    });

    await page.getByRole('combobox', { name: 'Descripción, partida 1' }).fill('Adendum de producción');
    await page.getByRole('spinbutton', { name: 'Precio, partida 1' }).fill('15000');
    await expect(page.getByText('Falta la persona o la cuenta del adendum')).toBeVisible();
    const submit = page.locator('.oc-form button[type="submit"]');
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder('Nombre de quien recibe').fill('Sofía Méndez');
    await page.getByPlaceholder('Cuenta o CLABE').fill('012180001234567890');
    await submit.click();

    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({
      paymentMethod: 'ADENDUM',
      adendumPerson: 'Sofía Méndez',
      adendumAccount: '012180001234567890',
    });
  });

  test('la pestaña Adendum junta los de ese evento', async ({ page, baseURL }) => {
    const po = {
      id: 'po-a',
      rubro: 'audio',
      vendorName: 'Sofía Méndez',
      amount: 15000,
      status: 'AUTHORIZED',
      paymentMethod: 'ADENDUM',
      adendumPerson: 'Sofía Méndez',
      adendumAccount: '012180001234567890',
      adendumFileUrl: '/uploads/adendum.pdf',
      adendumFileName: 'adendum.pdf',
      lines: [],
      proofs: [],
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    await openEvent(page, baseURL!, PAULA, { purchaseOrders: [po] }, '?tab=adendum');
    await expect(page.getByRole('cell', { name: /Sofía Méndez/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '012180001234567890' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'adendum.pdf' })).toBeVisible();
    // Paula paga; no los crea.
    await expect(page.getByRole('button', { name: 'Nuevo adendum' })).toHaveCount(0);
  });
});

test.describe('Boletera en Resumen', () => {
  test('con liga se embebe y siempre se puede abrir aparte', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO, { boleteraUrl: 'https://boletos.example.com/show' });
    const frame = page.locator('iframe.ev-boletera__frame');
    await expect(frame).toHaveAttribute('src', 'https://boletos.example.com/show');
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(page.getByRole('link', { name: 'Abrir aparte' })).toHaveAttribute('href', 'https://boletos.example.com/show');
  });

  test('sin liga: quien edita la agrega y quien no, no ve la sección', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, CHACHO);
    await expect(page.getByRole('button', { name: 'Agregar liga' })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar liga' }).click();
    await page.getByPlaceholder('https://…').fill('http://inseguro.example.com');
    await expect(page.getByText('Pega la liga completa, con https://')).toBeVisible();
  });

  test('Iliana no edita la liga', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, ILIANA);
    await expect(page.getByRole('button', { name: 'Agregar liga' })).toHaveCount(0);
  });
});

test.describe('Menú', () => {
  const nav = (page: Page) => page.getByRole('navigation', { name: 'Módulos del panel' });

  test('Finanzas va arriba para Paula y para dirección; Juan Pablo no la ve', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, PAULA);
    const links = await nav(page).getByRole('link').allInnerTexts();
    expect(links.findIndex((t) => /Finanzas/.test(t))).toBeLessThanOrEqual(1);

    await openEvent(page, baseURL!, JP);
    await expect(nav(page).getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
  });

  test('Usuarios es solo de Chacho y Arturo', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, LEIDA);
    await expect(nav(page).getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    await openEvent(page, baseURL!, CHACHO);
    await expect(nav(page).getByRole('link', { name: 'Usuarios' })).toHaveCount(1);
  });

  test('en el Auditorio no hay Campañas', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: person('Rodrigo López', 'dir_auditorio', ['EXPLANADA']) } } as never);
    await page.goto('/dashboard');
    await expect(nav(page).getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Campañas' })).toHaveCount(0);
  });

  test('el practicante ve Studio y Testigos, sin eventos ni OC', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: PRACTICANTE }, '/testigos/events': [] } as never);
    await page.goto('/testigos');
    await expect(page.getByRole('heading', { name: 'Testigos de publicidad' }).first()).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Testigos de publicidad' })).toHaveCount(1);
    await expect(nav(page).getByRole('link', { name: 'Eventos actuales' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Órdenes de compra' })).toHaveCount(0);
  });
});

test.describe('Testigos de publicidad', () => {
  test('se agrega con liga y el formulario arma el envío', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, WILLIAMS, { entity: 'EXPLANADA' }, '?tab=testigos');
    let sent = '';
    await page.route('**/api/testigos/event/evt-1', async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      sent = route.request().postData() ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"t1"}' });
    });
    await page.getByRole('button', { name: 'Agregar testigo' }).click();
    await expect(page.getByText('Sube una foto o archivo, o pega una liga')).toBeVisible();
    await page.getByPlaceholder('https://…').fill('https://instagram.com/p/abc');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect.poll(() => sent).toContain('instagram.com/p/abc');
    // Sin marcar «para el sitio» no se manda: «false» en multipart se leería como verdadero.
    expect(sent).not.toContain('isPublic');
  });

  test('Williams solo los ve en Arta', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, WILLIAMS, {}, '?tab=testigos');
    await expect(page.getByText('Sin testigos todavía')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar testigo' })).toHaveCount(0);
  });

  test('Monse los consulta sin subir', async ({ page, baseURL }) => {
    await openEvent(page, baseURL!, MONSE, {}, '?tab=testigos');
    await expect(page.getByText('Sin testigos todavía')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar testigo' })).toHaveCount(0);
  });
});

test.describe('Finanzas', () => {
  const SUMMARY = {
    period: { from: '2026-11-01', to: '2026-11-30' },
    kpis: {
      toPay: { amount: 15000, count: 1 },
      transfers: { count: 1 },
      paid: { amount: 0, count: 0 },
      pendingAuth: { amount: 0, count: 0 },
      advancesToPay: { amount: 0, count: 0 },
      missingProof: { count: 0 },
    },
    toPay: [
      {
        id: 'po-1',
        rubro: 'audio',
        vendorName: 'Audio Puebla',
        amount: 15000,
        status: 'AUTHORIZED',
        paymentMethod: 'TRANSFERENCIA',
        paymentLabel: 'Transferencia',
        authorizedAt: '2026-11-01T00:00:00.000Z',
        requestedBy: 'Juan Pablo Ramírez',
        event: { id: 'evt-1', name: 'Noche de Bandas', entity: 'ARTA' },
        proofs: [],
        needsProof: true,
      },
    ],
    paid: [],
    adendums: [],
    advances: [],
    byEvent: [],
  };

  test('Paula ve lo que falta pagar y llega a la orden', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: PAULA }, '/finanzas/resumen': SUMMARY } as never);
    await page.goto('/finanzas');
    await expect(page.getByRole('link', { name: 'Audio Puebla' })).toHaveAttribute('href', '/purchase-orders?po=po-1');
    await expect(page.getByText('Falta', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Exportar pagos' })).toHaveAttribute('href', /\/api\/finanzas\/pagos\.csv/);
  });

  test('Juan Pablo no tiene Finanzas', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: JP } } as never);
    await page.goto('/finanzas');
    await expect(page.getByText('Finanzas no está a tu alcance')).toBeVisible();
  });
});

test.describe('Perfiles de practicante', () => {
  test('generar enseña la contraseña una vez y renovar cambia la fecha', async ({ page, baseURL }) => {
    const rows: Array<Record<string, unknown>> = [];
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: CHACHO }, '/practicantes': rows } as never);
    let created: Record<string, unknown> | null = null;
    await page.route('**/api/practicantes', async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      created = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'p1',
          email: 'valeria.ruiz@practicantes.arta',
          fullName: 'Valeria Ruiz',
          active: true,
          canPublish: true,
          expired: false,
          createdAt: '2026-11-01T00:00:00.000Z',
          password: 'clave-de-una-vez',
        }),
      });
    });

    await page.goto('/studio/practicantes');
    await page.getByRole('button', { name: 'Generar perfil' }).first().click();
    await page.getByLabel('Nombre').fill('Valeria Ruiz');
    await page.locator('.practicante-form').getByRole('button', { name: 'Generar perfil' }).click();

    await expect(page.getByText('clave-de-una-vez')).toBeVisible();
    await expect(page.getByText('no se vuelve a mostrar')).toBeVisible();
    expect(created).toMatchObject({ fullName: 'Valeria Ruiz', canPublish: true });
  });
});

test.describe('Usuarios', () => {
  const ROLES = [
    { key: 'dir_adjunta', label: 'Dirección adjunta' },
    { key: 'compras', label: 'Compras' },
    { key: 'catering', label: 'Catering' },
    { key: 'logistica', label: 'Logística y producción' },
  ];

  test('elegir rol dice qué hace y qué verá en cada negocio', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, {
      '/auth/me': { user: CHACHO },
      '/users/roles': ROLES,
      '/users/governance': { kpis: {}, users: [], byRole: {} },
      '/users': [],
    } as never);
    await page.goto('/users');
    await page.getByRole('radio', { name: /Catering/ }).check({ force: true });
    await expect(page.getByText('Iliana: ve la información general y edita solo catering.')).toBeVisible();
    const preview = page.locator('.role-preview__entity').first();
    await expect(preview.getByText('En Arta')).toBeVisible();
    await expect(preview.locator('.role-preview__item', { hasText: 'Formatos' })).toContainText('Solo catering');
    await expect(preview.locator('.role-preview__item', { hasText: 'Corrida' })).toContainText('Sin acceso');

    await page.getByRole('radio', { name: /Compras/ }).check({ force: true });
    await expect(preview.locator('.role-preview__item', { hasText: 'Órdenes de compra' })).toContainText('Las hace');
  });
});
