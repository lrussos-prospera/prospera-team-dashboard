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

test.describe('department drilldown view', () => {
  test('shows filtered summary and table for the department', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance');

    await expect(page.locator('.drilldown-title')).toHaveText('Governance');
    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(3);
  });

  test('hero zone shows per-team breakdown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance');

    const teams = page.locator('[data-hook="drilldown-teams"] .drilldown-team-card');
    await expect(teams).toHaveCount(2);
  });

  test('hero zone shows per-person rows with links', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance');

    const people = page.locator('[data-hook="drilldown-people"] .drilldown-person-link');
    await expect(people).toHaveCount(2);
    await expect(people.first()).toContainText('Ana Cruz');
  });

  test('clicking person name navigates to employee drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance');

    await page.locator('[data-hook="drilldown-people"] .drilldown-person-link').first().click();
    await expect(page.locator('.drilldown-title')).toHaveText('Ana Cruz');
  });

  test('invalid department redirects to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Nonexistent');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
  });

  test('contextual team filter narrows table', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance?team=Policy');

    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(2);
  });
});

test.describe('employee drilldown view', () => {
  test('shows filtered summary and table for the person', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    await expect(page.locator('.drilldown-title')).toHaveText('Ana Cruz');
    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(2);
  });

  test('hero zone shows department and team context', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    await expect(page.locator('.drilldown-subtitle')).toContainText('Governance');
  });

  test('hero zone shows goal distribution with links', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    const goals = page.locator('[data-hook="drilldown-goals"] .drilldown-chip');
    await expect(goals).toHaveCount(2);
  });

  test('breadcrumb includes department level', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    const crumbs = page.locator('.drilldown-breadcrumb-list li');
    await expect(crumbs).toHaveCount(3);
    await expect(crumbs.nth(0)).toContainText('Overview');
    await expect(crumbs.nth(1)).toContainText('Governance');
    await expect(crumbs.nth(2)).toContainText('Ana Cruz');
  });

  test('clicking department in breadcrumb navigates to department drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    await page.locator('.drilldown-breadcrumb-list a').nth(1).click();
    // Navigates to department drilldown
    await expect(page.locator('.drilldown-title')).toHaveText('Governance');
  });

  test('invalid person redirects to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Nobody');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
  });

  test('contextual status filter narrows table', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz?status=blocked');

    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(1);
  });
});

test.describe('overview navigation to drilldowns', () => {
  test('clicking goal card navigates to goal drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');
  });

  test('clicking employee name in table navigates to employee drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await page.locator('[data-hook="person-link"]').first().click();
    await expect(page.locator('.drilldown-title')).toBeVisible();
    await expect(page.locator('.drilldown-view')).toBeVisible();
  });

  test('clicking employee name in blocked section navigates to employee drilldown', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await page.locator('[data-hook="blocked-person-link"]').first().click();
    await expect(page.locator('.drilldown-title')).toBeVisible();
  });
});

test.describe('recent activity section', () => {
  test('shows 5 most recent items sorted by date descending', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await expect(page.locator('[data-hook="recent-activity"]')).toBeVisible();
    const items = page.locator('[data-hook="activity-item"]');
    await expect(items).toHaveCount(5);
  });

  test('person names are clickable to employee drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await page.locator('[data-hook="activity-person-link"]').first().click();
    await expect(page.locator('.drilldown-title')).toBeVisible();
  });

  test('hidden on drilldown views', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    await expect(page.locator('[data-hook="recent-activity"]')).toBeHidden();
  });

  test('respects active filters', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');

    await page.locator('#filter-toggle').click();
    await page.locator('#filter-status').selectOption('blocked');

    const items = page.locator('[data-hook="activity-item"]');
    await expect(items).toHaveCount(2);
  });
});

test.describe('drilldown edge cases', () => {
  test('Escape key on drilldown navigates back to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');
    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('.drilldown-view')).toBeHidden();
  });

  test('direct URL to drilldown loads correctly on first visit', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    // Go directly to drilldown without visiting overview first
    await page.goto('/#/employee/Mia+Park');
    await expect(page.locator('.drilldown-title')).toHaveText('Mia Park');
    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(2);
  });

  test('navigating between drilldowns updates view without overview flash', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');
    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');

    // Navigate to a different drilldown directly
    await page.evaluate(() => {
      window.location.hash = '#/department/Operations';
    });
    await expect(page.locator('.drilldown-title')).toHaveText('Operations');
    // Overview sections should NOT have flashed visible
    await expect(page.locator('[data-hook="summary"]')).toBeHidden();
  });

  test('drilldown hides all overview-only sections', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    await expect(page.locator('[data-hook="summary"]')).toBeHidden();
    await expect(page.locator('#goals-section')).toBeHidden();
    await expect(page.locator('#dept-strip')).toBeHidden();
    await expect(page.locator('#controls')).toBeHidden();
    await expect(page.locator('[data-hook="recent-activity"]')).toBeHidden();
  });

  test('filter state persists in URL hash', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework?status=blocked');

    // Verify filter is applied
    await expect(page.locator('[data-hook="drilldown-row"]')).toHaveCount(1);

    // Check that URL still contains the filter
    const url = page.url();
    expect(url).toContain('status=blocked');
  });

  test('invalid route redirects to overview', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/invalid/something');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('.drilldown-view')).toBeHidden();
  });
});
