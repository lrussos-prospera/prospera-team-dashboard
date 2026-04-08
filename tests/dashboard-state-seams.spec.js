const { test, expect } = require('@playwright/test');
const { getFixtureCsv, mockSheetCsv, mockSheetCsvSequence } = require('./helpers/sheet-fixtures');

test.describe('dashboard state and render seams', () => {
  test('loaded dashboard exposes stable hooks for summary, controls, scope, blocked, and rows', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('[data-hook="goal-cards"]')).toBeVisible();
    await expect(page.locator('[data-hook="controls"]')).toBeVisible();
    await expect(page.locator('[data-hook="blocked-section"]')).toBeVisible();
    await expect(page.locator('[data-hook="result-count"]')).toContainText('Showing 3 updates');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
  });

  test('goal cards and blocked section count only canonical blocked status, not generic at-risk labels', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'canonical-blocked-mixed');
    await page.goto('/');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('4');
    await expect(page.locator('[data-hook="summary-blocked"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(2);

    const legalGoal = page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]');
    await expect(legalGoal).toContainText('Blocked: Ana Cruz');
    await expect(legalGoal).not.toContainText('Leo Tan');

    const infraGoal = page.locator('[data-hook="goal-card"][data-goal="Infrastructure"]');
    await expect(infraGoal).toContainText('Blocked: Mia Park');
    await expect(infraGoal).not.toContainText('Zoe Klein');
  });

  test('goal scope updates summary, blocked section, and table together with a visible dismissible scope indicator', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();

    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to goal: Legal Framework'
    );
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(2);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(2);

    await page.locator('#scope-clear-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(3);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
  });

  test('narrowed states preserve full goal-card frame with empty non-scopable goals', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('#filter-toggle').click();
    await page.locator('#filter-goal').selectOption('Legal Framework');

    const goals = page.locator('[data-hook="goal-card"]');
    await expect(goals).toHaveCount(2);

    const emptyGoal = page.locator('[data-hook="goal-card"][data-goal="Infrastructure"]');
    await expect(emptyGoal).toContainText('No updates in current view');
    await expect(emptyGoal).toContainText('0 / 0 DONE');
    await expect(emptyGoal).toHaveAttribute('aria-disabled', 'true');

    await expect(
      page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]')
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('empty scoped goal card becomes non-interactive after narrowing to zero and scope can be dismissed via controls', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();

    await page.locator('#filter-toggle').click();
    await page.locator('#filter-person').selectOption('Mia Park');

    const scopedGoalCard = page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]');
    await expect(scopedGoalCard).toContainText('0 / 0 DONE');
    await expect(scopedGoalCard).toContainText('No updates in current view');
    await expect(scopedGoalCard).toHaveAttribute('aria-disabled', 'true');

    await scopedGoalCard.click({ force: true });
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to goal: Legal Framework'
    );

    await page.locator('#scope-clear-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
  });

  test('page freshness follows same stale basis as visible goal cards in mixed-recency overview', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'mixed-recency');
    await page.goto('/');

    const headerLabel = page.locator('#csv-date-label');
    await expect(headerLabel).toContainText('stale');
    await expect(headerLabel).not.toContainText('current');
    await expect(headerLabel).not.toContainText('update date unavailable');

    await expect(page.locator('[data-hook="goal-card"][data-goal="Compliance"]')).toContainText(
      'Stale (> 7d)'
    );
    await expect(
      page.locator('[data-hook="goal-card"][data-goal="Operations"] [data-hook="goal-stale"]')
    ).toHaveCount(0);
  });

  test('department filter cascades team options and combined filters apply conjunctively', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('#filter-toggle').click();

    const teamValuesBefore = await page
      .locator('#filter-team option')
      .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
    expect(teamValuesBefore).toEqual(expect.arrayContaining(['Policy', 'Infrastructure']));

    await page.locator('#filter-dept').selectOption('Governance');

    const teamValuesAfter = await page
      .locator('#filter-team option')
      .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
    expect(teamValuesAfter).toEqual(['Policy']);

    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toContainText('Permit backlog');
  });

  test('department header click scopes detail in place, supports reset, and keeps URL stable', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    const urlBefore = page.url();

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();

    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to department: Governance'
    );
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(2);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(2);
    await expect(page).toHaveURL(urlBefore);

    await page.locator('#reset-btn').click();

    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(3);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
    await expect(page).toHaveURL(urlBefore);
  });

  test('department scope plus search plus reset returns to overview coherently', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);

    await page.locator('#reset-btn').click();

    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(3);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
  });

  test('cross-area scope plus search plus reset keeps blocked surfaces tied to canonical blocked rows', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'canonical-blocked-mixed');
    await page.goto('/');

    await expect(page.locator('[data-hook="summary-blocked"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(2);

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="summary-blocked"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="blocked-section"]')).toContainText('Ana Cruz');
    await expect(page.locator('[data-hook="blocked-section"]')).not.toContainText('Leo Tan');

    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('risk watch');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="summary-blocked"] .hero-stat-value')).toHaveText('0');
    await expect(page.locator('[data-hook="blocked-section"]')).toBeHidden();
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);

    await page.locator('#reset-btn').click();

    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('4');
    await expect(page.locator('[data-hook="summary-blocked"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(2);
  });

  test('refresh preserves coherent narrowed state without duplicate blocked surface', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');

    const loadState = page.locator('[data-hook="loading-state"]');
    const summary = page.locator('[data-hook="summary"]');
    const tableRows = page.locator('[data-hook="table-row-summary"]');
    await page.locator('#refresh-btn').click();

    await expect(loadState).toBeVisible();
    await expect(summary).toBeHidden();

    await expect(tableRows).toHaveCount(1);
    await expect(summary).toBeVisible();
    await expect(loadState).toBeHidden();
    await expect(page.locator('[data-hook="error-state"]')).toHaveCount(0);

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to department: Governance'
    );
    await expect(page.locator('[data-hook="blocked-section"]')).toBeVisible();
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="blocked-section"] .blocked-list')).toHaveCount(1);
  });

  test('refresh restores visible non-search filter control values from active state', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('#filter-toggle').click();
    await page.locator('#filter-dept').selectOption('Governance');
    await page.locator('#filter-team').selectOption('Policy');
    await page.locator('#filter-person').selectOption('Ana Cruz');
    await page.locator('#filter-status').selectOption('blocked');
    await page.locator('#filter-goal').selectOption('Legal Framework');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('#filter-badge')).toHaveText('5');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);

    await page.locator('#refresh-btn').click();

    await expect(page.locator('#filter-dept')).toHaveValue('Governance');
    await expect(page.locator('#filter-team')).toHaveValue('Policy');
    await expect(page.locator('#filter-person')).toHaveValue('Ana Cruz');
    await expect(page.locator('#filter-status')).toHaveValue('blocked');
    await expect(page.locator('#filter-goal')).toHaveValue('Legal Framework');
    await expect(page.locator('#filter-badge')).toHaveText('5');
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
  });

  test('refresh during narrowed state settles atomically without lingering loading state', async ({
    page,
  }) => {
    const allBlockedCsv = getFixtureCsv('all-blocked');
    await mockSheetCsvSequence(page, [
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'fulfill',
        delayMs: 250,
        body: allBlockedCsv,
      },
    ]);

    await page.goto('/');

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to department: Governance'
    );

    const loadingState = page.locator('[data-hook="loading-state"]');
    await page.locator('#refresh-btn').click();

    await expect(loadingState).toBeVisible();
    await expect(page.locator('[data-hook="summary"]')).toBeHidden();

    await expect(loadingState).toBeHidden();
    await expect(page.locator('[data-hook="error-state"]')).toHaveCount(0);
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('#search')).toHaveValue('permit');
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to department: Governance'
    );
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="blocked-section"] .blocked-list')).toHaveCount(1);
  });

  test('refresh failure surfaces error state without misleading stale content overlay', async ({
    page,
  }) => {
    const allBlockedCsv = getFixtureCsv('all-blocked');
    await mockSheetCsvSequence(page, [
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'abort',
      },
    ]);

    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to goal: Legal Framework'
    );
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');

    await page.locator('#refresh-btn').click();

    await expect(page.locator('[data-hook="error-state"]')).toBeVisible();
    await expect(page.locator('[data-hook="loading-state"]')).toHaveCount(0);
    await expect(page.locator('[data-hook="summary"]')).toBeHidden();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="blocked-section"]')).toBeHidden();
    await expect(page.locator('[data-hook="detail-table"]')).toBeHidden();
  });

  test('retry after refresh failure recovers to coherent loaded narrowed state with no lingering status UI', async ({
    page,
  }) => {
    const allBlockedCsv = getFixtureCsv('all-blocked');
    await mockSheetCsvSequence(page, [
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'abort',
      },
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
    ]);

    await page.goto('/');

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');

    await page.locator('#refresh-btn').click();
    await expect(page.locator('[data-hook="error-state"]')).toBeVisible();

    await page.locator('[data-hook="retry-btn"]').click();

    await expect(page.locator('[data-hook="loading-state"]')).toHaveCount(0);
    await expect(page.locator('[data-hook="error-state"]')).toHaveCount(0);
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await expect(page.locator('#scope-indicator-text')).toContainText(
      'Scoped to department: Governance'
    );
    await expect(page.locator('#search')).toHaveValue('permit');
    await expect(page.locator('[data-hook="blocked-item"]')).toHaveCount(1);
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
  });

  test('table expansion keeps one expanded detail row at a time', async ({ page }) => {
    await mockSheetCsv(page, 'stale-data');
    await page.goto('/');

    const rows = page.locator('[data-hook="table-row-summary"]');
    await rows.nth(0).click();

    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      1
    );

    await rows.nth(1).click();
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      1
    );
  });

  test('keyboard supports slash focus, row toggles, arrow navigation, and escape unwind priority', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();

    const rows = page.locator('[data-hook="table-row-summary"]');
    await rows.nth(0).focus();
    await page.keyboard.press('Enter');
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();

    await page.keyboard.press(' ');
    await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(0)).toBeFocused();

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();

    await page.locator('[data-hook="table-row-summary"]').first().click();
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      1
    );

    await page.locator('#filter-toggle').click();
    await expect(page.locator('#filter-panel')).toBeVisible();

    await page.locator('#search').focus();
    await expect(page.locator('#search')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      1
    );
    await expect(page.locator('#filter-panel')).toBeVisible();

    await page.locator('#search').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      0
    );
    await expect(page.locator('#filter-panel')).toBeVisible();

    await page.locator('#filter-status').focus();
    await expect(page.locator('#filter-status')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#filter-panel')).toBeVisible();
    await expect(page.locator('#filter-status')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#filter-panel')).toBeHidden();
    await expect(page.locator('#filter-toggle')).toHaveAttribute('aria-expanded', 'false');

    await page.locator('#filter-toggle').click();
    await expect(page.locator('#filter-panel')).toBeVisible();

    await page.locator('#filter-status').click();
    await expect(page.locator('#filter-status')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#filter-panel')).toBeVisible();
    await expect(page.locator('#filter-status')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#filter-panel')).toBeHidden();
    await expect(page.locator('#filter-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('escape unwind keeps expansion bound to the same row after scope clears', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'escape-unwind-derived-ui');
    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Infrastructure"]').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toContainText('Infrastructure');

    const scopedRow = page.locator('[data-hook="table-row-summary"]', {
      hasText: 'Follow-up permits',
    });
    await scopedRow.click();
    await expect(scopedRow).toHaveAttribute('aria-expanded', 'true');

    await page.locator('#filter-toggle').click();
    await expect(page.locator('#filter-panel')).toBeVisible();
    await page.locator('#search').focus();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      1
    );
    await expect(
      page.locator('[data-hook="table-row-summary"][aria-expanded="true"] .td-topic')
    ).toHaveText('Follow-up permits');
    await expect(page.locator('#filter-panel')).toBeVisible();
  });

  test('reduced motion mode preserves interaction behavior', async ({ page }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const firstRow = page.locator('[data-hook="table-row-summary"]').first();
    await firstRow.focus();
    await page.keyboard.press('Enter');
    await expect(firstRow).toHaveAttribute('aria-expanded', 'true');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
  });

  test('mobile layout preserves hidden table info through expansion and keeps scoped flow in-page', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('.hero-stats')).toHaveCSS('flex-direction', 'column');
    await expect(page.locator('.goals-grid')).toHaveCSS('grid-template-columns', '366px');

    const firstRow = page.locator('[data-hook="table-row-summary"]').first();
    await firstRow.click();

    await expect(firstRow.locator('.td-goal')).toBeHidden();
    await expect(firstRow.locator('.td-date')).toBeHidden();

    const detail = page
      .locator('[data-hook="table-row-detail"]')
      .filter({ hasText: 'Team' })
      .first();
    await expect(detail).toContainText('Goal');
    await expect(detail).toContainText('Updated');

    const initialUrl = page.url();
    await page.locator('[data-hook="table-group-header"]').first().click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeVisible();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);
    await page.locator('#reset-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page).toHaveURL(initialUrl);
  });

  test('full single-page exploration path preserves URL while scope expand search and reset interact', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    const initialUrl = page.url();

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toContainText('Legal Framework');

    const rows = page.locator('[data-hook="table-row-summary"]');
    await rows.first().click();
    await expect(rows.first()).toHaveAttribute('aria-expanded', 'true');

    await page.locator('#search').fill('permit');
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(1);

    await page.locator('#reset-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="table-row-summary"]')).toHaveCount(3);
    await expect(page).toHaveURL(initialUrl);
  });

  test('dashboard interactions do not create intra-app history entries beyond pre-entry navigation', async ({
    page,
  }) => {
    const allBlockedCsv = getFixtureCsv('all-blocked');
    await mockSheetCsvSequence(page, [
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'abort',
      },
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
      {
        type: 'fulfill',
        body: allBlockedCsv,
      },
    ]);

    await page.goto('/?history-seed=pre-entry');
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();

    const marker = `history-marker-${Date.now()}`;
    await page.evaluate((value) => {
      window.history.replaceState({ marker: value }, '', window.location.href);
    }, marker);

    const baseline = await page.evaluate(() => ({
      href: window.location.href,
      length: window.history.length,
      marker: window.history.state?.marker ?? null,
    }));

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');
    await page.locator('[data-hook="table-row-summary"]').first().click();

    await page.locator('#refresh-btn').click();
    await expect(page.locator('[data-hook="error-state"]')).toBeVisible();
    await page.locator('[data-hook="retry-btn"]').click();
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();

    await page.locator('#reset-btn').click();
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();

    const afterInteractions = await page.evaluate(() => ({
      href: window.location.href,
      length: window.history.length,
      marker: window.history.state?.marker ?? null,
    }));

    expect(afterInteractions.length).toBe(baseline.length);
    expect(afterInteractions.marker).toBe(marker);
    expect(afterInteractions.href).toBe(baseline.href);

    await page.goBack();
    await expect(page).toHaveURL(/history-seed=pre-entry/);

    await page.goForward();
    await expect(page).toHaveURL(baseline.href);
  });
});
