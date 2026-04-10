# History & Trends UI — Implementation Plan

> **Design decisions:** Resolved via grill-me interview (2026-04-08)
> **Branch:** `redesign/frontend-overhaul`
> **Depends on:** History tab in Google Sheet (GID `2128123437`), Apps Script already collecting snapshots

**Goal:** Surface historical performance data across every view in the dashboard — delta badges on the overview, trend indicators on goal cards, collapsible trend panels on drilldowns, and a dedicated `#/trends` deep-dive view — so leadership can answer "are things getting better?" without leaving the page.

**Constraint:** Vanilla JS, no build tools, Frappe Charts loaded via CDN, GitHub Pages deployment.

---

## Context for the Implementer

### What exists today

A Google Apps Script captures dashboard metrics to a "History" tab on each sheet edit (10-minute debounce). Current schema is one row per goal per snapshot: `Timestamp, Total, Done, Doing, Blocked, Completion %, Goal, Goal Total, Goal Done, Goal Blocked, Goal %`. The dashboard does not read from this tab yet.

The dashboard has three source files (`index.html`, `styles.css`, `app.js` — 4063 lines total). It fetches from the Updates tab via `SHEET_URL` (GID `1636341361`). Routing is hash-based (`#/goal/<name>`, `#/department/<name>`, `#/employee/<name>`). `renderApp()` at `app.js:1556` is the top-level render dispatcher. `appState` at `app.js:6` holds all state.

### What it should become

Six surfaces for trend data:

1. **Hero zone delta badges** — "+5% ↑ this week" next to the completion percentage
2. **Goal card trend arrows** — delta badge with directional arrow on each goal card
3. **Trends drilldown** — `#/trends` with Frappe Charts (overall + blocked hero charts, small multiples for goals and departments)
4. **Goal drilldown trend panel** — collapsible section with completion + blocked trendlines
5. **Department drilldown trend panel** — collapsible section with completion + per-team + workload trends
6. **Employee drilldown trend panel** — collapsible section with completion + throughput + blocked trends

### Key design decisions (from grill-me)

| Decision                 | Choice                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| History tab schema       | Single tab, `Level`/`Entity` discriminator — rows for `overall`, `goal`, `department`, `employee` |
| Charting library         | Frappe Charts (~17KB, SVG-based, CDN)                                                             |
| Delta timeframe          | Configurable: `1W \| 1M \| 3M` segmented toggle                                                   |
| Period toggle scope      | Route-local (stored as `?period=` in the URL hash; resets to `1w` when navigating away)           |
| Period persistence       | Default `1w`, encode in URL only when changed (`?period=3m`)                                      |
| Goal card indicator      | Delta badge + directional arrow (↑/↓/→)                                                           |
| Trends drilldown layout  | Hybrid: overall + blocked as hero charts, small multiples for goals + departments                 |
| Drilldown trend panels   | Collapsible, between hero zone and filters. Session-persistent open/close via `sessionStorage`.   |
| Chart interactivity      | Small multiples clickable → entity drilldown (only entities that exist in live data)              |
| Fetch timing             | Parallel with main data fetch                                                                     |
| Empty state handling     | Hide deltas when < 2 snapshots, show helpful messages, never misleading numbers                   |
| Schema migration         | One-time backfill to reshape existing rows (grouped by timestamp to avoid duplication)            |
| Navigation to `#/trends` | Header link + hero zone contextual link                                                           |

---

## Task 1: Expand Google Apps Script + Backfill Migration

**Parallel:** no
**Blocked by:** none (this is the data prerequisite)
**Owned files:** Google Apps Script in the spreadsheet (not in this repo)

### What to build

Expand the existing `onSheetEdit` Apps Script to snapshot department-level and person-level stats alongside the existing overall/goal stats. Migrate the History tab to the new schema.

### New History tab schema

| Column    | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| Timestamp | ISO 8601 datetime                                                |
| Level     | `overall` \| `goal` \| `department` \| `employee`                |
| Entity    | Entity name (goal name, dept name, person name), `—` for overall |
| Total     | Item count                                                       |
| Done      | Done count                                                       |
| Doing     | In-progress count                                                |
| Blocked   | Blocked count                                                    |
| Pct       | Completion percentage (integer)                                  |

### Script changes

**1. Update the snapshot function** to produce rows at four levels:

```js
function captureSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const updates = ss.getSheetByName('Updates');
  const history = ss.getSheetByName('History');
  const data = updates.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).filter((row) => row.some((cell) => cell !== ''));

  const now = new Date().toISOString();
  const snapshotRows = [];

  // Parse rows
  const parsed = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    obj._status = normalizeStatus(obj['Status']);
    return obj;
  });

  // Overall
  const overall = deriveSummary(parsed);
  snapshotRows.push([
    now,
    'overall',
    '—',
    overall.total,
    overall.done,
    overall.doing,
    overall.blocked,
    overall.pct,
  ]);

  // Per goal
  const goals = deriveGoalBuckets(parsed);
  goals.forEach((g) => {
    snapshotRows.push([now, 'goal', g.goal, g.total, g.done, g.doing, g.blocked, g.pct]);
  });

  // Per department
  const deptMap = {};
  parsed.forEach((r) => {
    const dept = r['Department'] || 'Other';
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(r);
  });
  Object.entries(deptMap).forEach(([dept, deptRows]) => {
    const s = deriveSummary(deptRows);
    snapshotRows.push([now, 'department', dept, s.total, s.done, s.doing, s.blocked, s.pct]);
  });

  // Per employee
  const personMap = {};
  parsed.forEach((r) => {
    const person = r['Responsible'] || 'Unknown';
    if (!personMap[person]) personMap[person] = [];
    personMap[person].push(r);
  });
  Object.entries(personMap).forEach(([person, personRows]) => {
    const s = deriveSummary(personRows);
    snapshotRows.push([now, 'employee', person, s.total, s.done, s.doing, s.blocked, s.pct]);
  });

  // Write all rows at once
  history.getRange(history.getLastRow() + 1, 1, snapshotRows.length, 8).setValues(snapshotRows);
}
```

