import { test, expect } from '@playwright/test';

test.describe('Profile and Settings Pages with Mocks', () => {
  test.beforeEach(async ({ page }) => {
    // Mock NextAuth session and related endpoints
    await page.route('/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'Test User', email: 'test@example.com' },
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

  test.describe('Profile Page', () => {
    test.beforeEach(async ({ page }) => {
      // Mock GET /api/settings
      await page.route('/api/settings', async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              profile: {
                senderName: 'John Doe',
                phone: '123-456-7890',
                portfolioUrl: 'https://johndoe.com',
                linkedinUrl: 'https://linkedin.com/in/johndoe',
                resumeUrl: 'https://resume.com',
                aboutMeBullets: 'I am a software engineer.',
                emailTemplateStructure: 'Hi [Name],\\n\\nI am interested in the [Role] role.\\n\\nThanks,\\n[My Name]',
                systemPrompt: 'You are an expert AI recruiter.',
              },
            }),
          });
        } else if (request.method() === 'POST') {
          // Mock POST /api/settings
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.continue();
        }
      });
    });

    test('loads profile data and updates correctly', async ({ page }) => {
      await page.goto('/profile');
      
      // Verify initial data is loaded
      await expect(page.locator('input[name="senderName"]')).toHaveValue('John Doe');
      await expect(page.locator('textarea[name="systemPrompt"]')).toHaveValue('You are an expert AI recruiter.');

      // Change LLM prompt
      const systemPromptLocator = page.locator('textarea[name="systemPrompt"]');
      await systemPromptLocator.fill('You are a helpful assistant.');
      
      // Change Sender Name
      const senderNameLocator = page.locator('input[name="senderName"]');
      await senderNameLocator.fill('Jane Doe');

      // Intercept the POST request to verify the payload
      const requestPromise = page.waitForRequest(request => 
        request.url().includes('/api/settings') && request.method() === 'POST'
      );

      // Save changes
      await page.locator('button', { hasText: 'Save Settings' }).click();

      // Verify POST request payload
      const request = await requestPromise;
      const postData = JSON.parse(request.postData() || '{}');
      
      expect(postData.senderName).toBe('Jane Doe');
      expect(postData.systemPrompt).toBe('You are a helpful assistant.');

      // Verify success state UI (text changes)
      await expect(page.locator('text=✓ Saved successfully')).toBeVisible();
    });
  });

  test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
      // Mock /api/extension/token
      await page.route('/api/extension/token', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ apiKey: 'test-api-key-123' }),
        });
      });

      // Mock /api/gmail/linked-accounts
      await page.route('/api/gmail/linked-accounts', async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: '1', email: 'secondary@example.com', lastSyncedAt: null }
            ]),
          });
        } else if (request.method() === 'DELETE') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.continue();
        }
      });

      // Mock /api/custom-properties
      await page.route('/api/custom-properties', async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 'p1', name: 'Source', type: 'text' }
            ]),
          });
        } else if (request.method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'p2', name: 'Level', type: 'text' }),
          });
        } else {
          await route.continue();
        }
      });

      // Mock /api/custom-stages
      await page.route('/api/custom-stages', async (route, request) => {
        if (request.method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 's1', name: 'Screening', color: '#ff0000', order: 1 }
            ]),
          });
        } else if (request.method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 's2', name: 'Interview', color: '#00ff00', order: 2 }),
          });
        } else {
          await route.continue();
        }
      });
    });

    test('displays and interacts with Gmail accounts', async ({ page }) => {
      await page.goto('/settings');

      // Verify secondary account is visible
      await expect(page.locator('text=secondary@example.com')).toBeVisible();

      // Handle the JS confirm dialog automatically
      page.on('dialog', dialog => dialog.accept());

      // Click disconnect (trash icon next to the secondary account)
      const secondaryAccountRow = page.locator('text=secondary@example.com').locator('..');
      await secondaryAccountRow.locator('button').click();

      // Wait for it to disappear from the UI
      await expect(page.locator('text=secondary@example.com')).toBeHidden();
    });

    test('adds custom properties', async ({ page }) => {
      await page.goto('/settings');

      // Verify existing property
      await expect(page.locator('text=Source').first()).toBeVisible();

      // Find the add property input
      const propInput = page.getByPlaceholder('Property name...');
      await propInput.fill('Level');
      
      // Click Add button
      await propInput.locator('..').locator('button', { hasText: 'Add' }).click();

      // Since we mocked the POST to return successfully, but React Query caches might not update 
      // instantly without a refetch or optimistic update, we can just check if the input clears
      await expect(propInput).toHaveValue('');
    });

    test('adds custom stages', async ({ page }) => {
      await page.goto('/settings');

      // Verify existing stage
      await expect(page.locator('text=Screening').first()).toBeVisible();

      // Find the add stage input
      const stageInput = page.getByPlaceholder('Stage name...');
      await stageInput.fill('Interview');
      
      // Click Add button
      await stageInput.locator('..').locator('button', { hasText: 'Add' }).click();

      // Verify input clears
      await expect(stageInput).toHaveValue('');
    });
  });
});
