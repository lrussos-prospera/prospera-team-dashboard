# Drilldown Views Implementation Plan

> **For Claude:** Spawn sonnet subagents per task. Tasks 5+6 can run in parallel after Task 4 completes (Task 4 creates shared infrastructure). All other tasks are sequential. Each subagent should run tests before committing.

**Goal:** Replace the in-place scoping system with navigable drilldown views — hash-based routing for goal, department, and employee views, each with a tailored hero zone, contextual filters, and hierarchical breadcrumbs. Enhance the overview with an executive summary (department strip) and recent activity section. Remove the scope system entirely.

**Architecture:** Add `appState.route` driven by `window.location.hash`. A lightweight hash router dispatches to view-renderer functions. Goal card clicks and department header clicks navigate to drilldowns instead of scoping. Each drilldown has its own hero zone layout, a contextual filter bar (relevant filters only), and a shared table renderer. Filter state within drilldowns persists in the URL hash query string (`#/goal/Infrastructure?status=blocked`).

**Tech Stack:** Vanilla JS (no framework), CSS custom properties, Playwright for E2E tests, existing Google Sheets CSV data source.

---

## Terminology

- **Overview:** The default view (`#/` or empty hash) — the current dashboard, minus the scope system.
- **Drilldown:** A route like `#/goal/Legal+Framework` that shows a focused view of one entity.
- **Route:** The hash portion of the URL that determines which view is rendered.

## Key Design Decisions

**Scope system removed:**
Goal card clicks and department header clicks now navigate to drilldown views instead of scoping the overview table in-place. The scope system (`appState.view.scope`, `setScope`, `scopeToGoal`, scope indicator) is removed entirely. Overview filters (dropdowns + search) remain for quick narrowing within the overview.

**Why hash routing (not pushState):**
GitHub Pages serves `index.html` only. No server-side routing means pushState paths would 404 on refresh. Hash routing works without server config.

**Filter state in URL:**
Drilldown filters are encoded in the hash: `#/goal/Infrastructure?status=blocked&search=tax`. This makes filtered drilldown views shareable and bookmarkable. Filters reset when navigating between views.

**Contextual filters per view:**
Each drilldown shows only relevant filter controls. Goal drilldown: status, department, person, search. Department drilldown: status, team, person, search. Employee drilldown: status, search.

**View-specific hero zones:**
The table is shared across all drilldowns. The hero zone above it is tailored: goal gets a progress-focused layout with contributing departments; department gets a per-team breakdown grid; employee gets a person-context header with goal distribution.

**Hierarchical breadcrumbs:**
Full clickable breadcrumb trail: `Overview > Governance > Ana Cruz`. Each level links to its drilldown or overview.

---

## Task 1: Hash Router Foundation

**Parallel:** no
**Blocked by:** none
**Owned files:** `app.js` (router functions, appState.route)

### What to build

Add a minimal hash router: parse `window.location.hash` into a route object with optional query params, store in `appState.route`, dispatch to the correct renderer via `hashchange` listener.

### Route format

```
#/                                      -> overview
#/goal/<GoalName>                       -> goal drilldown
#/goal/<GoalName>?status=blocked        -> goal drilldown with filter
#/department/<DeptName>                 -> department drilldown
#/employee/<PersonName>                 -> employee drilldown
```

Names are URI-encoded. Spaces become `+` for readability.

### Implementation

**1. Add route state to appState** (after existing `view` block):

```js
route: {
  view: 'overview',  // 'overview' | 'goal' | 'department' | 'employee'
  param: '',          // entity name
  filters: {},        // { status: 'blocked', search: 'tax' } from query string
},
```

**2. Write parseRoute(hash):**

```js
function parseRoute(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw) return { view: 'overview', param: '', filters: {} };

  // Split path from query string
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
  const view = segments[0] || 'overview';
  const param = segments.slice(1).join('/');

  const validViews = ['overview', 'goal', 'department', 'employee'];
  if (!validViews.includes(view)) return { view: 'overview', param: '', filters: {} };
  if (view !== 'overview' && !param) return { view: 'overview', param: '', filters: {} };

  // Parse query params
  const filters = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((value, key) => {
      filters[key] = value;
    });
  }

  return { view, param, filters };
}
```