**2. Update History tab headers** — first row should be: `Timestamp, Level, Entity, Total, Done, Doing, Blocked, Pct`

**3. Write backfill migration function:**

```js
function migrateHistoryToNewSchema() {
  // Read old rows, reshape to new format, write back
  // Old format: Timestamp, Total, Done, Doing, Blocked, Completion %, Goal, Goal Total, Goal Done, Goal Blocked, Goal %
  // New format: Timestamp, Level, Entity, Total, Done, Doing, Blocked, Pct
  //
  // IMPORTANT: Group old rows by Timestamp first!
  // The old format has one row per goal per snapshot, so N goals = N rows sharing
  // the same timestamp. Emit ONE overall row per unique timestamp (using the
  // overall columns: Total, Done, Doing, Blocked, Completion %), then one goal
  // row per original row (using Goal columns: Goal, Goal Total, Goal Done, Goal Blocked, Goal %).
  // Do NOT emit one overall row per old row — that would create N duplicates.
  //
  // Department and employee rows cannot be backfilled from the old format
  // (that data wasn't captured). Those trends will start from zero — handled
  // by the dashboard's empty-state design.
}
```

Run `migrateHistoryToNewSchema()` once manually from the Apps Script editor, then delete it.

### Verification

- Open History tab, confirm new snapshots appear with `Level` and `Entity` columns
- Confirm old data is reshaped (overall + goal rows preserved)
- Confirm department and employee rows appear on next edit

### Commit

This is script-only (in Google Sheets, not in this repo). No git commit needed.

---

## Task 2: History Data Fetch Infrastructure + Frappe Charts CDN

**Parallel:** no
**Blocked by:** Task 1 (History tab must have data in new schema)
**Owned files:** `app.js` (new `HISTORY_URL`, `fetchHistoryData`, `parseHistoryCSV`, `appState.history`), `index.html` (Frappe Charts CDN script tag)

### What to build

Add a second fetch that loads the History tab CSV in parallel with the main data fetch. Parse it into a structured lookup object. Add Frappe Charts `<script>` to `index.html`.

### Implementation

**1. Add `HISTORY_URL` constant** at `app.js:3` (after `SHEET_URL`):

```js
const HISTORY_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=2128123437';
```

**2. Add history state** to `appState` at `app.js:6` (after `route`):

```js
history: {
  raw: [],           // All parsed history rows
  byLevel: {},       // { overall: [...], goal: {...}, department: {...}, employee: {...} }
  status: 'idle',    // 'idle' | 'loading' | 'loaded' | 'error'
},
```

**Note on `trendPanelOpen`:** This is NOT stored in `appState` — it uses `sessionStorage.getItem('trendPanelOpen')` so it survives page reloads within a session but resets when the browser tab closes. Read/write via helpers:

```js
function isTrendPanelOpen() {
  return sessionStorage.getItem('trendPanelOpen') === 'true';
}
function setTrendPanelOpen(open) {
  sessionStorage.setItem('trendPanelOpen', String(open));
}
```

**3. Write `parseHistoryCSV(text)`** — uses existing `parseCSV()` then normalizes:

```js
function parseHistoryCSV(text) {
  const rows = parseCSV(text);
  return rows
    .map((row) => ({
      timestamp: new Date(row['Timestamp']),
      level: (row['Level'] || '').toLowerCase(),
      entity: row['Entity'] || '—',
      total: parseInt(row['Total'], 10) || 0,
      done: parseInt(row['Done'], 10) || 0,
      doing: parseInt(row['Doing'], 10) || 0,
      blocked: parseInt(row['Blocked'], 10) || 0,
      pct: parseInt(row['Pct'], 10) || 0,
    }))
    .filter((row) => row.level && !isNaN(row.timestamp.getTime()));
}
```

**4. Write `indexHistoryData(rows)`** — builds the lookup structure:

```js
function indexHistoryData(rows) {
  const byLevel = { overall: [], goal: {}, department: {}, employee: {} };

  rows.forEach((row) => {
    if (row.level === 'overall') {
      byLevel.overall.push(row);
    } else if (byLevel[row.level]) {
      if (!byLevel[row.level][row.entity]) byLevel[row.level][row.entity] = [];
      byLevel[row.level][row.entity].push(row);
    }
  });

  // Sort all arrays by timestamp ascending
  byLevel.overall.sort((a, b) => a.timestamp - b.timestamp);
  Object.values(byLevel.goal).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  Object.values(byLevel.department).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  Object.values(byLevel.employee).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));

  return byLevel;
}
```

**5. Write `getHistoryForEntity(level, entity)`** — convenience accessor:

```js
function getHistoryForEntity(level, entity) {
  if (level === 'overall') return appState.history.byLevel.overall || [];
  return (appState.history.byLevel[level] || {})[entity] || [];
}
```

**6. Write `computeDelta(historyRows, periodKey)`** — computes the delta for a given period:

```js
const PERIOD_DAYS = { '1w': 7, '1m': 30, '3m': 90 };

function computeDelta(historyRows, periodKey) {
  if (historyRows.length < 2) return null;

  const now = Date.now();
  const cutoff = now - PERIOD_DAYS[periodKey] * 24 * 60 * 60 * 1000;
  const current = historyRows[historyRows.length - 1];

  // Find the snapshot closest to the cutoff date
  let closest = null;
  let closestDist = Infinity;
  for (const row of historyRows) {
    const dist = Math.abs(row.timestamp.getTime() - cutoff);
    if (dist < closestDist) {
      closestDist = dist;
      closest = row;
    }
  }

  if (!closest || closest === current) return null;

  const pctDelta = current.pct - closest.pct;
  const blockedDelta = current.blocked - closest.blocked;
  const doneDelta = current.done - closest.done;

  return { pctDelta, blockedDelta, doneDelta, from: closest, to: current };
}
```

**7. Write `fetchHistoryData()`:**

