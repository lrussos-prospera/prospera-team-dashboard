# Leadership Dashboard Spec

## Objective

- Reframe the dashboard as a leadership operating view — strategic status first, operational detail on demand.
- Preserve the current Google Sheet structure for phase 1.
- Improve information hierarchy so a CEO or COO can move from `Are we on track?` to `Where is the risk?` to `Who needs attention?` without learning a navigation system.

## Design Context

- Audience: CEO, COO, leadership team, and managers reviewing the dashboard in weekly meetings and during quick laptop pulse-checks.
- Tone: clean, authoritative, data-confident. Bloomberg meets Stripe — precise, structured, respects the viewer's time.
- Constraints: single-file static HTML/CSS/JS, no build step, existing Google Sheets source, light mode only, existing brand system (see `.impeccable.md`).

## Architecture Constraint: Single Page

This is and must remain a single-page application. No hash routing, no multi-page navigation, no framework. All views are rendered by showing/hiding DOM sections and re-rendering content in place. The URL never changes.

**Why:** The dashboard is opened from a bookmark or link. Leadership shares their screen and scrolls. Adding navigation state creates confusion ("how do I get back?"), breaks the mental model of a single status page, and adds implementation complexity that the data volume doesn't justify.

## Current Data Reality

- The source sheet is a flat update tracker.
- Each row is one update/task-like item with fields:
  - `Department`
  - `Team`
  - `Responsible`
  - `Topic`
  - `Details`
  - `Status`
  - `Goal`
  - `Added/updated`
  - `Notes`
- `Goal` has 4 fixed values — these function as strategic pillars, not granular project goals.
- The sheet supports operational visibility and workload signals. It does not support formal performance scoring.
- Typical data volume: 50–150 rows across 4 goals and a handful of departments.

## Product Framing

The dashboard answers these questions in order:

1. Are we on track overall?
2. Which strategic goal is healthiest or most at risk?
3. Where are blocked items concentrated?
4. Which departments and teams are carrying the load?
5. Who has the most stuck work?

This is a leadership operating view — not a project management tool, not a performance scorecard.

## Information Architecture: Two Layers

The dashboard has exactly two layers: **overview** and **scoped detail**. No deeper nesting.

### Layer 1: Overview (default state)

Everything leadership needs at a glance, in scroll order:

1. **Executive summary**
   - Completion percentage (hero metric)
   - Status counts: Done / In Progress / Blocked / Total
   - Data freshness indicator

2. **Strategic goal cards** (4 cards)
   - Each card shows:
     - Goal name
     - Completion percentage + done/total count
     - Progress bar
     - Blocked count with owner names (e.g., "2 blocked — Rivera, Chen")
     - Staleness signal if oldest update > 7 days
   - Clicking a goal card scopes the detail table below to that goal

3. **Blocked callout** (only section dedicated to blocked items)
   - Shows all blocked items with owner, topic, and details
   - Hidden when blocked count is zero
   - This is the single canonical place for blocked visibility

4. **Controls + Detail table**
   - Search bar (always visible)
   - Filter toggle (Department, Team, Responsible, Status, Goal)
   - Grouped detail table (grouped by Department, rows expand for details)

### Layer 2: Scoped Detail (activated by clicking a goal card, department header, or applying a filter)

The detail table re-renders in place with:

- A **scope indicator** showing the active filter (e.g., "Showing: Goal — Operational Excellence") with a clear dismiss/reset control
- The summary stats re-compute to reflect the scoped data
- Goal cards dim except the active one (if scoped by goal)
- The detail table filters to matching rows

**There are no separate pages.** Scoping is filtering with visual emphasis. The user scrolls the same page.

### Drilldown Paths (all achieved via filtering)

1. Click a goal card → table filters to that goal
2. Click a department group header → table filters to that department
3. Use filter dropdowns → table filters to any combination
4. Search → table filters by text match

All paths produce the same result: the existing table, scoped.

## Reliable Metrics Using Current Data

These are valid now and should be presented as operational signals, not absolute judgments.

### Overview metrics

- Total updates
- Done / In Progress / Blocked counts
- Completion percentage
- Blocked rate (blocked / total)
- Data freshness (most recent `Added/updated` value)

### Goal card metrics

- Total items per goal
- Done / In Progress / Blocked counts per goal
- Completion percentage per goal
- Blocked owner names (surface who, not just how many)
- Staleness: days since oldest update in that goal

### Scoped metrics (shown when filtered)

