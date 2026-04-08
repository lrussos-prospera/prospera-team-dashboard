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

module.exports = {
  mockSheetCsv,
  failSheetCsv,
};