```js
async function fetchHistoryData() {
  appState.history.status = 'loading';
  try {
    const fixtureName = readManualQaFixtureSelection();
    const url = fixtureName
      ? buildFixtureCsvUrl(fixtureName + '-history') // e.g., ?qaFixture=mixed → mixed-history.csv
      : HISTORY_URL;

    const response = await fetch(url);
    if (!response.ok) {
      appState.history.status = 'error';
      return;
    }
    const text = await response.text();
    const rows = parseHistoryCSV(text);
    appState.history.raw = rows;
    appState.history.byLevel = indexHistoryData(rows);
    appState.history.status = 'loaded';

    // Re-render to show deltas now that history is available
    if (appState.lifecycle.phase === 'loaded') renderApp();
  } catch {
    appState.history.status = 'error';
    // History fetch failure is non-fatal — dashboard works without trends
  }
}
```

**8. Update `fetchSheetData()`** at `app.js:1867` — fire history fetch in parallel. After `setLifecyclePhase('loading')` at line 1882, add:

```js
// Fire history fetch in parallel (non-blocking)
fetchHistoryData();
```

**9. Add Frappe Charts CDN** to `index.html` — before `<script src="app.js">` at line 256:

```html
<script src="https://cdn.jsdelivr.net/npm/frappe-charts@2.0.1/dist/frappe-charts.umd.min.js"></script>
```

**10. Extend `buildHash()` to support query params on overview route** — the current implementation returns `#/` for overview and drops filters. Fix at `app.js:1012`:

```js
function buildHash(view, param, filters) {
  if (view === 'overview') {
    if (filters && Object.keys(filters).length) {
      return `#/?${new URLSearchParams(filters).toString()}`;
    }
    return '#/';
  }
  // ...rest unchanged...
}
```

Also update `parseRoute()` to parse query params from overview URLs (`#/?period=3m`):

```js
// After: if (!raw) return { view: 'overview', param: '', filters: {} };
// Handle overview with query params: raw starts with "?" when hash is "#/?..."
if (raw.startsWith('?')) {
  const filters = {};
  new URLSearchParams(raw.slice(1)).forEach((value, key) => {
    filters[key] = value;
  });
  return { view: 'overview', param: '', filters };
}
```

**11. Write `replaceRoute(view, param, filters)`** — updates the URL without triggering `hashchange` (for in-view state changes like period toggles on the current view):

```js
function replaceRoute(view, param = '', filters = {}) {
  const hash = buildHash(view, param, filters);
  history.replaceState(null, '', hash);
  appState.route = parseRoute(hash);
}
```

All period toggle callbacks should use `replaceRoute()` when staying on the same view, and `navigateTo()` when changing views. This keeps all route-derived state flowing through `parseRoute()`.

**12. Write `aggregateDaily(historyRows)`** — pre-aggregates intra-day snapshots to daily points for cleaner charts:

```js
function aggregateDaily(historyRows) {
  const byDay = {};
  historyRows.forEach((row) => {
    const dayKey = row.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
    byDay[dayKey] = row; // Last snapshot of the day wins
  });
  return Object.values(byDay).sort((a, b) => a.timestamp - b.timestamp);
}
```

All chart rendering should call `aggregateDaily()` on history rows before passing to Frappe Charts. This prevents cluttered x-axes when multiple snapshots happen in one day.

**13. Write `slugify(name)`** — collision-safe ID generation for chart containers:

```js
let slugCounter = 0;
function slugify(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase() +
    '-' +
    slugCounter++
  );
}
```

Use `slugify()` instead of `name.replace(/\W/g, '_')` for all dynamic chart container IDs to prevent collisions between entity names that normalize to the same string.

**14. Create test fixture** `tests/fixtures/history-mixed.csv` — history data in the new schema format with multiple timestamps, levels, and entities. Used by `fetchHistoryData()` when `?qaFixture=` is active (fixture name + `-history` suffix convention).

**15. Write `renderPeriodToggle(containerId, currentPeriod, onChange)`** — reusable segmented toggle:

```js
function renderPeriodToggle(container, currentPeriod, onChange) {
  const periods = [
    { key: '1w', label: '1W' },
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
  ];

  container.innerHTML = `
    <div class="period-toggle" role="radiogroup" aria-label="Comparison period">
      ${periods
        .map(
          (p) => `
        <button type="button"
          class="period-toggle-btn${p.key === currentPeriod ? ' period-toggle-active' : ''}"
          data-period="${p.key}"
          role="radio"
          aria-checked="${p.key === currentPeriod}"
        >${p.label}</button>
      `
        )
        .join('')}
    </div>
  `;

  container.querySelectorAll('.period-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => onChange(btn.dataset.period));
  });
}
```

**16. Write `renderDeltaBadge(delta, metric)`** — reusable delta display with accessibility:

```js
function renderDeltaBadge(delta, metric = 'pctDelta') {
  if (!delta) return '';
  const value = delta[metric];
  const direction = value > 0 ? 'Up' : value < 0 ? 'Down' : 'No change';
  const display = metric === 'pctDelta' ? `${Math.abs(value)}%` : Math.abs(value);
  const ariaLabel = `${direction} ${display}`;

  if (value === 0)
    return `<span class="delta-badge delta-neutral" aria-label="${ariaLabel}">→ 0%</span>`;
  const arrow = value > 0 ? '↑' : '↓';
  const cls = value > 0 ? 'delta-up' : 'delta-down';
  return `<span class="delta-badge ${cls}" aria-label="${ariaLabel}">${arrow} ${display}</span>`;
}
```

**17. Write `renderFrappeLineChart(containerId, historyRows, metric, yLabel)`** — wrapper with CDN-failure guard and container cleanup:

```js
function renderFrappeLineChart(containerId, historyRows, metric, yLabel) {
  if (typeof frappe === 'undefined') return; // CDN failed to load
  const container = document.getElementById(containerId);
  if (!container || !historyRows.length) return;

  // Clear prior chart instance to prevent leaks on rerender
  container.innerHTML = '';

  const daily = aggregateDaily(historyRows);
  const labels = daily.map((r) =>
    r.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const values = daily.map((r) => r[metric]);

  new frappe.Chart(container, {
    data: { labels, datasets: [{ values }] },
    type: 'line',
    height: 180,
    colors: ['#368496'],
    lineOptions: { regionFill: 1, hideDots: values.length > 20 },
    axisOptions: { xIsSeries: true },
    tooltipOptions: { formatTooltipY: (d) => `${d} ${yLabel}` },
  });
}
```

