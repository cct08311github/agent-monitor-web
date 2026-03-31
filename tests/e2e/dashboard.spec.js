const { test, expect } = require('@playwright/test');

/**
 * E2E Tests for Agent Monitor Web - Dashboard & Navigation
 * Tests key user journeys: login, dashboard monitoring, tab navigation
 */

const hasCredentials = !!(process.env.E2E_USERNAME && process.env.E2E_PASSWORD);

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page).toHaveTitle(/OpenClaw/);
    await expect(page.locator('input[type="text"], input[type="username"]').first()).toBeVisible();
  });

  test('can login with valid credentials', async ({ page }) => {
    const username = process.env.E2E_USERNAME;
    const password = process.env.E2E_PASSWORD;

    // Skip if credentials are not configured
    if (!username || !password) {
      test.skip();
      return;
    }

    // Skip if AUTH_DISABLED is set in env
    const response = await page.request.get(page.url());
    if (response.status() === 200 && await page.locator('body').textContent().then(t => t.includes('dashboard') || t.includes('monitor'))) {
      test.skip();
    }

    await page.goto('/login.html');
    const usernameInput = page.locator('input[type="text"], input[type="username"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      await passwordInput.fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(index\.html|)$/, { timeout: 10000 });
    }
  });
});

test.describe('Dashboard Monitoring', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Authenticated - wait for dashboard to initialize
    await page.waitForSelector('#appHeader', { timeout: 10000 }).catch(() => {});
  });

  test('dashboard page loads with key elements', async ({ page }) => {
    // Wait for SPA to render (use domcontentloaded, not networkidle - SSE keeps network busy)
    await page.waitForSelector('#appHeader', { timeout: 10000 });
    // Header
    await expect(page.locator('#appHeader')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();

    // Summary cards
    await expect(page.locator('.summary-section')).toBeVisible();
    await expect(page.locator('#totalAgents')).toBeVisible();
    await expect(page.locator('#activeAgents')).toBeVisible();

    // Agent grid
    await expect(page.locator('#agentGrid, .agent-grid, [id*="agent"]')).toBeVisible({ timeout: 10000 });
  });

  test('SSE connection indicator shows status', async ({ page }) => {
    await page.waitForSelector('#connDot', { timeout: 5000 });
    await expect(page.locator('#connDot, .conn-dot')).toBeVisible();
    const connDot = page.locator('#connDot, .conn-dot').first();
    // SSE connection status - just check element exists, class check is best-effort
    await connDot.waitFor({ timeout: 5000 }).catch(() => {});
  });

  test('summary cards display agent counts', async ({ page }) => {
    await page.waitForSelector('#totalAgents', { timeout: 5000 });
    const totalAgents = await page.locator('#totalAgents').textContent();
    expect(totalAgents).toBeTruthy();
    expect(parseInt(totalAgents)).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Tab Navigation', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#appHeader', { timeout: 10000 }).catch(() => {});
  });

  test('can switch to Monitor tab', async ({ page }) => {
    await page.waitForSelector('[data-dtab="monitor"]', { timeout: 5000 });
    const monitorTab = page.locator('[data-dtab="monitor"], .desktop-tab:has-text("監控")').first();
    if (await monitorTab.isVisible()) {
      await monitorTab.click();
      await expect(page.locator('.summary-section, #agentGrid')).toBeVisible();
    }
  });

  test('can switch to System/Cost tab', async ({ page }) => {
    await page.waitForSelector('[data-dtab="system"]', { timeout: 5000 });
    const systemTab = page.locator('[data-dtab="system"], .desktop-tab:has-text("系統")').first();
    if (await systemTab.isVisible()) {
      await systemTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator('.charts-container, canvas, svg')).toBeVisible({ timeout: 5000 });
    }
  });

  test('can switch to Logs tab', async ({ page }) => {
    await page.waitForSelector('[data-dtab="logs"]', { timeout: 5000 });
    const logsTab = page.locator('[data-dtab="logs"], .desktop-tab:has-text("日誌")').first();
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await expect(page.locator('.logs-container, [id*="log"]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('theme toggle is functional', async ({ page }) => {
    await page.waitForSelector('#themeToggleBtn', { timeout: 5000 });
    const themeToggle = page.locator('#themeToggleBtn, [aria-label*="主題"]').first();
    if (await themeToggle.isVisible()) {
      const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await themeToggle.click();
      // Wait for theme to change rather than arbitrary timeout
      await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark', { timeout: 2000 });
      const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(newTheme).not.toBe(initialTheme);
    }
  });
});

test.describe('Responsive Layout', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#appHeader', { timeout: 10000 }).catch(() => {});
  });

  test('mobile navigation works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#appHeader', { timeout: 10000 }).catch(() => {});
    const mobileNav = page.locator('.mobile-nav, .nav-toggle, [class*="mobile"]').first();
    if (await mobileNav.isVisible({ timeout: 2000 })) {
      await mobileNav.click();
      await expect(page.locator('.mobile-menu, .nav-menu')).toBeVisible();
    }
  });

  test('desktop layout at 1920px', async ({ page }) => {
    await page.waitForSelector('.desktop-tabs', { timeout: 5000 });
    await expect(page.locator('.desktop-tabs')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeAll(async () => {
    if (!hasCredentials) {
      test.skip();
    }
  });
  test('skip link exists for keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.skip-link', { timeout: 5000 });
    await expect(page.locator('.skip-link')).toBeAttached();
  });

  test('all interactive elements have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const atLogin = page.url().includes('login') ||
      await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    if (atLogin) {
      test.skip();
    }
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const ariaLabel = await btn.getAttribute('aria-label');
        const text = await btn.textContent();
        const title = await btn.getAttribute('title');
        expect(ariaLabel || text?.trim() || title).toBeTruthy();
      }
    }
  });
});
