import { test, expect } from '@playwright/test';

test.describe('PIN proveedor /v/', () => {
  test('página vendor responde (smoke)', async ({ page }) => {
    const res = await page.goto('/v/demo-pin-smoke');
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