Note: `renderFrappeLineChart` is defined here in Task 2 (infrastructure) so Tasks 3-6 can use it. It was previously in Task 5 but moved here since it's shared infrastructure.

### Verification

- History data loads in parallel with main data (check Network tab: two CSV fetches)
- `appState.history.byLevel` is populated with overall/goal/department/employee arrays
- `appState.history.status` transitions through `idle → loading → loaded` (or `error`)
- `computeDelta()` returns correct values for each period
- Main dashboard still renders correctly if History fetch fails (`status: 'error'`)
- Frappe Charts global (`frappe`) is available on `window`
- `buildHash('overview', '', { period: '3m' })` returns `#/?period=3m`
- `parseRoute('#/?period=3m')` returns `{ view: 'overview', param: '', filters: { period: '3m' } }`
- History fixture (`?qaFixture=mixed` → `mixed-history.csv`) loads deterministically in tests
- Chart containers are cleared before re-instantiation (no DOM leaks)

### Tests

Add to `tests/dashboard-harness.spec.js`:

```js
test('history fetch failure does not break main dashboard', ...);
test('history data is parsed and indexed by level', ...);
test('history fixture routes by GID separately from updates fixture', ...);
```

Create `tests/fixtures/history-mixed.csv` with new-schema sample data.

### Commit

`feat: add history data fetch infrastructure and Frappe Charts CDN`

---

## Task 3: Hero Zone Delta Badges + Period Toggle

**Parallel:** yes (with Task 4)
**Blocked by:** Task 2
**Owned files:** `app.js` (`renderSummary` modification), `styles.css` (delta badge + period toggle styles), `index.html` (no changes)

### What to build

Add delta badges next to the hero completion percentage and stat counters. Add a `1W | 1M | 3M` segmented toggle below the hero progress bar. Add a "View trends" link in the hero zone.

### Implementation

**1. Add period to route filters for overview** — the overview reads `appState.route.filters.period` (default `'1w'`). The period toggle uses `replaceRoute()` (from Task 2) to update the URL without triggering `hashchange`.

**2. Update `renderSummary()`** at `app.js:435` — after the hero percentage element, inject the delta badge:

```js
const overviewPeriod = appState.route.filters.period || '1w';
const overallHistory = getHistoryForEntity('overall');
const overallDelta = computeDelta(overallHistory, overviewPeriod);
const deltaBadgeHtml = appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta) : '';
```

Insert `deltaBadgeHtml` after the `hero-pct` div. Add the period toggle container after the progress bar. Add a "View trends →" link after the stats row.

The full hero zone HTML becomes (additions marked with comments):

```html
<div class="hero-zone" data-hook="hero-zone">
  <div class="hero-pct" data-hook="summary-percent">
    ${summary.pct}
    <span class="hero-pct-symbol">%</span>
  </div>
  ${deltaBadgeHtml}
  <!-- NEW: delta badge -->
  <div class="hero-label">Complete</div>
  <div class="hero-progress" data-hook="summary-progress">
    <div class="hero-progress-track">
      <div
        class="hero-progress-fill"
        data-hook="summary-progress-fill"
        style="width:${summary.pct}%"
      ></div>
    </div>
  </div>
  <div class="hero-period-toggle" id="hero-period-toggle"></div>
  <!-- NEW: toggle container -->
  <div class="hero-stats">
    <!-- ...existing stat divs... -->
  </div>
  <a href="#/trends" class="hero-trends-link" data-hook="trends-link">View trends →</a>
  <!-- NEW -->
</div>
```

**3. After rendering hero HTML**, call `renderPeriodToggle()` targeting `#hero-period-toggle`:

```js
const toggleContainer = elements.summary.querySelector('#hero-period-toggle');
if (toggleContainer && appState.history.status === 'loaded') {
  renderPeriodToggle(toggleContainer, overviewPeriod, (newPeriod) => {
    const newFilters = { ...appState.route.filters, period: newPeriod };
    if (newPeriod === '1w') delete newFilters.period;
    replaceRoute('overview', '', newFilters); // Uses replaceRoute() — no hashchange, goes through parseRoute()
    renderApp();
  });
} else if (toggleContainer) {
  toggleContainer.style.display = 'none';
}
```

**4. Add delta badges to stat counters** — show blocked delta in the blocked stat, done delta in the done stat:

```js
const doneDeltaHtml = renderDeltaBadge(overallDelta, 'doneDelta');
const blockedDeltaHtml = renderDeltaBadge(overallDelta, 'blockedDelta');
```

Insert these after the respective `hero-stat-value` spans.

**5. Hide all delta UI when history is not loaded or has < 2 snapshots.**

### CSS additions (`styles.css`)

```css
/* Period toggle */
.period-toggle {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.period-toggle-btn {
  padding: 4px 12px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: inherit;
  letter-spacing: inherit;
  transition:
    background var(--duration-instant),
    color var(--duration-instant);
}
.period-toggle-btn:not(:last-child) {
  border-right: 1px solid var(--color-border);
}
.period-toggle-btn:hover {
  background: var(--color-bg);
}
.period-toggle-active {
  background: var(--brand-navy);
  color: white;
}

/* Delta badges */
.delta-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  display: inline-block;
  margin-left: 4px;
}
.delta-up {
  color: var(--status-done);
  background: var(--status-done-bg);
}
.delta-down {
  color: var(--status-blocked);
  background: var(--status-blocked-bg);
}
.delta-neutral {
  color: var(--color-text-muted);
  background: var(--color-bg);
}

/* Trends link */
.hero-trends-link {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--brand-navy);
  text-decoration: none;
  margin-top: var(--space-sm);
  display: inline-block;
}
.hero-trends-link:hover {
  text-decoration: underline;
}

.hero-period-toggle {
  margin-top: var(--space-sm);
  text-align: center;
}
```