- Same as overview metrics, recomputed for the filtered subset
- Displayed in a compact summary bar above the table

## Metrics To Avoid Overclaiming

Do not label these as hard performance metrics without more data structure.

- Raw item count as productivity
- Done percentage as quality
- Owner ranking as performance score
- Cross-team comparison without accounting for task size or complexity

Recommended framing:

- "Workload" not "performance"
- "Throughput signals" not "velocity"
- "Blockage concentration" not "team ranking"
- "Update cadence" not "responsiveness score"

## Interaction Model

### Scoping (clicking a goal card or department header)

**Behavior:**

- The clicked element gets a selected state (border accent, subtle background shift)
- The summary stats animate to reflect the new scope (number counters transition, not snap)
- A scope indicator appears above the table with the active filter and a dismiss button
- The table content cross-fades to the filtered rows (150ms fade-out, 150ms fade-in)
- Unrelated goal cards dim to 60% opacity (200ms transition)
- Smooth scroll to the table section if it's below the fold

**Dismiss:**

- Click the "x" on the scope indicator, or
- Click the already-selected goal card again (toggle), or
- Click "Reset" in the filter bar
- All restore the full unfiltered view with the reverse transitions

### Row expansion

**Behavior:**

- Chevron rotates 90° on open (200ms, ease-out-quart)
- Detail content reveals via `grid-template-rows: 0fr → 1fr` transition (250ms)
- Only one row expanded at a time — opening a new row closes the previous one
- Expanded row has a left accent border (teal) and subtle inset shadow

### Filter panel

**Behavior:**

- Filter toggle button shows active filter count as a badge
- Panel reveals via `grid-template-rows` transition (250ms), not display toggle
- Cascading filters: selecting a Department scopes the Team dropdown options

### Data refresh

**Behavior:**

- Refresh icon spins during fetch (existing)
- On success: brief green flash on the data freshness badge (300ms)
- On error: red dot + error message with retry button (existing)
- Stats re-render with number transition animation, not full DOM replacement

### Keyboard

- `/` focuses search (existing)
- `Escape` clears active scope / closes expanded row / closes filter panel (in that priority order)
- Arrow keys navigate table rows when table is focused
- `Enter` or `Space` expands/collapses a focused row (existing)

### Animation Timing Reference

All motion uses exponential ease-out for natural deceleration:

```
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
```

| Interaction                    | Duration      | Easing         |
| ------------------------------ | ------------- | -------------- |
| Button hover / press           | 120ms         | ease-out-quart |
| Scope indicator appear/dismiss | 200ms         | ease-out-quart |
| Goal card dim/undim            | 200ms         | ease-out-quart |
| Table content cross-fade       | 150ms         | ease-out-quart |
| Row expand/collapse            | 250ms         | ease-out-quart |
| Filter panel reveal            | 250ms         | ease-out-quart |
| Stat counter transition        | 300ms         | ease-out-quart |
| Scope scroll-to-table          | 400ms         | ease-out-quart |
| Page load stagger              | 80ms per item | ease-out-quart |

Exit animations use 75% of entrance duration. All motion respects `prefers-reduced-motion`.

### Page Load Choreography

On initial data load, elements appear in reading order with staggered reveals:

1. Hero summary fades in (0ms offset, 500ms duration)
2. Goal cards stagger in (200ms offset, 80ms between cards, 400ms each)
3. Blocked section fades in (500ms offset, 400ms)
4. Controls + table fade in (650ms offset, 400ms)

Each element uses `opacity: 0 → 1` + `translateY(12px) → 0`. No bounce, no overshoot.

## Edge Cases

### Empty states

- **Goal with 0 items:** Card shows "No updates yet" in muted text. Progress bar empty. Card is not clickable.
- **Goal at 100%:** Card shows full progress bar in teal. No blocked count shown. Card remains clickable to see completed items.
- **Department with 1 team:** Department group header still shows. No special treatment — consistency matters more than saving one row.
- **Owner with 0 blocked items:** Not surfaced anywhere as a callout. They simply appear in the table with their status badges.
- **All items blocked:** Hero shows 0% with the percentage in red. Blocked section is prominent. No celebratory UI.
- **No data / fetch error:** Loading spinner → error state with retry button. No empty table skeleton.
- **Search with 0 results:** Table shows "No updates match your filters." with a reset link. Summary stats show zeroes.
- **Scope with 0 results:** Same as search with 0 results. Scope indicator remains visible so the user can dismiss it.

### Stale data

