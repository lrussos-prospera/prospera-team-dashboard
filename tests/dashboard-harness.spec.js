const { test, expect } = require('@playwright/test');
const { mockSheetCsv, failSheetCsv } = require('./helpers/sheet-fixtures');

test.describe('dashboard browser harness fixtures', () => {
  test('all-blocked fixture renders risk-forward summary and blocked list', async ({ page }) => {
    await mockSheetCsv(page, 'all-blocked');

    await page.goto('/');

    await expect(page.locator('#state-box')).toBeHidden();
    await expect(page.locator('#summary .hero-pct')).toHaveText('0%');
    await expect(page.locator('#summary .hero-stat-value.status-blocked')).toHaveText('3');
    await expect(page.locator('#blocked-section')).toBeVisible();
    await expect(page.locator('#blocked-section .blocked-item')).toHaveCount(3);
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
});

async function waitForLiveTerminalState(page, timeout, message) {
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
        timeout,
        message,
      }
    )
    .toMatch(/^(loaded|error)$/);
}

test('live dashboard surface settles to loaded or explicit error state', async ({ page }) => {
  await page.goto('/');

  try {
    await waitForLiveTerminalState(
      page,
      25000,
      'Dashboard did not settle into either loaded content or explicit error state in the initial window.'
    );
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });

    await waitForLiveTerminalState(
      page,
      25000,
      'Dashboard did not settle into either loaded content or explicit error state after one controlled reload fallback.'
    );
  }
});