### Verification

- Hero zone shows delta badge next to completion % when history data is available
- Period toggle switches between 1W/1M/3M and deltas update
- "View trends →" link navigates to `#/trends`
- No delta UI when history has < 2 snapshots
- Period selection persists in URL as `?period=3m`
- Default period (1w) does not appear in URL

### Tests

```js
test('hero zone shows delta badge when history data exists');
test('period toggle updates delta badges');
test('no delta badges when history has fewer than 2 snapshots');
test('trends link navigates to #/trends');
```

### Commit

`feat: add hero zone delta badges with configurable period toggle`

---

## Task 4: Goal Card Trend Indicators

**Parallel:** yes (with Task 3)
**Blocked by:** Task 2
**Owned files:** `app.js` (`renderGoals` modification), `styles.css` (goal card delta styles)

### What to build

Add a delta badge with directional arrow (`+5% ↑`) to each goal card, using the overview's period selection.

### Implementation

**1. Update `renderGoals()`** at `app.js:523`. Inside the `frameGoals.forEach` loop, after computing `activeGoalData`, compute the goal delta:

```js
const overviewPeriod = appState.route.filters.period || '1w';
const goalHistory = getHistoryForEntity('goal', activeGoalData.goal);
const goalDelta = computeDelta(goalHistory, overviewPeriod);
const goalDeltaHtml = isScopable && goalDelta ? renderDeltaBadge(goalDelta) : '';
```

**2. Insert `goalDeltaHtml`** after the `goal-pct-large` div in the goal card HTML at line 564:

```js
<div class="goal-meta">
  <div class="goal-pct-large">
    ${activeGoalData.pct}%${goalDeltaHtml}
  </div>
  <div class="goal-count">
    ${activeGoalData.done} / ${activeGoalData.total} <span style="font-size:0.7em">DONE</span>
  </div>
</div>
```

### CSS additions

```css
.goal-card .delta-badge {
  font-size: 0.65rem;
  vertical-align: middle;
  margin-left: 6px;
}
```

### Verification

- Each goal card shows a delta badge when history data exists for that goal
- Delta reflects the overview period toggle selection
- Empty/zero-item goal cards show no delta
- Delta hidden when < 2 history snapshots for that goal

### Tests

```js
test('goal cards show delta badge when history exists');
test('goal card delta updates when period toggle changes');
```

### Commit

`feat: add trend delta indicators to goal cards`

---

## Task 5: Trends Drilldown View (`#/trends`)

**Parallel:** yes (with Tasks 3, 4 — all three only depend on Task 2)
**Blocked by:** Task 2
**Owned files:** `app.js` (new `renderTrendsDrilldown`, router update), `index.html` (header trends link), `styles.css` (trends-specific styles)

### What to build

A new route `#/trends` that shows a full-page trends analysis: overall completion chart, blocked count chart, small multiples for goals, small multiples for departments. All charts rendered with Frappe Charts. Small multiples are clickable → entity drilldowns. Period toggle controls the chart time window.

### Implementation

**1. Add `'trends'` to valid views** — update `parseRoute()` at `app.js:998`:

```js
const validViews = ['overview', 'goal', 'department', 'employee', 'trends'];
```

Also update `renderDrilldownView()` at `app.js:1305` to handle trends:

```js
if (view === 'trends') return renderTrendsDrilldown(filters);
```

And update the `appState.route` comment at `app.js:32`:

```js
view: 'overview', // 'overview' | 'goal' | 'department' | 'employee' | 'trends'
```

**2. Update `buildHash()`** — add the `trends` case (overview query-param support is already in Task 2). Insert after the overview block:

```js
if (view === 'trends') {
  let hash = '#/trends';
  if (filters && Object.keys(filters).length) {
    hash += `?${new URLSearchParams(filters).toString()}`;
  }
  return hash;
}
```

Also update the `validViews` check — `trends` is valid without a `param`:

```js
if (!validViews.includes(view)) return { view: 'overview', param: '', filters: {} };
if (view !== 'overview' && view !== 'trends' && !param)
  return { view: 'overview', param: '', filters: {} };
```

**3. Add header "Trends" link** — in `index.html`, add after `header-titles` div at line 27:

```html
<a href="#/trends" class="header-trends-link" id="header-trends-link">Trends</a>
```

**4. Write `renderTrendsDrilldown(filters)`:**

