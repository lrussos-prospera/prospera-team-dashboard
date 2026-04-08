const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  mockSheetCsv,
  failSheetCsv,
  mockSheetCsvSequence,
  mockSheetCsvBody,
} = require('./helpers/sheet-fixtures');

test.describe('dashboard browser harness fixtures', () => {
  test('manual qa fixture query param loads deterministic fixture without network route mocking', async ({
    page,
  }) => {
    await page.goto('/?qaFixture=all-blocked');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#summary .hero-pct')).toHaveText('0%');
    await expect(page.locator('#summary .hero-stat-value.status-blocked')).toHaveText('3');
    await expect(page.locator('#blocked-section')).toBeVisible();
    await expect(page.locator('#blocked-section .blocked-item')).toHaveCount(3);
    await expect(page.locator('#csv-date-label')).toContainText('Fixture:all-blocked');

    const qaFixtureDebug = await page.evaluate(() => window.__qaFixtureDebug);
    expect(qaFixtureDebug.enabled).toBe(true);
    expect(qaFixtureDebug.fixtureName).toBe('all-blocked');

    const eventTypes = qaFixtureDebug.events.map((event) => event.type);
    expect(eventTypes).toContain('fixture-selection');
    expect(eventTypes).toContain('fixture-fetch-start');
    expect(eventTypes).toContain('fixture-fetch-response');
    expect(eventTypes).toContain('fixture-fetch-success');
    expect(eventTypes).toContain('network-probe');

    const networkProbeEvent = qaFixtureDebug.events.find((event) => event.type === 'network-probe');
    expect(
      networkProbeEvent.details.resources.some((resource) =>
        resource.name.includes('/tests/fixtures/all-blocked.csv')
      )
    ).toBe(true);
  });

  test('all-blocked fixture renders risk-forward summary and blocked list', async ({ page }) => {
    await mockSheetCsv(page, 'all-blocked');

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#summary .hero-pct')).toHaveText('0%');
    await expect(page.locator('#summary .hero-stat-value.status-blocked')).toHaveText('3');
    await expect(page.locator('#blocked-section')).toBeVisible();
    await expect(page.locator('#blocked-section .blocked-item')).toHaveCount(3);
  });

  test('canonical-blocked fixture excludes generic at-risk rows from blocked surfaces', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'canonical-blocked-mixed');

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#summary [data-hook="summary-total"] .hero-stat-value')).toHaveText(
      '4'
    );
    await expect(
      page.locator('#summary [data-hook="summary-blocked"] .hero-stat-value')
    ).toHaveText('2');
    await expect(page.locator('#blocked-section')).toBeVisible();
    await expect(page.locator('#blocked-section .blocked-item')).toHaveCount(2);
    await expect(page.locator('#blocked-section')).toContainText('Ana Cruz');
    await expect(page.locator('#blocked-section')).toContainText('Mia Park');
    await expect(page.locator('#blocked-section')).not.toContainText('Leo Tan');
    await expect(page.locator('#blocked-section')).not.toContainText('Zoe Klein');
  });

  test('empty-goals fixture is deterministic and maps blanks into No Goal card', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'empty-goals');

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#goals-grid .goal-card')).toHaveCount(1);
    await expect(page.locator('#goals-grid .goal-title')).toHaveText('No Goal');
  });

  test('stale-data fixture can be loaded for recency edge-case scenarios', async ({ page }) => {
    await mockSheetCsv(page, 'stale-data');

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#result-count')).toContainText('Showing 3 updates');
    await expect(page.locator('#table-body')).toContainText('2025-12-28');
    await expect(page.locator('#table-body')).toContainText('2025-11-30');
  });

  test('fetch failure scenario shows in-place retry recovery affordance', async ({ page }) => {
    await failSheetCsv(page);

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeVisible();
    await expect(page.locator('#state-box')).toContainText(
      'Could not load data from Google Sheets.'
    );
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('retry clears error state and recovers loaded dashboard without URL changes', async ({
    page,
  }) => {
    await mockSheetCsvSequence(page, [
      { type: 'abort', errorCode: 'failed' },
      {
        type: 'fulfill',
        body: fs.readFileSync(path.join(__dirname, 'fixtures', 'all-blocked.csv'), 'utf8'),
      },
    ]);

    await page.goto('/');
    const urlBeforeRetry = page.url();

    await expect(page.locator('[data-hook="error-state"]')).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('[data-hook="summary"]')).toBeVisible();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
    await expect(page.url()).toBe(urlBeforeRetry);
  });

  test('no-data response is explicit and distinct from no-match states', async ({ page }) => {
    await mockSheetCsvBody(
      page,
      'Department,Team,Responsible,Topic,Status,Goal,Added/updated,Details,Notes\n'
    );

    await page.goto('/');

    await expect(page.locator('[data-hook="no-data-state"]')).toBeVisible();
    await expect(page.locator('[data-hook="no-data-state"]')).toContainText(
      'No usable update rows were returned from the source.'
    );
    await expect(page.locator('[data-hook="summary"]')).toBeHidden();
  });

  test('refresh preserves active narrowing state and does not reset recency from fetch time alone', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'stale-data');

    await page.goto('/');

    await page.locator('#filter-toggle').click();
    await page.locator('#filter-status').selectOption('doing');
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');

    const beforeLabel = await page.locator('#csv-date-label').innerText();
    await page.locator('#refresh-btn').click();

    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('2');
    await expect(page.locator('#filter-badge')).toHaveText('1');
    await expect(page.locator('#csv-date-label')).toContainText('stale');
    const afterLabel = await page.locator('#csv-date-label').innerText();
    expect(beforeLabel).toMatch(/stale/);
    expect(afterLabel).toMatch(/stale/);
  });

  test('no-match state shows recoverable reset affordance and retains scope context', async ({
    page,
  }) => {
    await mockSheetCsv(page, 'all-blocked');

    await page.goto('/');

    await page.locator('[data-hook="goal-card"][data-goal="Legal Framework"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#filter-person').selectOption('Mia Park');

    await expect(page.locator('[data-hook="no-results-state"]')).toBeVisible();
    await expect(page.locator('[data-hook="no-results-state"]')).toContainText(
      'No updates match your current scope, search, or filters.'
    );
    await expect(page.locator('[data-hook="no-results-scope-note"]')).toContainText(
      'Active scope: Legal Framework'
    );

    await page.locator('[data-hook="empty-reset-btn"]').click();

    await expect(page.locator('[data-hook="scope-indicator"]')).toBeHidden();
    await expect(page.locator('[data-hook="summary-total"] .hero-stat-value')).toHaveText('3');
  });
});

