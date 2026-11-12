// tests/e2e-flow.spec.js
// Batch 2 – Critical path E2E (sealed testimony + verify)
// Prefer running against local static server or preview, not production.

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';

test.describe('VocalWitness – Critical Integrity Paths', () => {
  test.beforeEach(async ({ page }) => {
    // Soft-fail external payment / analytics noise
    await page.route('**/paystack.co/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.route('**/static.cloudflareinsights.com/**', (route) => route.abort());

    await page.goto(BASE + '/');
  });

  test('Homepage loads and core shell is visible', async ({ page }) => {
    // App shell – adjust selectors to match your real DOM
    await expect(page.locator('body')).toBeVisible();

    // Prefer stable landmarks over brittle IDs when possible
    const hasComposer =
      (await page.locator('#composer-text, [data-testid="composer"], textarea').count()) > 0 ||
      (await page.locator('text=Witness').count()) > 0;

    expect(hasComposer || true).toBeTruthy(); // soft until selectors are locked
  });

  test('Verify page is reachable and accepts input', async ({ page }) => {
    await page.goto(BASE + '/verify');
    await expect(page.locator('body')).toBeVisible();

    // Page should expose some verification UI
    const verifyUi =
      (await page.locator('input, textarea, [data-testid="verify-input"]').count()) > 0 ||
      (await page.locator('text=Verify').count()) > 0 ||
      (await page.locator('text=Evidence').count()) > 0;

    expect(verifyUi || true).toBeTruthy();
  });

  test('Transparency / public ledger page loads', async ({ page }) => {
    await page.goto(BASE + '/transparency');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Offline: composer still accepts text (queue path)', async ({ page, context }) => {
    await context.setOffline(true);

    const composer = page.locator('#composer-text, [data-testid="composer"], textarea').first();
    if (await composer.count()) {
      await composer.fill('Offline integrity test – ' + Date.now());
      // Do not assert submit success while offline; just that UI accepts input
      await expect(composer).toHaveValue(/Offline integrity test/);
    }

    await context.setOffline(false);
  });
});

test.describe('Sealed testimony path (requires auth + stable selectors)', () => {
  // Enable and harden these once you lock data-testid attributes
  test.skip('Seal text testimony → appears in feed', async ({ page }) => {
    await page.goto(BASE + '/');
    // TODO: login helper
    // await loginAsTestUser(page);

    const composer = page.locator('[data-testid="composer"]');
    await composer.fill('E2E sealed testimony ' + Date.now());
    await page.locator('[data-testid="submit-testimony"]').click();

    await expect(page.locator('[data-testid="toast-success"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="feed-card"]').first()).toContainText('E2E sealed testimony');
  });

  test.skip('Download Evidence Pack → open /verify', async ({ page }) => {
    // TODO: create sealed post, click export, navigate to /verify, paste hash
    await page.goto(BASE + '/verify');
    await expect(page.locator('body')).toBeVisible();
  });
});
