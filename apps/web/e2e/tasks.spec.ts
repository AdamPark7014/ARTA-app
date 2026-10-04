import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_DIRECTORY } from './support/mock-api';

/**
 * Junta 2026-08-28:
 *  - «Tareas permita asignar tareas entre todos los integrantes de la
 *    organización, de manera que cualquier miembro pueda solicitar o asignar
 *    una actividad a otro cuando necesite de su apoyo».
 *  - «La persona a quien se le asigne una tarea deberá recibir una
 *    notificación dentro de la plataforma».
 */
test.describe('Tareas y avisos', () => {
  test('se le asigna una tarea a otro integrante del equipo', async ({ page, baseURL }) => {
    const posted: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/users/directory': TEST_DIRECTORY,
      '/tasks/mine': [],
      '/tasks': (route: Route) => {
        if (route.request().method() === 'POST') {
          posted.push(JSON.parse(route.request().postData() || '{}'));
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'task-e2e-1' }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      },
      '/tasks/requested': [],
    });

    await page.goto('/tasks');

    await page.getByLabel('Tarea', { exact: true }).fill('Cotizar transporte del staff');
    await page.getByRole('button', { name: /^Asignar a:/ }).click();
    await page.getByRole('option', { name: /Beto Sandoval/ }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Listo' }).click();
    await page.getByRole('button', { name: 'Asignar tarea' }).click();

    await expect(page.getByText(/Tarea asignada a Beto Sandoval/)).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      title: 'Cotizar transporte del staff',
      assigneeIds: ['usr-e2e-logi'],
    });
    // Sin evento: es una petición de apoyo entre compañeros.
    expect(posted[0].eventId).toBeUndefined();
  });

  /** Correcciones 30-09-2026: «dejar que se puedan asignar tareas a 1 o más personas». */
  test('una tarea se asigna a dos personas a la vez', async ({ page, baseURL }) => {
    const posted: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/users/directory': TEST_DIRECTORY,
      '/tasks/mine': [],
      '/tasks': (route: Route) => {
        if (route.request().method() === 'POST') {
          posted.push(JSON.parse(route.request().postData() || '{}'));
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'task-e2e-2' }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      },
      '/tasks/requested': [],
    });

    await page.goto('/tasks');

    await page.getByLabel('Tarea', { exact: true }).fill('Confirmar documento de rueda de prensa');
    await page.getByRole('button', { name: /^Asignar a:/ }).click();
    await page.getByRole('option', { name: /Beto Sandoval/ }).getByRole('checkbox').check();
    await page.getByRole('option', { name: /Ana Robles/ }).getByRole('checkbox').check();
    await expect(page.getByText(/2 personas · la primera es la responsable principal/)).toBeVisible();
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByRole('button', { name: /^Asignar a: Beto Sandoval, Ana Robles/ })).toBeVisible();
    await page.getByRole('button', { name: 'Asignar tarea' }).click();

    await expect(page.getByText(/Tarea asignada a Beto Sandoval, Ana Robles/)).toBeVisible();
    expect(posted[0]).toMatchObject({ assigneeIds: ['usr-e2e-logi', 'usr-e2e-super'] });
  });

  test('la campana muestra los avisos sin leer', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/unread-count': { count: 2 },
      '/notifications': [
        {
          id: 'ntf-1',
          type: 'task.assigned',
          title: 'Beto Sandoval te asignó una tarea',
          body: 'Cotizar transporte del staff · Noche de Bandas',
          linkUrl: '/tasks',
          readAt: null,
          createdAt: '2026-08-28T15:00:00.000Z',
        },
      ],
    });

    await page.goto('/dashboard');

    const bell = page.getByRole('button', { name: 'Avisos (2 sin leer)' });
    await expect(bell).toBeVisible();

    await bell.click();

    await expect(page.getByText('Beto Sandoval te asignó una tarea')).toBeVisible();
  });
});