const LIVE_TERMINAL_STATE_TIMEOUT_MS = 25000;
const LIVE_TERMINAL_STATE_PATTERN = /^(loaded|error)$/;

async function waitForLiveTerminalState(page, message) {
  await expect
    .poll(
      async () => {
        const summaryVisible = await page.locator('#summary').isVisible();
        if (summaryVisible) {
          return 'loaded';
        }

        const hasErrorText = await page
          .locator('#state-box')
          .filter({ hasText: 'Could not load data from Google Sheets.' })
          .isVisible();
        if (hasErrorText) {
          return 'error';
        }

        return 'pending';
      },
      {
        timeout: LIVE_TERMINAL_STATE_TIMEOUT_MS,
        message,
      }
    )
    .toMatch(LIVE_TERMINAL_STATE_PATTERN);
}

test('live dashboard surface settles to loaded or explicit error state', async ({ page }) => {
  await page.goto('/');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await waitForLiveTerminalState(
        page,
        attempt === 0
          ? 'Dashboard did not settle into either loaded content or explicit error state in the initial window.'
          : 'Dashboard did not settle into either loaded content or explicit error state after one controlled reload fallback.'
      );
      return;
    } catch (error) {
      if (attempt === 0) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        continue;
      }

      throw error;
    }
  }
});