- If the most recent `Added/updated` value is older than 7 days, the freshness badge shows an amber dot instead of green, with text like "Last update: 8 days ago".
- Goal cards with no updates in 7+ days show a subtle "stale" indicator (amber dot next to the date).

## Mobile Behavior

The dashboard is primarily used on laptops in meetings. Mobile is secondary but should work.

- **Goal cards:** Stack to single column below 640px
- **Hero stats:** Stack vertically below 640px (existing)
- **Table:** Goal and Updated columns hidden on mobile, surfaced in expand row (existing)
- **Scope indicator:** Full-width bar pinned above the table
- **Filter panel:** Full-width, single column
- **Blocked section:** Full-width cards, no layout change needed
- **Touch targets:** All clickable elements minimum 44px touch target

No gesture-based navigation. Scroll is the only navigation model on mobile.

## What This Does Well

- Gives leadership a top-down view with immediate drill-in via the existing table
- Uses current sheet data with zero implementation risk
- Keeps the single-page mental model — no navigation to learn
- Surfaces blocked concentration and staleness, which is what leadership acts on
- Supports both the shared-screen meeting use case and the solo pulse-check

## Limitations

- The 4 goals are broad strategic pillars, not true nested goals/projects
- There is no separate project entity
- There is no effort, priority, due date, or capacity field
- Task size is not normalized, so workload is a proxy, not a precise capacity model
- Individual performance cannot be measured credibly from this sheet alone
- No offline support — requires network to fetch from Google Sheets

## Recommended Phase Plan

### Phase 1: Enhanced single-page leadership view (no sheet changes)

- Keep current flat sheet and single HTML file
- Enrich goal cards with blocked owner names and staleness signals
- Add scope-by-click on goal cards and department headers
- Add scoped summary stats that recompute on filter
- Add interaction animations (scope transitions, row expand, page load choreography)
- Add `Escape` key handling and scope dismiss UX
- Add stale-data indicators
- Require a robust behavior-focused browser testing system as part of Phase 1 delivery

#### Phase 1 Testing Requirement & Quality Bar

Phase 1 is not complete without durable browser-level behavior coverage for the single-page dashboard.

- Tests must prioritize high-value user-visible behavior (not low-value unit test sprawl)
- The primary automated gate is behavior-focused browser testing against deterministic scenarios, with focused smoke coverage on the real dashboard surface
- Coverage must include at minimum: load/error/retry states, scoped summary recomputation, goal-card blocked/stale signals, blocked-section visibility rules, search/filter/scope/reset semantics, one-row-at-a-time row expansion, keyboard flows, reduced-motion handling, and responsive mobile-table behavior
- Tests must assert single-page constraints (in-place rendering, no routing, no URL-state navigation)
- Any Phase 1 interaction change should add or update relevant browser tests in the same change set

Manual browser QA remains required for visual hierarchy, motion quality, and leadership-readability polish.

### Phase 2: Light schema improvement

- Add a `Project` field to the sheet
- Preserve `Goal` as the strategic pillar
- Optional additions:
  - `Priority`
  - `Due Date`
  - `Health`
  - `Project Owner`
- Resulting hierarchy: Goal → Project → Updates/tasks
- Dashboard groups by project within goal scope

### Phase 3: Structured operating model

- Split into linked tabs:
  - `Goals`
  - `Projects`
  - `Tasks/Updates`
- Use IDs instead of text matching
- Support durable rollups, clearer ownership, and better operational reporting

## Acceptance Criteria

- User can see overall status without scrolling (hero + goal cards above the fold on a laptop)
- User can scope the detail table by clicking a goal card or department header
- Scoping is visually clear (scope indicator, dimmed unrelated cards) and easily dismissed
- Each scope shows recomputed summary metrics
- Blocked items are surfaced on goal cards (owner names) and in a dedicated section
- Stale goals (7+ days without update) are visually flagged
- All transitions are smooth (60fps), purposeful, and respect `prefers-reduced-motion`
- Existing sheet structure remains valid — no changes to the Google Sheet for phase 1
- No claims of formal performance scoring are made from insufficient data
- Mobile is usable (all content accessible, touch targets adequate)

## Summary

- The current sheet supports a much better leadership dashboard now.
- The right architecture is two layers: enhanced overview + scoped detail table, all on one page.
- Scoping is filtering with visual emphasis — not navigation.
- Goal cards surface blocked concentration and staleness, not just percentages.
- A deeper sheet redesign is only needed once you want real project hierarchy, capacity planning, or durable performance reporting.
