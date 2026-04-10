const { test, expect } = require('@playwright/test');
const {
  mockSheetCsv,
  mockHistoryCsv,
  mockHistoryCsvBody,
  failHistoryCsv,
} = require('./helpers/sheet-fixtures');

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

  test('contextual filters scope the hero stats and blocked callout', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework?status=blocked');

    const statValues = page.locator('.drilldown-stats .drilldown-stat-value');
    await expect(page.locator('.drilldown-progress-pct')).toContainText('0%');
    await expect(statValues.nth(1)).toHaveText('0');
    await expect(statValues.nth(3)).toHaveText('1');
    await expect(statValues.nth(4)).toHaveText('1');
    await expect(page.locator('[data-hook="drilldown-departments"] .drilldown-chip')).toHaveCount(
      1
    );
    await expect(
      page.locator('[data-hook="drilldown-blocked"] .drilldown-blocked-item')
    ).toHaveCount(1);
  });

  test('expanding drilldown rows updates aria-expanded and collapses the prior row', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/goal/Legal+Framework');

    const rows = page.locator('[data-hook="drilldown-row"]');
    const details = page.locator('[data-hook="drilldown-row-detail"]');

    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(details.nth(0)).toHaveClass(/expand-row-open/);

    await rows.nth(1).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(details.nth(0)).not.toHaveClass(/expand-row-open/);
    await expect(details.nth(1)).toHaveClass(/expand-row-open/);
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

  test('contextual filters scope the hero stats and people list', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance?status=blocked');

    const statValues = page.locator('.drilldown-stats .drilldown-stat-value');
    await expect(statValues.nth(0)).toHaveText('0%');
    await expect(statValues.nth(3)).toHaveText('1');
    await expect(statValues.nth(4)).toHaveText('1');
    await expect(page.locator('[data-hook="drilldown-teams"]')).toHaveCount(0);
    await expect(page.locator('[data-hook="drilldown-people"] .drilldown-person-row')).toHaveCount(
      1
    );
    await expect(page.locator('[data-hook="drilldown-people"]')).toContainText('Ana Cruz');
    await expect(page.locator('[data-hook="drilldown-people"]')).not.toContainText('Leo Tan');
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

  test('contextual filters scope the hero stats and goal chips', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz?status=blocked');

    const statValues = page.locator('.drilldown-stats .drilldown-stat-value');
    await expect(statValues.nth(0)).toHaveText('0%');
    await expect(statValues.nth(3)).toHaveText('1');
    await expect(statValues.nth(4)).toHaveText('1');
    await expect(page.locator('[data-hook="drilldown-goals"] .drilldown-chip')).toHaveCount(1);
    await expect(page.locator('[data-hook="drilldown-goals"]')).toContainText('Legal Framework');
    await expect(page.locator('[data-hook="drilldown-goals"]')).not.toContainText('Infrastructure');
  });

  test('detail panel keeps notes visible and preserves single expanded row', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/employee/Ana+Cruz');

    const rows = page.locator('[data-hook="drilldown-row"]');
    const details = page.locator('[data-hook="drilldown-row-detail"]');

    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(details.nth(0)).toContainText('Escalated');
    await expect(details.nth(0)).toHaveClass(/expand-row-open/);

    await rows.nth(1).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(details.nth(0)).not.toHaveClass(/expand-row-open/);
    await expect(details.nth(1)).toHaveClass(/expand-row-open/);
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

test.describe('trends drilldown view', () => {
  test('shows overall completion and blocked chart containers', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('.drilldown-title')).toHaveText('Performance Trends');
    await expect(page.locator('.trends-chart-card')).toHaveCount(2);
    await expect(page.locator('.trends-chart-card').first()).toBeVisible();
  });

  test('shows goal small multiples', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('#trends-goals-grid .trends-small-card')).toHaveCount(2);
  });

  test('shows department small multiples', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('#trends-depts-grid .trends-small-card')).toHaveCount(2);
  });

  test('clicking goal chart navigates to goal drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await page.locator('#trends-goals-grid .trends-small-card').first().click();
    await expect(page).toHaveURL(/#\/goal\//);
  });

  test('clicking department chart navigates to department drilldown', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await page.locator('#trends-depts-grid .trends-small-card').first().click();
    await expect(page).toHaveURL(/#\/department\//);
  });

  test('empty state when no history data', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    // History aborted by default
    await page.goto('/#/trends');
    await expect(page.locator('.trends-empty-state')).toBeVisible();
  });

  test('delayed history failure rerenders explicit unavailable trends state', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await failHistoryCsv(page, { delayMs: 350 });

    await page.goto('/#/trends');

    await expect(page.locator('.drilldown-subtitle')).toHaveText('Loading history data…');
    await page.waitForFunction(() => window.appState?.history?.status === 'error');
    await expect(page.locator('.drilldown-subtitle')).toHaveText('History data unavailable');
    await expect(page.locator('.trends-empty-state')).toContainText('Could not load history data.');
  });

  test('breadcrumb shows Overview > Trends', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('.drilldown-breadcrumb-list')).toContainText('Overview');
    await expect(page.locator('.drilldown-breadcrumb-list')).toContainText('Trends');
  });

  test('header route nav trends link navigates to #/trends', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/');
    await page.locator('[data-hook="header-route-trends"]').click();
    await expect(page).toHaveURL(/#\/trends/);
  });

  test('Escape key returns to overview from trends', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/trends');
    await expect(page.locator('.drilldown-title')).toHaveText('Performance Trends');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/#\/$/);
  });
});

