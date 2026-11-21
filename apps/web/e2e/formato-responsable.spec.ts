import { expect, test } from '@playwright/test';
import { mockApi, seedSession } from './support/mock-api';
import { RICH_STUBS, RICH_USER } from './support/rich-fixtures';

/**
 * Responsable y fecha límite por formato (21-11-2026). Antes un formato no tenía dueño y la app no
 * decía quién debía qué.
 */
test.describe('Formatos · responsable', () => {
  test('la lista dice quién debe cada formato y deja asignarlo sin abrirlo', async ({ page, baseURL }) => {
    const sent: Array<{ url: string; body: unknown }> = [];
    await seedSession(page, baseURL!);
    await mockApi(page, {
      ...RICH_STUBS,
      '/auth/me': { user: RICH_USER },
      '/checklists/chk-rich-transporte/assignment': async (route) => {
        sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      },
    } as never);
    await page.goto('/events/evt-rich-1?tab=checklists');

    // El que ya tiene dueño lo dice, con su fecha.
    const produccion = page.locator('.fmt-item', { hasText: 'Producción técnica' });
    await expect(produccion.locator('.fmt-owner__name')).toHaveText(/Octavio/);
    await expect(produccion.locator('.fmt-owner__due')).toHaveText(/vence/);

    // El que no, lo dice y se asigna ahí mismo.
    const transporte = page.locator('.fmt-item', { hasText: 'Transporte terrestre' });
    await expect(transporte.getByText('Sin responsable')).toBeVisible();
    await transporte.getByRole('button', { name: /Asignar responsable de Transporte/ }).click();
    const people = transporte.getByRole('combobox', { name: 'Responsable', exact: true });
    const firstPerson = await people.locator('option').nth(1).getAttribute('value');
    await people.selectOption(firstPerson!);
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].body).toEqual({ ownerId: firstPerson });

    await transporte.getByLabel('Fecha límite').fill('2026-12-04');
    await expect.poll(() => sent.length).toBe(2);
    expect((sent[1].body as { dueAt: string }).dueAt).toMatch(/^2026-12-0[45]T/);
  });

  test('«Lo siguiente» nombra al responsable o dice que no hay', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockApi(page, { ...RICH_STUBS, '/auth/me': { user: RICH_USER } } as never);
    await page.goto('/events/evt-rich-1');
    await expect(page.locator('.next-steps__detail')).toContainText('Sin responsable');
  });
});