```js
function renderTrendsDrilldown(filters) {
  const period = filters.period || '1w';
  const periodDays = PERIOD_DAYS[period];

  // Breadcrumb
  renderBreadcrumb([{ label: 'Overview', hash: '#/' }, { label: 'Trends' }]);

  // Title
  elements.drilldownTitle.textContent = 'Performance Trends';
  // Count unique timestamps (not raw rows) for accurate snapshot count
  const uniqueTimestamps = new Set(appState.history.raw.map((r) => r.timestamp.getTime())).size;
  elements.drilldownSubtitle.textContent =
    appState.history.status === 'loaded'
      ? `${uniqueTimestamps} snapshot${uniqueTimestamps !== 1 ? 's' : ''} collected`
      : appState.history.status === 'error'
        ? 'History data unavailable'
        : 'Loading history data…';

  if (appState.history.status !== 'loaded' || uniqueTimestamps < 2) {
    const msg =
      appState.history.status === 'error'
        ? '<p>Could not load history data. The dashboard is still fully functional without trends.</p>'
        : '<p>Not enough history data yet. Snapshots are collected automatically as the sheet is edited.</p><p>Check back after a few days of activity.</p>';
    elements.drilldownHero.innerHTML = `<div class="trends-empty-state">${msg}</div>`;
    elements.drilldownFilters.innerHTML = '';
    elements.drilldownTableWrap.style.display = 'none';
    elements.drilldownResultCount.textContent = '';
    return;
  }

  // Period toggle
  const periodContainer = document.createElement('div');
  periodContainer.className = 'trends-period-toggle';
  renderPeriodToggle(periodContainer, period, (newPeriod) => {
    const newFilters = { ...filters, period: newPeriod };
    if (newPeriod === '1w') delete newFilters.period;
    navigateTo('trends', '', newFilters);
  });

  // Filter time window
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const overallHistory = getHistoryForEntity('overall').filter(
    (r) => r.timestamp.getTime() >= cutoff
  );

  // Hero charts: Overall Completion + Blocked Count
  elements.drilldownHero.innerHTML = `
    <div class="trends-hero">
      <div class="trends-period-row" id="trends-period-row"></div>
      <div class="trends-hero-charts">
        <div class="trends-chart-card">
          <h3 class="trends-chart-title">Overall Completion</h3>
          <div id="trends-chart-overall" class="trends-chart"></div>
        </div>
        <div class="trends-chart-card">
          <h3 class="trends-chart-title">Blocked Items</h3>
          <div id="trends-chart-blocked" class="trends-chart"></div>
        </div>
      </div>
      <div class="trends-small-multiples">
        <h3 class="trends-section-title">Goals</h3>
        <div class="trends-grid" id="trends-goals-grid"></div>
      </div>
      <div class="trends-small-multiples">
        <h3 class="trends-section-title">Departments</h3>
        <div class="trends-grid" id="trends-depts-grid"></div>
      </div>
    </div>
  `;

  // Mount period toggle
  document.getElementById('trends-period-row').appendChild(periodContainer);

  // Render hero charts
  if (overallHistory.length >= 2) {
    renderFrappeLineChart('trends-chart-overall', overallHistory, 'pct', '% Complete');
    renderFrappeLineChart('trends-chart-blocked', overallHistory, 'blocked', 'Blocked');
  }

  // Render goal small multiples
  // IMPORTANT: Intersect history entities with live data — only show charts for
  // goals that currently exist in appState.rows. Historical-only entities would
  // navigate to a drilldown that immediately redirects to overview.
  const goalsGrid = document.getElementById('trends-goals-grid');
  const liveGoals = new Set(appState.rows.map((r) => r['Goal'] || 'No Goal'));
  const goalEntities = Object.keys(appState.history.byLevel.goal || {})
    .filter((name) => liveGoals.has(name))
    .sort();
  goalEntities.forEach((goalName) => {
    const chartId = slugify('trends-goal-' + goalName);
    const goalHistory = getHistoryForEntity('goal', goalName).filter(
      (r) => r.timestamp.getTime() >= cutoff
    );
    const card = document.createElement('div');
    card.className = 'trends-small-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="trends-small-title">${escapeHtml(goalName)}</div><div class="trends-small-chart" id="${chartId}"></div>`;
    card.addEventListener('click', () => navigateTo('goal', goalName));
    goalsGrid.appendChild(card);

    if (goalHistory.length >= 2) {
      renderFrappeLineChart(chartId, goalHistory, 'pct', '%');
    }
  });

  // Render department small multiples (same live-entity intersection)
  const deptsGrid = document.getElementById('trends-depts-grid');
  const liveDepts = new Set(appState.rows.map((r) => r['Department']).filter(Boolean));
  const deptEntities = Object.keys(appState.history.byLevel.department || {})
    .filter((name) => liveDepts.has(name))
    .sort();
  deptEntities.forEach((deptName) => {
    const chartId = slugify('trends-dept-' + deptName);
    const deptHistory = getHistoryForEntity('department', deptName).filter(
      (r) => r.timestamp.getTime() >= cutoff
    );
    const card = document.createElement('div');
    card.className = 'trends-small-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="trends-small-title">${escapeHtml(deptName)}</div><div class="trends-small-chart" id="${chartId}"></div>`;
    card.addEventListener('click', () => navigateTo('department', deptName));
    deptsGrid.appendChild(card);

    if (deptHistory.length >= 2) {
      renderFrappeLineChart(chartId, deptHistory, 'pct', '%');
    }
  });

  // Hide table and filters (trends view doesn't use them)
  elements.drilldownFilters.innerHTML = '';
  elements.drilldownTableWrap.style.display = 'none';
  elements.drilldownResultCount.textContent = '';
}
```

**Note:** `renderFrappeLineChart()` is defined in Task 2 (shared infrastructure). This task uses it but does not define it.

### CSS additions

```css
/* Header trends link */
.header-trends-link {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition:
    background var(--duration-instant),
    color var(--duration-instant);
}
.header-trends-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* Trends view layout */
.trends-hero-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  margin-bottom: var(--space-2xl);
}
.trends-chart-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-sm);
}
.trends-chart-title {
  font-family: var(--font-display);
  font-size: 1rem;
  margin-bottom: var(--space-md);
  color: var(--color-text);
}
.trends-section-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  margin-bottom: var(--space-lg);
  color: var(--color-text);
}
.trends-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}
.trends-small-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-instant);
}
.trends-small-card:hover {
  box-shadow: var(--shadow-md);
}
.trends-small-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-sm);
}
.trends-period-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-lg);
}
.trends-empty-state {
  text-align: center;
  padding: var(--space-3xl);
  color: var(--color-text-muted);
}
.trends-small-multiples {
  margin-top: var(--space-xl);
}

/* Responsive */
@media (max-width: 640px) {
  .trends-hero-charts {
    grid-template-columns: 1fr;
  }
}
```

### Verification

- Navigate to `#/trends` — shows overall + blocked charts and goal/department small multiples
- Period toggle switches chart time window
- Clicking a goal chart navigates to `#/goal/<name>`
- Clicking a department chart navigates to `#/department/<name>`
- Empty state shown when < 2 history snapshots
- Header "Trends" link visible and functional from all views
- Breadcrumb shows "Overview > Trends"

### Tests

```js
test.describe('trends drilldown view', () => {
  test('shows overall completion and blocked charts');
  test('shows goal small multiples');
  test('shows department small multiples');
  test('period toggle updates chart window');
  test('clicking goal chart navigates to goal drilldown');
  test('clicking department chart navigates to department drilldown');
  test('empty state when no history data');
  test('breadcrumb shows Overview > Trends');
  test('header trends link navigates to #/trends');
  test('Escape key returns to overview');
});
```