**3. Write buildHash(view, param, filters):**

```js
function buildHash(view, param, filters) {
  if (view === 'overview') return '#/';
  let hash = `#/${encodeURIComponent(view)}/${encodeURIComponent(param).replace(/%20/g, '+')}`;
  if (filters && Object.keys(filters).length) {
    const qs = new URLSearchParams(filters).toString();
    hash += `?${qs}`;
  }
  return hash;
}
```

**4. Write navigateTo(view, param, filters):**

```js
function navigateTo(view, param = '', filters = {}) {
  const hash = buildHash(view, param, filters);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}
```

**5. Write onRouteChange():**

```js
function onRouteChange() {
  const newRoute = parseRoute(window.location.hash);
  appState.route = newRoute;
  collapseExpandedRow();
  renderApp();
}
```

**6. Wire hashchange in bindEvents():**

```js
window.addEventListener('hashchange', onRouteChange);
```

**7. Initialize route on page load** — update bottom of app.js:

```js
initializeViewedDate();
bindEvents();
appState.route = parseRoute(window.location.hash);
fetchSheetData();
```

**8. Add route check to renderApp()** — at top, after `syncVisibility`:

```js
if (appState.route.view !== 'overview') {
  renderDrilldownView();
  return;
}
```

Add stub:

```js
function renderDrilldownView() {
  // Stub — will be implemented in Tasks 4-6
  navigateTo('overview');
}
```

**9. Run `npx playwright test`** — all existing tests must pass.

**10. Commit:** `feat: add hash router with query param support and route dispatch`

---

## Task 2: Remove Scope System + Rewire Clicks to Navigation

**Parallel:** no
**Blocked by:** Task 1
**Owned files:** `app.js` (scope removal, click handler changes), `index.html` (remove scope indicator), `styles.css` (remove scope styles), test files (update scope-related tests)

### What to build

Remove the entire scope system. Goal card clicks navigate to `#/goal/<name>`. Department header clicks navigate to `#/department/<name>`. Remove: `appState.view.scope`, `setScope`, `scopeToGoal`, `clearScope` (keep a minimal version that just clears the view state), scope indicator HTML/CSS, `renderScopeIndicator`.

### Implementation

**1. Remove scope from appState.view** — delete the `scope` block entirely.

**2. Remove functions:** `setScope`, `scopeToGoal`, `renderScopeIndicator`.

**3. Simplify `clearScope`** to a no-op or remove it; update any callers (e.g., `resetFilters`). Since scope is gone, `resetFilters` no longer needs to call `clearScope`. Remove the call.

**4. Update renderGoals()** — change goal card click handler:

```js
// Before: div.addEventListener('click', () => scopeToGoal(activeGoalData.goal));
// After:
div.addEventListener('click', () => navigateTo('goal', activeGoalData.goal));
```

Remove all scope-related CSS classes from goal cards: `goal-card-active`, `goal-card-dimmed`, `aria-pressed` logic that references scope. Keep `goal-card-empty` and `goal-card` as-is.

**5. Update renderTable() group headers** — change department click handler:

```js
// Before: groupHeader.addEventListener('click', onScopeDepartment);
// After:
groupHeader.addEventListener('click', () => navigateTo('department', dept));
```

Remove `group-header-active` class logic (no more department scope). Remove `aria-pressed` (was based on scope). Keep `role="button"` and keyboard handler (update to navigate).

**6. Remove scope indicator from index.html** — delete the `#scope-indicator` div entirely. Remove `elements.scopeIndicator`, `elements.scopeIndicatorText`, `elements.scopeClearBtn` from JS.

**7. Remove scope indicator CSS** — delete `.scope-indicator`, `.scope-indicator-visible`, and related rules.

**8. Update `syncVisibility`** — remove scope indicator lines.

**9. Update `unwindEscapeState`** — remove the scope-unwinding branch (was the first check).

**10. Update `deriveViewRows`** — remove the two scope filter lines. The function now only applies filter-panel filters.

**11. Update `isNarrowedViewActive`** — remove `appState.view.scope.value` check.

**12. Update `renderScopedSummary`** — this still works (shows when filters narrow the view). No change needed.

**13. Update `bindEvents`** — remove `elements.scopeClearBtn.addEventListener`. Remove the `filterDept` change handler's scope-clearing logic.

