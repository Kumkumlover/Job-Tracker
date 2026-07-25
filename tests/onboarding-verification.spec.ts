import { test, expect } from '@playwright/test';

test.describe('Onboarding Modal & Live Verification Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock NextAuth session
    await page.route('/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Test Onboarder', email: 'onboard@example.com' },
          expires: '9999-12-31T23:59:59.999Z',
        }),
      });
    });
    await page.route('/api/auth/providers', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('/api/auth/csrf', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'mock-csrf' }) });
    });
  });

  test('Auto-triggers Onboarding Modal when critical API keys are missing and verifies them live', async ({ page }) => {
    // Mock GET /api/settings with missing geminiKey and serperKey
    await page.route('/api/settings', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            profile: {},
            apiKeys: {
              hunterKey: '',
              apolloKey: '',
              serperKey: '', // Missing core key
              geminiKey: '', // Missing core key
              tavilyKey: '',
              exaKey: '',
            },
          }),
        });
      } else if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock verification endpoint
    await page.route('/api/verify-keys', async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            gemini: { valid: true, message: 'Valid API Key' },
            serper: { valid: true, message: 'Valid API Key' },
            hunter: { valid: false, message: 'Invalid API Key' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock dashboard metrics/applications so page loads cleanly
    await page.route('/api/applications', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('/api/custom-properties', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('/api/custom-stages', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Clear localStorage to ensure clean onboarding state
    await page.addInitScript(() => window.localStorage.clear());

    // Navigate to dashboard
    await page.goto('/dashboard');

    // 1. Verify Onboarding Modal popped up automatically
    await expect(page.locator('h2:has-text("Welcome to Antigravity OS")')).toBeVisible();
    await expect(page.locator('text="Connect your API keys to unlock autonomous recruiting & outreach."')).toBeVisible();

    // 2. Input keys into the modal fields
    await page.fill('input[placeholder="Paste Google Gemini API Key..."]', 'test-valid-gemini-key');
    await page.fill('input[placeholder="Paste Serper.dev API Key..."]', 'test-valid-serper-key');
    await page.fill('input[placeholder="Paste Hunter.io API Key..."]', 'test-invalid-hunter-key');

    // 3. Click Verify Keys inside modal
    await page.click('button:has-text("Verify All Keys")');

    // 4. Check status badges rendered inside the modal
    await expect(page.locator('span:has-text("Valid")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Invalid API Key")')).toBeVisible();

    // 5. Click Save & Continue to dismiss modal
    await page.click('button:has-text("Save & Continue")');

    // 6. Verify modal closed
    await expect(page.locator('h2:has-text("Welcome to Antigravity OS")')).toBeHidden();
  });

  test('Settings page allows live verification of API keys with badges', async ({ page }) => {
    // Mock GET /api/settings with existing keys
    await page.route('/api/settings', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            profile: {},
            apiKeys: {
              hunterKey: 'existing_hunter',
              apolloKey: '',
              serperKey: 'existing_serper',
              geminiKey: 'existing_gemini',
              tavilyKey: '',
              exaKey: '',
            },
          }),
        });
      } else if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock verification endpoint
    await page.route('/api/verify-keys', async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            gemini: { valid: true, message: 'Valid API Key' },
            serper: { valid: false, message: 'Quota exceeded' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('/api/custom-properties', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('/api/custom-stages', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('/api/gmail/linked-accounts', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Navigate to Settings page
    await page.goto('/settings');

    // 1. Verify API Keys section is present
    await expect(page.locator('h2:has-text("External API Integrations")')).toBeVisible();

    // 2. Click "Verify Keys" button on settings page
    await page.click('button:has-text("Verify Keys")');

    // 3. Verify status badges are rendered right beside the field labels
    await expect(page.locator('span:has-text("Valid")')).toBeVisible();
    await expect(page.locator('span:has-text("Quota exceeded")')).toBeVisible();
    await expect(page.locator('text="Verification check completed!"')).toBeVisible();
  });
});
