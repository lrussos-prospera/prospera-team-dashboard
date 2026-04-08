const fs = require('node:fs');
const path = require('node:path');

const SHEET_ROUTE = /docs\.google\.com\/spreadsheets\/.*tqx=out:csv/;

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', `${name}.csv`), 'utf8');
}

async function mockSheetCsv(page, fixtureName) {
  const csv = readFixture(fixtureName);
  await page.route(SHEET_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body: csv,
    });
  });
}

async function failSheetCsv(page) {
  await page.route(SHEET_ROUTE, async (route) => {
    await route.abort('failed');
  });
}

async function mockSheetCsvSequence(page, sequence) {
  let index = 0;
  await page.route(SHEET_ROUTE, async (route) => {
    const step = sequence[Math.min(index, sequence.length - 1)];
    index += 1;

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

async function mockSheetCsvBody(page, body) {
  await page.route(SHEET_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body,
    });
  });
}

module.exports = {
  mockSheetCsv,
  failSheetCsv,
  mockSheetCsvSequence,
  mockSheetCsvBody,
};