**14. Update tests** — any tests that click goal cards expecting scope behavior need updating. Tests that check scope indicator visibility should be removed or changed to check navigation. The `unwindEscapeState` tests need updating.

**15. Run `npx playwright test`** — fix any failures.

**16. Commit:** `refactor: remove scope system, goal/dept clicks now navigate to drilldowns`

---

## Task 3: Drilldown Container, Breadcrumbs, and Contextual Filter UI

**Parallel:** no
**Blocked by:** Task 2
**Owned files:** `index.html` (drilldown section), `styles.css` (drilldown styles), `app.js` (elements registration, syncVisibility update, breadcrumb/filter rendering helpers)

### What to build

Add the HTML shell for drilldown views: hierarchical breadcrumb nav, title area, contextual filter bar, summary stats area, and table section. The breadcrumb supports multi-level paths (`Overview > Governance > Ana Cruz`). The filter bar renders only relevant filters per view type.

### HTML structure

After `</div><!-- .table-wrap -->` and before `</main>`, add:

```html
<div
  id="drilldown-view"
  class="drilldown-view"
  style="display: none"
  role="region"
  aria-label="Drilldown view"
>
  <nav class="drilldown-breadcrumb" aria-label="Breadcrumb">
    <ol class="drilldown-breadcrumb-list" id="drilldown-breadcrumb-list"></ol>
  </nav>

  <div class="drilldown-header" id="drilldown-header">
    <h2 class="drilldown-title" id="drilldown-title"></h2>
    <div class="drilldown-subtitle" id="drilldown-subtitle"></div>
  </div>

  <div
    class="drilldown-hero"
    id="drilldown-hero"
    role="region"
    aria-label="Drilldown summary"
  ></div>

  <div
    class="drilldown-filters"
    id="drilldown-filters"
    role="search"
    aria-label="Filter this view"
  ></div>

  <div class="drilldown-result-count" id="drilldown-result-count"></div>

  <div class="drilldown-table-wrap" id="drilldown-table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">Responsible</th>
          <th scope="col">Topic</th>
          <th scope="col">Status</th>
          <th scope="col">Goal</th>
          <th scope="col">Updated</th>
        </tr>
      </thead>
      <tbody id="drilldown-table-body"></tbody>
    </table>
  </div>
</div>
```

### Breadcrumb rendering

Write `renderBreadcrumb(crumbs)` — takes an array of `{ label, hash }` objects. Last item is current (no link). Example:

```js
// Employee drilldown for Ana Cruz in Governance:
renderBreadcrumb([
  { label: 'Overview', hash: '#/' },
  { label: 'Governance', hash: buildHash('department', 'Governance') },
  { label: 'Ana Cruz' }, // no hash = current page
]);
```

Renders as `<li>` elements with `<a>` for linked crumbs, `<span aria-current="page">` for current.

### Contextual filter rendering

Write `renderDrilldownFilters(filterConfig)` — `filterConfig` is an array of `{ key, label, options }` objects. Renders a compact horizontal filter bar with `<select>` elements + search input. Each select reads/writes `appState.route.filters[key]` and updates the URL hash on change.

Example configs:

- Goal: `[{key:'status', label:'Status', options:[...]}, {key:'dept', label:'Dept', options:[...]}, {key:'person', label:'Person', options:[...]}, {key:'search'}]`
- Department: `[{key:'status', ...}, {key:'team', ...}, {key:'person', ...}, {key:'search'}]`
- Employee: `[{key:'status', ...}, {key:'search'}]`

### CSS

Style the breadcrumb, filter bar, hero zone container, and responsive breakpoints. Use existing design tokens. Breadcrumb uses `>` separators. Filter bar is a flex row with gap, wraps on mobile.

### syncVisibility update

When `appState.route.view !== 'overview'`, hide overview sections and show `#drilldown-view`. When overview, do the reverse.

### Register elements

Add all new `#drilldown-*` IDs to the `elements` object.

### Tests

No new behavior tests yet — this is structural. Run `npx playwright test` to verify nothing breaks.

### Commit

`feat: add drilldown container with breadcrumbs and contextual filter UI`

---

## Task 4: Goal Drilldown View

