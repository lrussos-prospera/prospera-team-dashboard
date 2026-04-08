const { test, expect } = require('@playwright/test');
const { mockSheetCsv } = require('./helpers/sheet-fixtures');

test.describe('dashboard state and render seams', () => {
  test('loaded dashboard exposes stable hooks for summary, controls, scope, blocked, and rows', async ({ page }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('[data-hook="goal-cards"]')).toBeVisible();
    await expect(page.locator('[data-hook="controls"]')).toBeVisible();
    await expect(page.locator('[data-hook="blocked-section"]')).toBeVisible();
    await expect(page.locator('[data-hook="result-count"]')).toContainText('Showing 3 updates');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
  });

  test('goal scope toggles deterministic scope indicator and narrows summary/table', async ({ page }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();

    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await expect(page.locator('#scope-indicator-text')).toContainText('Scoped to goal: Legal Framework');
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(2);

    await page.locator('#scope-clear-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
  });

  test('table expansion keeps one expanded detail row at a time', async ({ page }) => {
    await mockSheetCsv(page, 'stale-data');
    await page.goto('/');

    const rows = page.locator('[data-hook="table-row-summary"]');
    await rows.nth(0).click();

    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(1);

    await rows.nth(1).click();
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(1);
  });
});
