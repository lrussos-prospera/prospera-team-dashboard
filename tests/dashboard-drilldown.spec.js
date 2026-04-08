const { test, expect } = require('@playwright/test');
const { mockSheetCsv } = require('./helpers/sheet-fixtures');

test.describe('goal drilldown view', () => {
  test('shows filtered summary and table for the goal', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');
    await expect(page.locator('.drilldown-progress-pct')).toContainText('%');
    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(3);
  });

  test('hero zone shows contributing departments', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    const depts = page.locator('[data-hook="drilldown-departments"] .drilldown-chip');
    await expect(depts).toHaveCount(2);
    await expect(depts.first()).toContainText('Governance');
    await expect(depts.last()).toContainText('Operations');
  });

  test('hero zone shows blocked items with person names', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    const blocked = page.locator('[data-hook="drilldown-blocked"]');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('Ana Cruz');
    await expect(blocked.locator('.drilldown-person-link')).toHaveCount(1);
  });

  test('back link returns to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    await page.locator('.drilldown-breadcrumb-list a').first().click();
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('.drilldown-view')).toBeHidden();
  });

  test('browser back button works', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');

    await page.goBack();
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
  });

  test('invalid goal redirects to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Nonexistent+Goal');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('.drilldown-view')).toBeHidden();
  });

  test('breadcrumb shows correct path', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    const crumbs = page.locator('.drilldown-breadcrumb-list li');
    await expect(crumbs).toHaveCount(2);
    await expect(crumbs.first()).toContainText('Overview');
    await expect(crumbs.last()).toContainText('Legal Framework');
  });

  test('contextual status filter narrows table', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework?status=blocked');

    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="drilldown-row"]')).toContainText('Ana Cruz');
  });
});
