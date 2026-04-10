const fs = require('node:fs');
const path = require('node:path');

const SHEET_ROUTE = /docs\.google\.com\/spreadsheets\/.*gid=1636341361/;
const HISTORY_ROUTE = /docs\.google\.com\/spreadsheets\/.*gid=2128123437/;

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', `${name}.csv`), 'utf8');
}

function getFixtureCsv(name) {
  return readFixture(name);
}

async function abortHistoryByDefault(page) {
  await page.route(HISTORY_ROUTE, async (route) => {
    await route.abort('failed');
  });
}

async function mockSheetCsv(page, fixtureName) {
  const csv = readFixture(fixtureName);
  await abortHistoryByDefault(page);
  await page.route(SHEET_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body: csv,
    });
  });
}

async function failSheetCsv(page) {
  await abortHistoryByDefault(page);
  await page.route(SHEET_ROUTE, async (route) => {
    await route.abort('failed');
  });
}

async function mockSheetCsvSequence(page, sequence) {
  let index = 0;
  await abortHistoryByDefault(page);
  await page.route(SHEET_ROUTE, async (route) => {
    const step = sequence[Math.min(index, sequence.length - 1)];
    index += 1;

    if (step.delayMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, step.delayMs);
      });
    }

    if (step.type === 'abort') {
      await route.abort(step.errorCode || 'failed');
      return;
    }

    await route.fulfill({
      status: step.status || 200,
      contentType: 'text/csv; charset=utf-8',
      body: step.body || '',
    });
  });
}

async function mockHistoryCsv(page, fixtureName, options = {}) {
  const csv = readFixture(fixtureName);
  await page.route(HISTORY_ROUTE, async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body: csv,
    });
  });
}

async function mockHistoryCsvBody(page, body, options = {}) {
  await page.route(HISTORY_ROUTE, async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body,
    });
  });
}

async function failHistoryCsv(page, options = {}) {
  await page.route(HISTORY_ROUTE, async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }
    await route.abort('failed');
  });
}

async function mockSheetCsvBody(page, body) {
  await abortHistoryByDefault(page);
  await page.route(SHEET_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body,
    });
  });
}

module.exports = {
  getFixtureCsv,
  mockSheetCsv,
  failSheetCsv,
  mockSheetCsvSequence,
  mockSheetCsvBody,
  mockHistoryCsv,
  mockHistoryCsvBody,
  failHistoryCsv,
};
