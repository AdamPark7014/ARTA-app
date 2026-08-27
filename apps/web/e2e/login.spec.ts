import { expect, test, type Route } from '@playwright/test';

import { TEST_USER, mockApi } from './support/mock-api';

/**
 * El login de ARTA tiene 2FA TOTP forzado por organización
 * (ver `apps/api/test/auth-2fa-enforcement.e2e-spec.ts`). Aquí se cubre el
 * lado web de ese contrato: paso 1 credenciales → paso 2 código → panel.
 */
test.describe('Login del panel', () => {
  test('el reto 2FA lleva al usuario hasta el dashboard', async ({ page }) => {
    let loginCalls = 0;
    let verifyCalls = 0;

    await mockApi(page, {
      '/auth/login': async (route: Route) => {
        loginCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ requires2fa: true, challengeId: 'chal-e2e-1' }),
        });
      },
      '/auth/2fa/verify-login': async (route: Route) => {
        verifyCalls += 1;
        const payload = route.request().postDataJSON() as {
          challengeId?: string;
          code?: string;
        };
        expect(payload.challengeId).toBe('chal-e2e-1');
        expect(payload.code).toBe('123456');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: TEST_USER }),
        });
      },
      '/auth/me': { user: TEST_USER },
    });

    await page.goto('/login');

    // `arta.localhost` resuelve a la entidad ARTA en lib/domains.ts.
    await expect(page.getByRole('heading', { name: 'Panel Arta Producciones' })).toBeVisible();

    await page.locator('input[name="email"]').fill('e2e@arta.test');
    await page.locator('input[name="password"]').fill('contrasena-e2e');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Verificación 2FA' })).toBeVisible();
    expect(loginCalls).toBe(1);

    await page.getByPlaceholder('000000').fill('123456');
    await page.getByRole('button', { name: 'Confirmar 2FA' }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
    expect(verifyCalls).toBe(1);
  });

  test('credenciales inválidas muestran error y no salen de /login', async ({ page }) => {
    await mockApi(page, {
      '/auth/login': async (route: Route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Credenciales inválidas' }),
        });
      },
    });

    await page.goto('/login');
    await page.locator('input[name="email"]').fill('nadie@arta.test');
    await page.locator('input[name="password"]').fill('incorrecta');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // `.form-error` desambigua del route announcer de Next, que también es role=alert.
    await expect(page.locator('.form-error[role="alert"]')).toHaveText(
      'Correo o contraseña incorrectos.',
    );
    expect(new URL(page.url()).pathname).toBe('/login');
  });
});