test.describe('drilldown trend panels', () => {
  test('goal drilldown shows always-open trend section', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/goal/Legal+Framework');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('[data-hook="trend-panel-shell"]')).toBeVisible();
    await expect(page.locator('[data-hook="trend-panel-title"]')).toHaveText('Trends');
  });

  test('trend section shows visible charts without interaction', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/goal/Legal+Framework');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('[data-hook="trend-panel-shell"]')).toBeVisible();
    await expect(page.locator('.trend-panel-period .period-toggle')).toBeVisible();
    await page.locator('.trend-panel-period').getByRole('radio', { name: '1M' }).click();
    await expect(page.locator('.trend-panel-chart')).toHaveCount(2);
  });

  test('department drilldown shows trend panel', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/department/Governance');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('[data-hook="trend-panel-shell"]')).toBeVisible();
  });

  test('employee drilldown shows trend panel', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/employee/Ana+Cruz');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('[data-hook="trend-panel-shell"]')).toBeVisible();
  });

  test('trend panel hidden when no history data', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    // History aborted by default
    await page.goto('/#/goal/Legal+Framework');
    await expect(page.locator('.drilldown-title')).toHaveText('Legal Framework');
    await expect(page.locator('[data-hook="trend-panel-shell"]')).toHaveCount(0);
  });

  test('delta badge on goal drilldown hero', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/goal/Legal+Framework');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');
    await expect(page.locator('.drilldown-hero-card .delta-badge').first()).toBeVisible();
  });

  test('zero-only goal history shows explicit empty chart state instead of blank cards', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsvBody(
      page,
      [
        'Timestamp,Level,Entity,Total,Done,Doing,Blocked,Pct',
        '2026-04-08T20:42:02.991Z,overall,—,20,4,16,0,20',
        '2026-04-08T20:42:02.991Z,goal,Legal Framework,3,0,3,0,0',
        '2026-04-10T20:06:13.222Z,overall,—,20,5,15,0,25',
        '2026-04-10T20:06:13.222Z,goal,Legal Framework,3,0,3,0,0',
      ].join('\n')
    );

    await page.goto('/#/goal/Legal+Framework');
    await page.waitForFunction(() => window.appState?.history?.status === 'loaded');

    const emptyStates = page.locator('.trend-panel-chart .trend-panel-empty');
    await expect(emptyStates).toHaveCount(2);
    await expect(emptyStates.nth(0)).toContainText(
      'No completed items recorded for this period yet.'
    );
    await expect(emptyStates.nth(1)).toContainText('No blocked items recorded for this period.');
  });
});

test.describe('header route nav', () => {
  test('shows route links and jump menus on drilldowns', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await page.goto('/#/department/Governance');

    await expect(page.locator('[data-hook="header-route-overview"]')).toBeVisible();
    await expect(page.locator('[data-hook="header-route-trends"]')).toBeVisible();
    await expect(page.locator('[data-hook="header-route-select-goal"]')).toBeVisible();
    await expect(page.locator('[data-hook="header-route-select-department"]')).toHaveValue(
      'Governance'
    );
    await expect(page.locator('[data-hook="header-route-select-employee"]')).toBeVisible();
  });

  test('jump menus let you move directly between drilldowns', async ({ page }) => {
    await mockSheetCsv(page, 'drilldown-mixed');
    await mockHistoryCsv(page, 'history-mixed');
    await page.goto('/#/department/Governance');

    await page.locator('[data-hook="header-route-select-goal"]').selectOption('Infrastructure');
    await expect(page).toHaveURL(/#\/goal\/Infrastructure/);
    await expect(page.locator('.drilldown-title')).toHaveText('Infrastructure');

    await page.locator('[data-hook="header-route-select-employee"]').selectOption('Mia Park');
    await expect(page).toHaveURL(/#\/employee\/Mia\+Park/);
    await expect(page.locator('.drilldown-title')).toHaveText('Mia Park');

    await page.locator('[data-hook="header-route-trends"]').click();
    await expect(page).toHaveURL(/#\/trends/);
  });
});
