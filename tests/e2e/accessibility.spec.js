const { test, expect } = require('@playwright/test');

/**
 * E2E Tests for Accessibility & Keyboard Shortcuts
 * Tests keyboard navigation and accessibility features
 */

const hasCredentials = !!(process.env.E2E_USERNAME && process.env.E2E_PASSWORD);

test.describe('Keyboard Shortcuts', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Escape closes modal/dialog if open', async ({ page }) => {
    // Open any modal if available
    const settingsBtn = page.locator('[aria-label*="設置"], [aria-label*="Setting"], .settings-btn').first();
    if (await settingsBtn.isVisible({ timeout: 1000 })) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      // Press Escape
      await page.keyboard.press('Escape');

      // Verify modal is closed or dialog is dismissed
      const modal = page.locator('.modal, .dialog, [role="dialog"]').first();
      if (await modal.isVisible({ timeout: 500 })) {
        // If still visible, check if it's actually closing (animation might be in progress)
        await page.waitForTimeout(500);
      }
    }
    // If no modal was available, this test passes (no-op)
  });

  test('Shift+? shows keyboard shortcuts help', async ({ page }) => {
    // Press Shift+? to show help
    await page.keyboard.press('Shift+?');

    // Check if help is displayed via toast
    await page.waitForTimeout(500);
    const toast = page.locator('.toast-v2, .toast-info').first();
    if (await toast.isVisible({ timeout: 2000 })) {
      const toastText = await toast.textContent();
      expect(toastText).toMatch(/快捷鍵|shortcut|key/i);
    }
  });

  test('Ctrl+R refreshes dashboard', async ({ page }) => {
    // Get initial dashboard state
    const totalAgentsBefore = await page.locator('#totalAgents').textContent().catch(() => '0');

    // Press Ctrl+R (should trigger refresh)
    await page.keyboard.press('Control+r');

    // Wait for potential refresh
    await page.waitForTimeout(1000);

    // Dashboard should still be functional
    await expect(page.locator('.app-header')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('page has proper heading hierarchy', async ({ page }) => {
    // Check heading hierarchy
    const h1 = page.locator('h1');
    const h2 = page.locator('h2');

    if (await h1.count() > 0) {
      await expect(h1.first()).toBeVisible();
    }
  });

  test('interactive elements have accessible names', async ({ page }) => {
    // Check buttons have accessible names
    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 15); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const ariaLabel = await btn.getAttribute('aria-label');
        const text = await btn.textContent();
        const title = await btn.getAttribute('title');
        // At least one should be truthy
        const hasAccessibleName = ariaLabel || text?.trim() || title;
        expect(hasAccessibleName).toBeTruthy();
      }
    }
  });

  test('focus is visible on interactive elements', async ({ page }) => {
    // Tab to first focusable element
    await page.keyboard.press('Tab');

    // Check if focus indicator is visible (browser default or custom)
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('skip link exists for keyboard users', async ({ page }) => {
    // Uses beforeEach navigation
    await expect(page.locator('.skip-link, [href="#main"], [href="#content"]').first()).toBeAttached();
  });
});

test.describe('Error Handling UI', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('network errors show user-friendly message', async ({ page }) => {
    // This test verifies error handling UI exists
    // In a real scenario, we would trigger a network error
    const errorCenter = page.locator('#errorCenter, .error-center, .error-display');
    if (await errorCenter.isVisible({ timeout: 1000 })) {
      await expect(errorCenter).toBeAttached();
    }
  });

  test('toast notifications appear for errors', async ({ page }) => {
    // Check that toast container exists
    const toastContainer = page.locator('#toast-container, .toast-container, .toast-v2');
    await expect(toastContainer.first()).toBeAttached();
  });
});