**Parallel:** yes (runs first — creates shared infrastructure used by Tasks 5, 6)
**Blocked by:** Task 3
**Owned files:** `app.js` (renderGoalDrilldown, shared drilldown helpers), `tests/dashboard-drilldown.spec.js` (new file), `tests/fixtures/drilldown-mixed.csv` (new fixture)

### What to build

The goal drilldown view at `#/goal/Legal+Framework`. Contains:

**View-specific hero zone:**

- Large completion % with progress bar (full-width, styled like goal card progress but bigger)
- Stat row: Done / In Progress / Blocked / Total
- Contributing departments: compact chips showing each department that has rows for this goal, with item count. Clickable to department drilldown.
- Blocked items callout: if any rows are blocked, show a compact list (person + topic). Person names clickable to employee drilldown.

**Contextual filters:** status, department, person, search

**Table:** All rows matching this goal, filtered by contextual filters. Uses shared `renderDrilldownTable()`.

**Breadcrumb:** `Overview > Legal Framework`

### Shared infrastructure (used by Tasks 5, 6)

Create these reusable functions:

```js
function deriveEntityRows(filterFn) {
  return appState.rows.filter(filterFn);
}

function applyDrilldownFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.status && row._status !== filters.status) return false;
    if (filters.dept && row['Department'] !== filters.dept) return false;
    if (filters.team && row['Team'] !== filters.team) return false;
    if (filters.person && row['Responsible'] !== filters.person) return false;
    if (filters.search) {
      const text = Object.values(row).join(' ').toLowerCase();
      if (!text.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderDrilldownSummaryStats(summary) {
  /* stat bar HTML */
}

function renderDrilldownTable(rows) {
  /* table body rendering with expand/collapse */
}

function renderDrilldownView() {
  const { view, param, filters } = appState.route;
  if (view === 'goal') return renderGoalDrilldown(param, filters);
  if (view === 'department') return renderDepartmentDrilldown(param, filters);
  if (view === 'employee') return renderEmployeeDrilldown(param, filters);
  navigateTo('overview');
}
```

### Test fixture

Create `tests/fixtures/drilldown-mixed.csv` with 6+ rows spanning 2 departments, 2 goals, multiple people, mixed statuses.

### Tests

Create `tests/dashboard-drilldown.spec.js`:

```js
test.describe('goal drilldown view', () => {
  test('shows filtered summary and table for the goal');
  test('hero zone shows contributing departments');
  test('hero zone shows blocked items with person names');
  test('back link returns to overview');
  test('browser back button works');
  test('invalid goal redirects to overview');
  test('breadcrumb shows correct path');
  test('contextual status filter narrows table');
});
```

### Commit

`feat: add goal drilldown view with hero zone, contextual filters, and tests`

---

## Task 5: Department Drilldown View

**Parallel:** yes (with Task 6, after Task 4)
**Blocked by:** Task 4
**Owned files:** `app.js` (renderDepartmentDrilldown function only), `tests/dashboard-drilldown.spec.js` (department test block — appended)

### What to build

Department drilldown at `#/department/Governance`.

**View-specific hero zone:**

- Department name + team count + unique person count
- Per-team breakdown grid: each team gets a compact card showing team name, item count, completion %, blocked count. If only one team, skip the grid and just show stats.
- Per-person row: list of unique people in this department with their item count and status breakdown. Person names clickable to employee drilldown.

**Contextual filters:** status, team, person, search

**Table:** All rows for this department, filtered by contextual filters.

**Breadcrumb:** `Overview > Governance`

### Tests

Append to `tests/dashboard-drilldown.spec.js`:

```js
test.describe('department drilldown view', () => {
  test('shows filtered summary and table for the department');
  test('hero zone shows per-team breakdown');
  test('hero zone shows per-person rows with links');
  test('clicking person name navigates to employee drilldown');
  test('invalid department redirects to overview');
  test('contextual team filter narrows table');
});
```

### Commit

`feat: add department drilldown view with team breakdown hero`

---

## Task 6: Employee Drilldown View

**Parallel:** yes (with Task 5, after Task 4)
**Blocked by:** Task 4
**Owned files:** `app.js` (renderEmployeeDrilldown function only), `tests/dashboard-drilldown.spec.js` (employee test block — appended)

