// tests/e2e-flow.spec.js
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';

test.describe('VocalWitness – Critical Integrity Paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/paystack.co/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.route('**/static.cloudflareinsights.com/**', (route) => route.abort());
    await page.goto(BASE + '/');
  });

  test('Homepage loads and composer is present', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByTestId('composer')).toBeVisible({ timeout: 15000 });
  });

  test('Verify page is reachable', async ({ page }) => {
    await page.goto(BASE + '/verify');
    await expect(page.getByTestId('verify-input')).toBeVisible({ timeout: 10000 });
  });

  test('Offline: composer still accepts text', async ({ page, context }) => {
    await context.setOffline(true);
    const composer = page.getByTestId('composer');
    await composer.fill('Offline integrity test – ' + Date.now());
    await expect(composer).toHaveValue(/Offline integrity test/);
    await context.setOffline(false);
  });
});

// Keep the sealed path skipped until you have a test login helper
test.describe('Sealed testimony path', () => {
  test.skip('Seal text testimony → success UI → Evidence Pack button', async ({ page }) => {
    await page.goto(BASE + '/');
    // TODO: await loginAsTestUser(page);

    await page.getByTestId('composer').fill('E2E sealed testimony ' + Date.now());
    await page.getByTestId('submit-testimony').click();

    // Success can appear as toast or the publish-success block
    await expect(
      page.getByTestId('toast-success').or(page.getByTestId('publish-success'))
    ).toBeVisible({ timeout: 25000 });

    await expect(page.getByTestId('download-evidence-pack').first()).toBeVisible({ timeout: 10000 });
  });
});
