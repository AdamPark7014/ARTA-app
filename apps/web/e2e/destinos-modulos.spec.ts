import { expect, test } from '@playwright/test';

import { mockApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * Adam, 07-11-2026: un clic en algo concreto abre eso, no una pantalla general. Los módulos llegan
 * ya filtrados desde Riesgo (`?riesgo=`), el calendario enseña todos los shows de un día con
 * «+N más» y Avisos cambia de pestaña al navegar dentro del panel, no solo al cargar.
 */

function opsRow(id: string, name: string, risk: 'critical' | 'watch' | 'healthy', progressPct: number) {
  return {
    checklistId: `cl-${id}`,
    title: 'Hospedaje',
    progressPct,
    templateKey: 'HOSPEDAJE',
    deliveredAt: null,
    authorizedAt: null,
    lastEditedAt: null,
    lastEditedBy: null,
    dataJson: { sections: [] },
    risk,
    daysToShow: 12,
    event: { id: `evt-${id}`, name, artist: null, status: 'ACTIVE', startsAt: '2030-12-20T02:00:00.000Z' },
  };
}

const OPS = {
  kpis: { total: 3, avgProgress: 57, incomplete: 3, pendingAuth: 3, critical: 1, authorized: 0 },
  byRisk: { critical: 1, watch: 1, healthy: 1 },
  rows: [
    opsRow('c', 'Gira Crítica', 'critical', 20),
    opsRow('w', 'Noche en Vela', 'watch', 60),
    opsRow('h', 'Show Tranquilo', 'healthy', 90),
  ],
};

test.describe('Cada clic abre lo exacto', () => {
  test('Riesgo manda al módulo ya filtrado: /hospitality?riesgo=critical solo enseña los críticos', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: TEST_USER }, '/analytics/ops': OPS } as never);
    await page.goto('/hospitality?riesgo=critical');

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Gira Crítica');
    await expect(page.getByText('Show Tranquilo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Críticos/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Filtrar por riesgo', { exact: true })).toHaveValue('critical');

    // Quitar el filtro deja la lista completa.
    await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
    await expect(rows).toHaveCount(3);
  });

  test('«+N más» del calendario abre el día completo sin abrir la nota, y se vuelve a cerrar', async ({ page, baseURL }) => {
    const day = '2030-03-14';
    const shows = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].map((n, i) => ({
      id: `evt-${i}`,
      name: `Show ${n}`,
      status: 'ACTIVE',
      startsAt: `${day}T20:00:00`,
      endsAt: null,
    }));
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: TEST_USER }, '/events': shows, '/calendar/notes': [] } as never);
    await page.goto(`/calendar?date=${day}`);

    const cell = page.locator(`[data-day="${day}"]`);
    await expect(cell).toHaveClass(/is-focus/);
    // Tres shows caben como barras sobre la semana; los otros dos esperan en «+2 más».
    await expect(page.locator('.mcal__bar')).toHaveCount(3);
    await expect(cell.locator('.mcal__chip')).toHaveCount(0);

    await cell.getByRole('button', { name: '+2 más' }).click();
    await expect(cell.locator('.mcal__chip')).toHaveCount(2);
    await expect(cell.getByRole('link', { name: 'Show Cinco' })).toHaveAttribute('href', '/events/evt-4');
    // El día también se toca para dejar una nota: abrir «+N más» no debe abrir ese cuadro.
    await expect(cell.locator('.mcal__note-form')).toHaveCount(0);

    await cell.getByRole('button', { name: 'Ver menos' }).click();
    await expect(cell.locator('.mcal__chip')).toHaveCount(0);
  });

  test('un show de varios días es una sola barra por semana, con su nombre completo', async ({ page, baseURL }) => {
    // Jue 17 a mar 22 de dic de 2026: cruza el domingo, así que son dos barras (una por semana).
    const shows = [
      { id: 'evt-circo', name: 'Circo Siniestro Invocación', status: 'ACTIVE', startsAt: '2026-12-17T20:00:00', endsAt: '2026-12-22T23:00:00' },
    ];
    await seedSession(page, baseURL!);
    await mockApi(page, { '/auth/me': { user: TEST_USER }, '/events': shows, '/calendar/notes': [] } as never);
    await page.goto('/calendar?date=2026-12-17');

    const bars = page.locator('.mcal__bar');
    await expect(bars).toHaveCount(2);
    await expect(bars.first()).toHaveText('Circo Siniestro Invocación');
    await expect(bars.first()).toHaveClass(/is-continues/);
    await expect(bars.nth(1)).toHaveClass(/is-continued/);
    // La barra ocupa de jueves a domingo: cuatro casillas, no un chip cortado en cada una.
    const bar = await bars.first().boundingBox();
    const day = await page.locator('[data-day="2026-12-17"]').boundingBox();
    expect(bar!.width).toBeGreaterThan(day!.width * 3.5);
  });

  test('Avisos cambia a «Enviados» al navegar dentro del panel, no solo al cargar la página', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, {
      '/auth/me': { user: TEST_USER },
      '/notifications/sent': [
        {
          key: 's1',
          type: 'task.assigned',
          title: 'Te asigné: Cotizar luces',
          linkUrl: '/tasks?task=t1',
          createdAt: new Date().toISOString(),
          recipients: [{ id: 'u1', fullName: 'Beto Soto', seenAt: null, readAt: null }],
        },
      ],
    } as never);
    await page.goto('/notifications');
    await expect(page.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');

    // El pie de la campana lleva a Enviados con un Link (navegación del lado del cliente).
    await page.getByRole('button', { name: 'Avisos', exact: true }).click();
    await page.getByRole('dialog', { name: 'Avisos' }).getByRole('link', { name: 'Enviados' }).click();
    await expect(page).toHaveURL(/\/notifications\?tab=enviados$/);
    await expect(page.getByRole('tab', { name: 'Enviados' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.sent-row')).toHaveCount(1);
    await expect(page.locator('.sent-row').first()).toContainText('Te asigné: Cotizar luces');
  });
});
