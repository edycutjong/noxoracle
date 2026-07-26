import { test, expect } from '@playwright/test';

/**
 * Core user journey (demo mode, no wallet): compose a private bet on the
 * market page, then walk the epoch commit → reveal toggle. These verify the
 * confidential-bet UI works end-to-end without ever signing a transaction.
 */

test.describe('private bet slip (market page)', () => {
  test('a bet becomes two sealed handles, one an encrypted zero', async ({ page }) => {
    await page.goto('/');

    // The market always advertises the dual-handle invariant.
    await expect(page.getByText(/one is an encrypted zero/i)).toBeVisible();

    // Choose a side and enter a size — direction never leaves plaintext on-chain.
    // (The side buttons render lowercase text styled uppercase via CSS.)
    await page.getByRole('button', { name: 'yes', exact: true }).click();
    const amount = page.getByRole('textbox').first();
    await amount.fill('750');
    await expect(amount).toHaveValue('750');

    // Commit privately -> the sealed-handles panel confirms the commit.
    await page.getByRole('button', { name: /Commit privately/i }).click();
    await expect(page.getByText(/two sealed handles.*committed/i)).toBeVisible();

    // Both YES and NO sealed pills exist regardless of chosen side.
    await expect(page.getByText('YES')).not.toHaveCount(0);
    await expect(page.getByText('NO')).not.toHaveCount(0);
  });

  test('non-numeric input is sanitised in the amount field', async ({ page }) => {
    await page.goto('/');
    const amount = page.getByRole('textbox').first();
    await amount.fill('abc12x3');
    await expect(amount).toHaveValue('123');
  });
});

test.describe('epoch reveal', () => {
  test('closing the epoch toggles aggregate reveal', async ({ page }) => {
    await page.goto('/epoch');

    const reveal = page.getByRole('button', { name: /Close epoch/i });
    await expect(reveal).toBeVisible();
    await reveal.click();

    // After closing, the control flips to a re-seal action.
    await expect(page.getByRole('button', { name: /Re-seal aggregates/i })).toBeVisible();
  });
});

test.describe('verify dashboard', () => {
  test('recomputes invariants from chain data (verify-epoch)', async ({ page }) => {
    await page.goto('/verify');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Verify/i);
    // The command a judge can reproduce is surfaced verbatim.
    await expect(page.getByText(/verify-epoch 1/i).first()).toBeVisible();
  });
});