### Commit

`feat: add trends drilldown view with Frappe Charts and small multiples`

---

## Task 6: Drilldown Trend Panels (Goal, Department, Employee)

**Parallel:** no
**Blocked by:** Task 5 (reuses `renderFrappeLineChart` and chart styles)
**Owned files:** `app.js` (modify `renderGoalDrilldown`, `renderDepartmentDrilldown`, `renderEmployeeDrilldown`), `styles.css` (trend panel styles)

### What to build

Add a collapsible "Trends" panel to each drilldown view, between the hero zone and the filter bar. The panel shows entity-specific charts. Collapse state is session-persistent via `sessionStorage` (survives reload, resets on tab close).

### Trend panel content per view

**Goal drilldown:**

- Completion % trendline
- Blocked count trendline
- Delta badge on hero completion %

**Department drilldown:**

- Completion % trendline
- Workload trend (total items over time)
- ~~Per-team completion small multiples~~ **Cut** — the History tab does not capture team-level snapshots, so team trends cannot be reconstructed. Would require adding a `team` level to the Apps Script, which is out of scope for this iteration.

**Employee drilldown:**

- Personal completion % trendline
- Done items over time (throughput signal)
- Blocked trend

### Implementation

**1. Write `renderDrilldownTrendPanel(level, entity, filters)`** — shared renderer for the collapsible panel:

```js
function renderDrilldownTrendPanel(level, entity, filters) {
  const container = document.getElementById('drilldown-trend-panel');
  if (!container) return;

  if (appState.history.status !== 'loaded') {
    container.style.display = 'none';
    return;
  }

  const period = filters.period || '1w';
  const periodDays = PERIOD_DAYS[period];
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const historyRows = getHistoryForEntity(level, entity).filter(
    (r) => r.timestamp.getTime() >= cutoff
  );

  container.style.display = '';
  const isOpen = isTrendPanelOpen(); // reads from sessionStorage

  container.innerHTML = `
    <button type="button" class="trend-panel-toggle" aria-expanded="${isOpen}" data-hook="trend-panel-toggle">
      ${isOpen ? 'Hide' : 'Show'} Trends
      <span class="trend-panel-chevron">${isOpen ? '▾' : '▸'}</span>
    </button>
    <div class="trend-panel-content${isOpen ? ' trend-panel-open' : ''}">
      <div class="trend-panel-period" id="drilldown-trend-period"></div>
      <div class="trend-panel-charts" id="drilldown-trend-charts"></div>
    </div>
  `;

  // Toggle handler — persists to sessionStorage
  container.querySelector('.trend-panel-toggle').addEventListener('click', () => {
    setTrendPanelOpen(!isOpen);
    renderDrilldownTrendPanel(level, entity, filters);
  });

  if (!isOpen) return;

  // Period toggle
  const periodEl = document.getElementById('drilldown-trend-period');
  renderPeriodToggle(periodEl, period, (newPeriod) => {
    const newFilters = { ...filters, period: newPeriod };
    if (newPeriod === '1w') delete newFilters.period;
    navigateTo(appState.route.view, appState.route.param, newFilters);
  });

  // Render charts based on level
  const chartsEl = document.getElementById('drilldown-trend-charts');
  if (historyRows.length < 2) {
    chartsEl.innerHTML =
      '<p class="trend-panel-empty">Not enough data for this period. Try a wider range.</p>';
    return;
  }

  if (level === 'goal') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct"></div>
      <div class="trend-panel-chart" id="trend-chart-blocked"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-blocked', historyRows, 'blocked', 'Blocked');
  } else if (level === 'department') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct"></div>
      <div class="trend-panel-chart" id="trend-chart-workload"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-workload', historyRows, 'total', 'Total Items');
  } else if (level === 'employee') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct"></div>
      <div class="trend-panel-chart" id="trend-chart-done"></div>
      <div class="trend-panel-chart" id="trend-chart-blocked"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-done', historyRows, 'done', 'Done');
    renderFrappeLineChart('trend-chart-blocked', historyRows, 'blocked', 'Blocked');
  }
}
```

**2. Add drilldown trend panel HTML** — in `index.html`, inside `#drilldown-view` at line 228, after `drilldown-hero` and before `drilldown-filters`:

```html
<div class="drilldown-trend-panel" id="drilldown-trend-panel" style="display: none"></div>
```

**3. Register element** — add to `elements` object at `app.js:57`:

```js
drilldownTrendPanel: document.getElementById('drilldown-trend-panel'),
```

**4. Call `renderDrilldownTrendPanel()`** from each drilldown renderer:

- In `renderGoalDrilldown()` at the end (before filters), add:

  ```js
  renderDrilldownTrendPanel('goal', goalName, filters);
  ```

- In `renderDepartmentDrilldown()`, add:

  ```js
  renderDrilldownTrendPanel('department', deptName, filters);
  ```

- In `renderEmployeeDrilldown()`, add:
  ```js
  renderDrilldownTrendPanel('employee', personName, filters);
  ```

**5. Add delta badges to drilldown hero zones** — in each drilldown renderer, compute delta and add badge next to the hero percentage:

For `renderGoalDrilldown()` — after computing `allSummary`:

```js
const drilldownPeriod = filters.period || '1w';
const goalHistory = getHistoryForEntity('goal', goalName);
const goalDelta = computeDelta(goalHistory, drilldownPeriod);
const deltaBadgeHtml = renderDeltaBadge(goalDelta);
```

Insert `deltaBadgeHtml` after the `drilldown-progress-pct` div.

Same pattern for department and employee drilldowns.

**6. Hide trend panel for `#/trends` view** — since trends view has its own charts:

```js
if (view === 'trends') {
  elements.drilldownTrendPanel.style.display = 'none';
}
```

### CSS additions