### What to build

Employee drilldown at `#/employee/Ana+Cruz`.

**View-specific hero zone:**

- Person name as title, with department + team as subtitle context
- Stat row: Done / In Progress / Blocked / Total + completion %
- Goal distribution: compact row showing which goals this person has items in, with counts. Clickable to goal drilldown.
- Staleness indicator: "Last updated X days ago" based on most recent `_date`.

**Contextual filters:** status, search

**Table:** All rows for this person. The "Responsible" column is redundant here — either hide it or replace with "Department" column to show cross-department work.

**Breadcrumb:** `Overview > [Department] > Ana Cruz` — derive the person's department from their rows (use the most common department if they span multiple).

### Tests

Append to `tests/dashboard-drilldown.spec.js`:

```js
test.describe('employee drilldown view', () => {
  test('shows filtered summary and table for the person');
  test('hero zone shows department and team context');
  test('hero zone shows goal distribution with links');
  test('breadcrumb includes department level');
  test('clicking department in breadcrumb navigates to department drilldown');
  test('invalid person redirects to overview');
  test('contextual status filter narrows table');
});
```

### Commit

`feat: add employee drilldown view with person-context hero`

---

## Task 7: Overview Enhancements — Executive Summary + Navigation Links

**Parallel:** no
**Blocked by:** Tasks 4, 5, 6
**Owned files:** `app.js` (renderDepartmentStrip, renderTable person links, renderBlocked person links), `index.html` (department strip section), `styles.css` (department strip + link styles), `tests/dashboard-drilldown.spec.js` (navigation tests — appended)

### What to build

**Executive summary — department strip:**
Below the goal cards, add a compact horizontal strip of department chips. Each chip shows: department name, completion %, blocked count (if any). Clickable → department drilldown. This gives the "birds-eye" view we discussed.

```html
<section id="dept-strip" class="dept-strip" style="display: none">
  <div class="dept-strip-grid" id="dept-strip-grid"></div>
</section>
```

Write `renderDepartmentStrip(rows)` — derives department stats from rows, renders chips.

**Employee name links in table:**
In `renderTable()` `appendDataRow`, make the person name a clickable link that navigates to `#/employee/<name>`. Click on the link navigates; click elsewhere on the row still toggles expand. Use event delegation — check `event.target.closest('.td-person-link')`.

**Employee name links in blocked section:**
In `renderBlocked()`, make person names clickable links to employee drilldown.

**Goal card "View details" indicator:**
Since goal cards already navigate on click (from Task 2), add a subtle visual indicator: small `→` arrow or "View →" text at the bottom of each card. Purely decorative — the whole card is already the click target.

### CSS

- Department strip: horizontal flex/grid, gap, responsive wrap
- Department chip: compact pill with name, %, optional blocked badge
- Person links: `color: var(--brand-navy); font-weight: 700; text-decoration: none; :hover { text-decoration: underline }`
- Goal card arrow indicator

### Tests

```js
test.describe('overview navigation to drilldowns', () => {
  test('clicking goal card navigates to goal drilldown');
  test('clicking department header navigates to department drilldown');
  test('clicking department chip navigates to department drilldown');
  test('clicking employee name in table navigates to employee drilldown');
  test('clicking employee name in blocked section navigates to employee drilldown');
});
```

### Commit

`feat: add executive summary department strip and navigation links`

---

## Task 8: Recent Activity Section

**Parallel:** no
**Blocked by:** Task 7
**Owned files:** `app.js` (renderRecentActivity), `index.html` (recent activity section), `styles.css` (recent activity styles), `tests/dashboard-drilldown.spec.js` (activity tests — appended)

### What to build

A "Recent Activity" section on the overview showing the 5 most recently updated items. Answers "what happened this week?" at a glance. Respects active filters.

```html
<section
  id="recent-activity"
  class="recent-activity"
  data-hook="recent-activity"
  style="display: none"
>
  <h2 class="recent-activity-heading">Recent Activity</h2>
  <div class="recent-activity-list" id="recent-activity-list"></div>
</section>
```

Place between blocked section and controls/filter section.

Each item shows: date, person name (clickable → employee drilldown), topic, status badge, goal + department metadata line.

