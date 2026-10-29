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

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Motor de Safari, a pedido: `E2E_WEBKIT=1 npx playwright test --project=webkit`.
    // Corre en CI en `.github/workflows/web-safari.yml` (docs/SAFARI.md), que
    // compara cada proyecto WebKit contra su par de Chromium. En Windows, lanzado
    // desde la app de escritorio de Claude, la política de integridad de código
    // bloquea las DLL sin firmar de Playwright WebKit; en macOS o Linux corre
    // (`npx playwright install --with-deps webkit`), pero ahí `arta.localhost`
    // tiene que resolver a 127.0.0.1 (/etc/hosts): la regla `--host-resolver-rules`
    // de arriba es solo de Chromium.
    ...(process.env.E2E_WEBKIT
      ? [
          { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: {} } },
          { name: 'webkit-iphone', use: { ...devices['iPhone 15'], launchOptions: {} } },
          // Línea base del iPhone: el mismo tamaño y UA, con el motor de Chrome.
          // Lo que falla aquí también no es de Safari, es de la pantalla chica.
          { name: 'chromium-iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' as const } },
        ]
      : []),
  ],

  webServer: {
    // E2E_PREBUILT=1: el .next ya está construido (CI lo construye en su paso).
    command: process.env.E2E_PREBUILT ? 'npm run start:e2e' : 'npm run build && npm run start:e2e',
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
