import { test, expect } from '@playwright/test';

/**
 * Smoke test: the app must boot with NO wallet and NO env vars.
 * Every public route renders confidential-market UI from demo fixtures.
 */

const ROUTES = [
  { path: '/', heading: /Bet what you know/i },
  { path: '/position', heading: /Your position/i },
  { path: '/epoch', heading: /Epoch #1/i },
  { path: '/verify', heading: /Verify/i },
];

test.describe('demo mode — loads without API keys or wallet', () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} renders its primary heading`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);

      // Global nav is present on every route.
      await expect(page.getByRole('link', { name: 'NoxOracle' })).toBeVisible();

      // Ignore benign wallet/provider noise; fail on real page errors.
      const fatal = consoleErrors.filter(
        (e) => !/wallet|provider|injected|connector|hydrat|Download the React DevTools/i.test(e)
      );
      expect(fatal, `console errors on ${path}: ${fatal.join('\n')}`).toHaveLength(0);
    });
  }

  test('home page exposes correct document title and meta description', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NoxOracle/i);
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    expect(description ?? '').toMatch(/Gnosis Conditional-Tokens/i);
  });

  test('open graph + twitter card meta tags are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    );
  });
});
