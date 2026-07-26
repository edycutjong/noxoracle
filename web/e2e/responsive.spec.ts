import { test, expect } from '@playwright/test';

/**
 * Layout integrity across mobile / tablet / desktop. No horizontal overflow,
 * header stays within the viewport, and the primary heading is visible.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const ROUTES = ['/', '/position', '/epoch', '/verify'];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal overflow`, async ({ page }) => {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth
        );
        // Allow a 1px rounding tolerance.
        expect(scrollWidth).toBeLessThanOrEqual(vp.width + 1);
      });
    }

    test('header brand link stays within the viewport', async ({ page }) => {
      await page.goto('/');
      const brand = page.getByRole('link', { name: 'NoxOracle' });
      await expect(brand).toBeVisible();
      const box = await brand.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
      }
    });
  });
}