```css
/* Trend panel */
.drilldown-trend-panel {
  margin: var(--space-lg) 0;
}
.trend-panel-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-lg);
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--duration-instant);
}
.trend-panel-toggle:hover {
  background: var(--color-bg);
}
.trend-panel-content {
  display: none;
  padding-top: var(--space-lg);
}
.trend-panel-open {
  display: block;
}
.trend-panel-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
  margin-top: var(--space-md);
}
.trend-panel-chart {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
}
.trend-panel-period {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-sm);
}
.trend-panel-empty {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: var(--space-xl);
  text-align: center;
}
```

### Verification

- Goal drilldown: "Show Trends" toggle appears, opens to show completion + blocked charts
- Department drilldown: shows completion + workload charts
- Employee drilldown: shows completion + done + blocked charts
- Panel stays open when navigating between drilldowns
- Panel closes when toggled, stays closed across navigation
- Period toggle within panel controls chart time window
- Delta badge appears on drilldown hero completion %
- Panel hidden when history data unavailable

### Tests

```js
test.describe('drilldown trend panels', () => {
  test('goal drilldown shows collapsible trend panel');
  test('trend panel stays open across drilldown navigation');
  test('trend panel period toggle controls chart window');
  test('department drilldown shows workload chart');
  test('employee drilldown shows throughput chart');
  test('delta badge on drilldown hero completion %');
  test('trend panel shows empty state for sparse data');
});
```

### Commit

`feat: add collapsible trend panels to goal, department, and employee drilldowns`

---

## Task 7: Polish, Edge Cases, and Final Verification

**Parallel:** no
**Blocked by:** Task 6
**Owned files:** all files (formatting, edge cases, responsive)

### What's left

Most resilience, accessibility, and edge-case handling was moved into Tasks 2, 5, and 6 per Codex review. This task covers the remaining polish:

### Steps

**1. Responsive audit:**

- Trends view: single-column charts below 640px
- Period toggle: ensure touch targets ≥ 44px on mobile
- Trend panel: full-width on mobile

**2. Reduced motion:**

- Frappe Charts: pass `animate: 0` when `prefers-reduced-motion: reduce` is active
- Delta badges don't animate (they're static text — no action needed)

**3. Remaining edge cases** (guards already in place from earlier tasks — verify they work):

- History tab returns empty/malformed CSV → `status: 'error'`, graceful fallback (Task 2)
- Entity exists in current data but not in history → no delta, no chart (Tasks 3/4/6)
- Period wider than available history → chart shows all data (Tasks 5/6)
- CDN failure → `typeof frappe` guard in wrapper (Task 2)
- Parallel fetch skew → add "History as of [date]" label to delta badges when latest history timestamp is > 1 hour behind current time

**4. Accessibility sweep:**

- Charts have `aria-label` on containers (e.g., "Overall completion trend chart")
- Verify all ARIA attributes from Tasks 2/5/6 render correctly
- Keyboard test: Tab through period toggles, trend panel toggle, trends link

**5. Run full test suite:** `npx playwright test` — all must pass

**6. Run Prettier:** `npx prettier --write index.html styles.css app.js`

**7. Manual smoke test:**

- Overview loads with delta badges and period toggle
- Goal cards show trend arrows
- `#/trends` shows all charts with correct data
- Each drilldown has working trend panel
- Period toggle works per-route (resets to 1w on navigation)
- Browser back/forward works through trends views
- Mobile viewport (390px) renders correctly
- History fetch failure → dashboard works without trends, `status: 'error'` empty state on `#/trends`

### Commit

`chore: trends UI polish — responsive, a11y, edge cases, verification`

---

## Execution Dependency Graph

```
Task 1 (Apps Script expansion + backfill)
  │
  v
Task 2 (history fetch infra + Frappe Charts CDN + router fixes)
  │
  ├──────────┬──────────┐
  v          v          v
Task 3      Task 4      Task 5      ← PARALLEL (hero, goal cards, trends view)
(hero)      (cards)     (trends)
  │          │          │
  └────┬─────┘          │
       │     ┌──────────┘
       v     v
Task 6 (drilldown trend panels)
  │
  v
Task 7 (polish + verification)
```

**Parallelism opportunities:**

- Tasks 3, 4, and 5 can all run in parallel (hero zone, goal cards, and trends view are independent renderers that only depend on Task 2 infrastructure)
- Task 6 depends on Task 5 only for chart styles and the `renderFrappeLineChart` wrapper being integrated, but both are already in Task 2. If needed, Task 6 can start after Task 2 as well — the only real dependency is that the CSS from Task 5 exists.

---

## File Ownership Summary

| Task | `app.js`                                                                                                                                                                                                                                                                                                                                                       | `index.html`          | `styles.css`                       | Other                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------- | ---------------------------------------- |
| 1    | —                                                                                                                                                                                                                                                                                                                                                              | —                     | —                                  | Google Apps Script (snapshot + backfill) |
| 2    | `HISTORY_URL`, `appState.history` (status enum), `parseHistoryCSV`, `indexHistoryData`, `getHistoryForEntity`, `computeDelta`, `aggregateDaily`, `slugify`, `fetchHistoryData`, `renderPeriodToggle`, `renderDeltaBadge`, `renderFrappeLineChart`, `replaceRoute`, `isTrendPanelOpen`/`setTrendPanelOpen`, `buildHash` overview fix, `parseRoute` overview fix | Frappe CDN `<script>` | period toggle + delta badge styles | `tests/fixtures/history-mixed.csv`       |
| 3    | `renderSummary` mod (uses `replaceRoute`)                                                                                                                                                                                                                                                                                                                      | —                     | hero trends link styles            | —                                        |
| 4    | `renderGoals` mod                                                                                                                                                                                                                                                                                                                                              | —                     | goal card delta styles             | —                                        |
| 5    | `renderTrendsDrilldown`, router updates (`trends` route)                                                                                                                                                                                                                                                                                                       | header trends link    | trends view layout styles          | —                                        |
| 6    | `renderDrilldownTrendPanel`, drilldown renderer mods                                                                                                                                                                                                                                                                                                           | trend panel container | trend panel styles                 | —                                        |
| 7    | fetch skew guard, reduced motion, responsive                                                                                                                                                                                                                                                                                                                   | —                     | responsive additions               | —                                        |
