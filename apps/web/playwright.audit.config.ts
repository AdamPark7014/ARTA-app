import { defineConfig, devices } from '@playwright/test';

/**
 * Recorrido de «cortes» (e2e/audit/cortes.audit.ts): no corre con la suite
 * normal. Necesita el panel servido en E2E_PORT (3100) con las mismas variables
 * que `playwright.config.ts`; si no hay servidor, lo construye y lo levanta.
 */
const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: './e2e/audit',
  testMatch: /.*\.audit\.ts$/,
  timeout: 30 * 60_000,
  fullyParallel: true,
  workers: Number(process.env.AUDIT_WORKERS || 4),
  reporter: [['list']],
  outputDir: './e2e/.output/audit',
  use: {
    launchOptions: {
      args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Motor de Safari (CI: .github/workflows/web-safari.yml). El tamaño y el modo
    // móvil los pone cada prueba en su contexto; aquí solo cambia el motor.
    ...(process.env.E2E_WEBKIT ? [{ name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: {} } }] : []),
  ],
  webServer: {
    command: process.env.E2E_PREBUILT ? 'npm run start:e2e' : 'npm run build && npm run start:e2e',
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: true,
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
