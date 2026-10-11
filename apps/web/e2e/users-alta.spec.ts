import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';

import { mockAuthenticatedApi, seedSession, TEST_USER } from './support/mock-api';

/**
 * ARTA y Auditorio (docs/entidades-arta-auditorio.md, 11-10-2026): dirección adjunta da de alta
 * gente nueva (`users.create`) pero no edita, cambia de rol ni da de baja a nadie que ya exista
 * (`users.manage`, solo dirección general). Solo reparte las entidades que ella tiene.
 */
const ADJUNTA = {
  ...TEST_USER,
  id: 'usr-e2e-adj',
  fullName: 'Leida Osorio',
  roleKey: 'dir_adjunta',
  entities: ['ARTA'] as Array<'ARTA' | 'EXPLANADA'>,
  permissions: [],
};

const TEAM = [
  {
    id: 'usr-e2e-logi',
    email: 'beto@arta.test',
    fullName: 'Beto Sandoval',
    title: 'Logística',
    roleKey: 'logistica',
    entities: ['ARTA'],
    permissions: [],
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'usr-e2e-aud',
    email: 'rodrigo@arta.test',
    fullName: 'Rodrigo Auditorio',
    title: 'Auditorio',
    roleKey: 'dir_adjunta',
    entities: ['EXPLANADA'],
    permissions: [],
    active: true,
    lastLoginAt: null,
  },
];

const ROLES = [
  { key: 'dir_adjunta', label: 'Dirección adjunta', defaultEntities: ['ARTA', 'EXPLANADA'] },
  { key: 'logistica', label: 'Logística', defaultEntities: ['ARTA', 'EXPLANADA'] },
];

test.describe('Usuarios · alta por dirección adjunta', () => {
  test('da de alta en sus entidades sin poder editar a nadie', async ({ page, baseURL }) => {
    const posted: Array<Record<string, unknown>> = [];

    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, {
      '/auth/me': { user: ADJUNTA },
      '/users': (route: Route) => {
        if (route.request().method() === 'POST') {
          const body = JSON.parse(route.request().postData() || '{}');
          posted.push(body);
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ email: body.email, fullName: body.fullName, reactivated: false }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEAM) });
      },
      '/users/roles': ROLES,
      '/users/permissions/catalog': [],
    });

    await page.goto('/users');

    await expect(
      page.getByText('Puedes dar de alta gente nueva; para editar o dar de baja a alguien, pídeselo a dirección general.'),
    ).toBeVisible();

    // Ve a su equipo, pero solo de lectura: ni editar, ni reactivar, ni dar de baja, ni invitar.
    await expect(page.getByText('Beto Sandoval')).toBeVisible();
    await expect(page.getByText('Rodrigo Auditorio')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Invitar por correo' })).toHaveCount(0);

    // Solo reparte Arta (la suya), aunque el rol traiga Arta + Auditorio por defecto.
    await expect(page.getByRole('checkbox', { name: 'Arta', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Auditorio', exact: true })).toHaveCount(0);

    await page.getByLabel('Nombre completo', { exact: true }).fill('Ana Nueva');
    await page.getByLabel('Correo', { exact: true }).fill('ana.nueva@arta.test');
    await page.getByRole('button', { name: 'Crear usuario' }).click();

    await expect(page.getByText('Usuario creado: entrégale su correo y contraseña')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      fullName: 'Ana Nueva',
      email: 'ana.nueva@arta.test',
      roleKey: 'logistica',
      entities: ['ARTA'],
    });
  });

  test('dirección adjunta ve Usuarios en el menú', async ({ page, baseURL }) => {
    await seedSession(page, baseURL!);
    await mockAuthenticatedApi(page, { '/auth/me': { user: ADJUNTA } });

    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Módulos del panel' });
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(1);
  });
});
