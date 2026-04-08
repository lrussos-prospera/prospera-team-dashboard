const { test, expect } = require('@playwright/test');
const { mockSheetCsv } = require('./helpers/sheet-fixtures');

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

  test('refresh preserves coherent narrowed state without duplicate blocked surface', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');
    await page.goto('/');

    await page.locator('[data-hook="table-group-header"][data-department="Governance"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#search').fill('permit');

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('1');
    await page.locator('#refresh-btn').click();

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

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-hook="table-row-summary"][aria-expanded="true"]')).toHaveCount(
      0
    );

    await page.locator('#filter-toggle').click();
    await expect(page.locator('#filter-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#filter-panel')).toBeHidden();
    await expect(page.locator('#filter-toggle')).toHaveAttribute('aria-expanded', 'false');
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
});
