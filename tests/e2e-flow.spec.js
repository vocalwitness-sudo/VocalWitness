// tests/e2e-flow.spec.js
import { test, expect } from '@playwright.test';

test.describe('VocalWitness E2E Integration Suite', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Paystack and NOWPayments initialization endpoints
        await page.route('**/paystack.co/transaction/**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: true, data: { reference: 'ref_mock_123', authorization_url: 'https://mock.paystack.co/pay' } })
            });
        });

        await page.route('**/api/v1/payment/nowpayments', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ payment_id: 'np_mock_987', payment_status: 'waiting' })
            });
        });

        // Load application homepage
        await page.goto('http://localhost:5173/');
    });

    test('Full E2E: Evidence Upload -> ZK Proof Generation -> Overage Payment Checkout', async ({ page }) => {
        // 1. Verify app state initialized
        await expect(page.locator('#app-root')).toBeVisible();

        // 2. Select a video evidence file
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#media-input-trigger');
        const fileChooser = await fileChooserPromise;

        // Attach mock video payload (28MB to trigger overage fee logic)
        const mockVideoBuffer = Buffer.alloc(28 * 1024 * 1024);
        await fileChooser.setFiles([{
            name: 'evidence-frontline.mp4',
            mimeType: 'video/mp4',
            buffer: mockVideoBuffer
        }]);

        // 3. Verify Media Quota Badge updates dynamically
        const badge = page.locator('#media-quota-badge');
        await expect(badge).toBeVisible();
        await expect(badge).toContainText('Overage Infrastructure Fee');

        // 4. Trigger ZK Proof Generation via snarkjs Web Worker
        const zkTriggerButton = page.locator('#generate-zk-proof-btn');
        if (await zkTriggerButton.isVisible()) {
            await zkTriggerButton.click();
            // Verify Web Worker message handling and progress indicator
            await expect(page.locator('#zk-spinner')).toBeVisible();
            await expect(page.locator('#zk-status-text')).toContainText('Proof generated successfully', { timeout: 30000 });
        }

        // 5. Submit Form & Trigger Payment Gateway Modal
        await page.click('#submit-post-btn');
        const paymentModal = page.locator('#overage-payment-modal');
        await expect(paymentModal).toBeVisible();

        // 6. Complete Payment Gateway Handshake
        await page.click('#paystack-checkout-btn');
        await expect(page.locator('.toast-success')).toContainText('Payment confirmed', { timeout: 10000 });

        // 7. Confirm Post Creation in Feed UI
        await expect(page.locator('.feed-card').first()).toBeVisible();
        await expect(page.locator('.feed-card').first()).toContainText('evidence-frontline.mp4');
    });

    test('Offline Resilience: Form enqueues locally when offline', async ({ page, context }) => {
        // Simulate device losing network connection
        await context.setOffline(true);

        const textContent = page.locator('#composer-text');
        await textContent.fill('Witness report captured during network outage');

        await page.click('#submit-post-btn');

        // Verify toast notification indicates local queueing
        const toast = page.locator('.toast-info');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('Saved offline. Will sync automatically.');

        // Reconnect and verify Background Sync triggers
        await context.setOffline(false);
        await expect(page.locator('.toast-success')).toContainText('Offline testimonies synced successfully!', { timeout: 15000 });
    });
});
