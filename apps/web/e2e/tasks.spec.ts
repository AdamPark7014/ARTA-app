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
    const asked: string[] = [];
    const recorded = (body: unknown) => (route: Route) => {
      asked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    };

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/users/directory': recorded(TEST_DIRECTORY),
      '/tasks/mine': recorded([]),
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
      '/tasks/requested': recorded([]),
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
    // Sin evento: es una petición de apoyo entre compañeros, de la entidad activa (arta.* → ARTA).
    expect(posted[0].eventId).toBeUndefined();
    expect(posted[0].entity).toBe('ARTA');

    // ARTA y Auditorio separados: la lista y el directorio se piden de la entidad activa.
    const lists = asked.filter((u) => /\/tasks\/(mine|requested)/.test(u));
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((u) => new URL(u).searchParams.get('entity') === 'ARTA')).toBe(true);
    const directory = asked.filter((u) => u.includes('/users/directory'));
    expect(directory.length).toBeGreaterThan(0);
    expect(directory.every((u) => new URL(u).searchParams.get('entity') === 'ARTA')).toBe(true);
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
    const counted: string[] = [];
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/notifications/unread-count': (route: Route) => {
        counted.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 2 }) });
      },
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
    // El contador es de la entidad activa (más los avisos sin entidad).
    expect(counted.length).toBeGreaterThan(0);
    expect(counted.every((u) => new URL(u).searchParams.get('entity') === 'ARTA')).toBe(true);
  });
});