Sort by `_date` descending, take top 5.

### CSS

Timeline-style layout: date on left, content on right. Compact, visually lighter than the table. Responsive: single-column on mobile.

### Tests

```js
test.describe('recent activity section', () => {
  test('shows 5 most recent items sorted by date descending');
  test('person names are clickable to employee drilldown');
  test('hidden on drilldown views');
  test('respects active filters');
});
```

### Reveal choreography

Add to `REVEAL_TARGETS` after `blockedSection`:

```js
{ key: 'recentActivity', delay: 550 },
```

### Commit

`feat: add recent activity section to overview`

---

## Task 9: Edge Case Tests and Existing Test Compatibility

**Parallel:** no
**Blocked by:** Task 8
**Owned files:** `tests/dashboard-drilldown.spec.js` (edge case block — appended), existing test files (compatibility fixes only)

### What to test

```js
test.describe('drilldown edge cases', () => {
  test('refresh button on drilldown reloads data and stays on drilldown');
  test('Escape key on drilldown navigates back to overview');
  test('direct URL to drilldown loads correctly on first visit');
  test('navigating between drilldowns updates view without overview flash');
  test('drilldown hides all overview-only sections');
  test('filter state persists in URL hash and survives refresh');
  test('invalid route redirects to overview');
});
```

### Existing test compatibility

Run `npx playwright test` against ALL test files. Common breakage:

- **Scope-related tests:** Should have been updated in Task 2. Verify no leftover assertions about scope indicator, `aria-pressed` on goal cards, or scope-unwind behavior.
- **History length tests:** Hash changes create history entries. If any test checks `history.length`, verify drilldown navigation doesn't break the contract. Overview-internal filter changes must NOT create history entries (they don't touch `location.hash`).
- **Goal card click tests:** Now navigate instead of scope. Update expectations.

### Commit

`test: add drilldown edge cases and verify existing test compatibility`

---

## Task 10: Final Cleanup and Verification

**Parallel:** no
**Blocked by:** Task 9
**Owned files:** all files (formatting and dead code only)

### Steps

1. **Run Prettier:** `npx prettier --write index.html styles.css app.js tests/`
2. **Remove dead code:** Unused scope functions, unused CSS selectors, debug console.logs, commented-out code
3. **Verify no scope remnants:** grep for `scope` in app.js — should only appear in comments or unrelated contexts
4. **Run full test suite:** `npx playwright test` — all must pass
5. **Manual smoke test:**
   - Overview loads with department strip + recent activity
   - Click goal card → goal drilldown with hero
   - Click department chip → department drilldown with team grid
   - Click person name → employee drilldown with breadcrumb
   - Breadcrumb navigation works at all levels
   - Contextual filters work and persist in URL
   - Browser back/forward works
   - Escape returns to overview from any drilldown
   - Mobile viewport (390px) renders correctly

### Commit

`chore: final cleanup and verification for drilldown views`

---

## Execution Dependency Graph

```
Task 1 (hash router)
  |
  v
Task 2 (remove scope + rewire clicks)
  |
  v
Task 3 (drilldown container + breadcrumbs + filter UI)
  |
  v
Task 4 (goal drilldown + shared infra)
  |
  +--------+
  |        |
  v        v
Task 5    Task 6          <- PARALLEL (dept, employee drilldowns)
(dept)    (employee)
  |        |
  +--------+
  |
  v
Task 7 (overview: dept strip + nav links)
  |
  v
Task 8 (recent activity)
  |
  v
Task 9 (edge case tests + compat)
  |
  v
Task 10 (cleanup + verify)
```

## File Ownership (Parallel Tasks 5, 6)

| Task | Owned in app.js                           | Test block                                 |
| ---- | ----------------------------------------- | ------------------------------------------ |
| 5    | `renderDepartmentDrilldown` function only | `department drilldown view` describe block |
| 6    | `renderEmployeeDrilldown` function only   | `employee drilldown view` describe block   |

No overlap — Tasks 5 and 6 each add one renderer function and one test block. Task 4 creates all shared infrastructure (`deriveEntityRows`, `applyDrilldownFilters`, `renderDrilldownSummaryStats`, `renderDrilldownTable`, `renderDrilldownView` dispatcher, the test file, and the fixture).
