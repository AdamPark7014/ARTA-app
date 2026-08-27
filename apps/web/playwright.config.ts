import { defineConfig, devices } from '@playwright/test';

/**
 * E2E del panel web.
 *
 * Los specs corren contra el build real de Next (middleware incluido) y
 * mockean la capa `/api/*` con `page.route`, de modo que NO hacen falta ni
 * Postgres ni el workspace `api` levantados. El objetivo es blindar el shell,
 * el gate de sesión del middleware y el flujo de login con 2FA — que es donde
 * vive el rediseño de UI.
 *
 * Host: `arta.localhost` mapea a la entidad ARTA en `lib/domains.ts`, así que
 * el middleware aplica el gate de panel igual que en producción.
 */
const PORT = Number(process.env.E2E_PORT || 3100);
const HOST = process.env.E2E_HOST || 'arta.localhost';

export const E2E_ORIGIN = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: './e2e/.output',

  use: {
    baseURL: E2E_ORIGIN,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Chromium resuelve *.localhost a loopback por sí solo, pero lo forzamos
    // para no depender del resolver del SO (Windows no siempre colabora).
    launchOptions: {
      args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build && npm run start:e2e',
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      E2E_PORT: String(PORT),
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000',
      NEXT_PUBLIC_ROOT_DOMAIN: 'artaproducciones.com',
      NEXT_PUBLIC_ARTA_HOST: 'arta.artaproducciones.com',
      NEXT_PUBLIC_AUDITORIO_HOST: 'auditorio.artaproducciones.com',
    },
  },
});
