# Frontend Overhaul — Redesign Implementation Plan

> **Design spec:** `.impeccable.md` (created 2026-04-07 via /grill-me interview)
> **Brand reference:** `~/Downloads/Brand Guide HP_v5.pdf`
> **Branch:** `redesign/frontend-overhaul`

**Goal:** Transform the dashboard from a generic internal tool into a clean, authoritative executive dashboard that answers "are we on track?" at a glance — using the official Prospera brand system, restructured information hierarchy, and improved UX.

**Constraint:** Single-file `index.html`, no framework, no build tools, GitHub Pages deployment.

---

## Context for the Implementer

### What exists today

Everything lives in `/index.html` (902 lines). It fetches CSV from Google Sheets, parses it, and renders: 4 equal summary cards → goal progress bars → 5 filter dropdowns + search → 9-column data table grouped by department.

### What it should become

1. **Header** — Prospera logo, title, data freshness (compact)
2. **Hero zone** — Single dominant progress indicator answering "are we on track?" with secondary stats subordinate
3. **Goal progress** — How each strategic goal is tracking (count-based, "X of Y")
4. **Blocked callout** — Dedicated section listing blocked items with owner/reason (hidden when zero)
5. **Compact filters** — Search bar always visible, dropdown filters behind a toggle, cascading
6. **Condensed table** — 5 visible columns (Responsible, Topic, Status, Goal, Updated), dept/team in group headers, row-expand for Details/Notes

### Brand system to apply

**Colors (from brand guide, replacing current wrong values):**

- Navy: `#1F4E86` (primary — replaces `#0f144c`)
- Teal: `#6ABEBE`
- Dark Teal: `#368496`
- Gold: `#FCB614` (decorative only — fails AA on white)
- Orange: `#EE8522`
- Red: `#DD3A3B` (replaces `#fe4922`)

**Typography (Google Fonts):**

- Body/UI: Heebo (400, 500, 700)
- Display accents: Playfair Display (400, 700) — page title and section headers only
- Logo: Intervogue (not used in UI, the logo is a raster image)

**Theme:** Light mode only. Tinted neutrals leaning toward navy hue.

### What NOT to change

- Google Sheets URL and CSV fetch mechanism
- `parseCSV()` logic (recently fixed)
- `normalizeStatus()` logic
- Base64 logo encoding (works fine for a single image)
- Deployment model (push to main → GitHub Pages)

---

## Phase 1: Foundation (do first)

### Task 1: Split into separate files

Extract CSS and JS from `index.html` into `styles.css` and `app.js`. No content changes — pure extraction.

**Files:** Create `styles.css`, `app.js`. Modify `index.html`.

**Steps:**

1. Copy CSS between `<style>` tags into `styles.css`
2. Copy JS between `<script>` tags into `app.js`
3. Replace `<style>` block with `<link rel="stylesheet" href="styles.css">`
4. Replace `<script>` block with `<script src="app.js"></script>` (before `</body>`)
5. Verify page renders identically at `http://localhost:8000`

**Commit:** `refactor: extract CSS and JS into separate files`

---

### Task 2: Apply brand design tokens

Replace all hard-coded colors, fonts, and spacing with CSS custom properties using the official Prospera brand palette.

**Blocked by:** Task 1
**Files:** Modify `styles.css`

**Steps:**

1. Add Google Fonts `<link>` to `index.html` for Heebo (400, 500, 700) and Playfair Display (400, 700)
2. Replace `:root` variables with brand-correct tokens:
   ```
   --brand-navy: #1F4E86
   --brand-teal: #6ABEBE
   --brand-dark-teal: #368496
   --brand-gold: #FCB614
   --brand-orange: #EE8522
   --brand-red: #DD3A3B
   ```
3. Add semantic color tokens (surface, text, muted, border, status colors)
4. Add typography tokens using Heebo as primary, Playfair Display as display
5. Add spacing scale tokens
6. Replace all hard-coded values throughout `styles.css` with tokens
7. Verify the page now shows brand-correct colors and fonts

**Commit:** `feat: apply Prospera brand tokens — colors, typography, spacing`

---

## Phase 2: Information Architecture (core redesign)

### Task 3: Redesign the hero zone

Replace the 4 equal summary cards with a single dominant progress indicator + subordinate stats.

**Blocked by:** Task 2
**Files:** Modify `styles.css`, `app.js`

**Steps:**

1. Redesign `renderSummary()` to output:
   - One large "overall completion" percentage as the hero (done / total)
   - Subordinate stats: in-progress count, blocked count, total count — smaller, beside or below the hero
2. Style the hero zone: large typography for the percentage, Playfair Display for the heading, confident use of brand navy
3. If blocked count > 0, the blocked stat should use `--brand-red` to draw attention
4. Remove the old 4-card grid layout, replace with the hero layout

**Commit:** `feat: redesign hero zone with dominant progress indicator`

---

### Task 4: Add blocked items callout section

Create a dedicated section that surfaces blocked items without requiring filtering.

**Blocked by:** Task 3
**Files:** Modify `styles.css`, `app.js`, `index.html`

**Steps:**

1. Add a `<section id="blocked-section">` in `index.html` between goals and filters
2. In `app.js`, add `renderBlocked(rows)` function that:
   - Filters rows where `normalizeStatus(r.Status) === 'blocked'`
   - If zero blocked items: hide the section entirely
   - If blocked items exist: render each with Responsible, Topic, and Details
3. Style the section: clean list, each item shows who/what/why. Use `--brand-red` accent sparingly (e.g., a left border), not as a background flood
4. Call `renderBlocked()` from `loadData()` and `renderTable()`

**Commit:** `feat: add blocked items callout section`

---

### Task 5: Redesign goal progress section

Refresh the goal progress cards to match the new brand system and improve scannability.

**Blocked by:** Task 2
**Files:** Modify `styles.css`, `app.js`

**Steps:**

1. Update `renderGoals()` styling: use Playfair Display for "Progress by Goal" heading, Heebo for card content
2. Progress bars should use `--brand-dark-teal` for the fill (not the old red)
3. Ensure each card shows "X of Y done" and percentage clearly
4. Consider using `--brand-teal` as the progress bar background track

**Commit:** `feat: redesign goal progress cards with brand typography`

---

### Task 6: Condense the data table

Reduce from 9 visible columns to 5, with row expansion for details.

**Blocked by:** Task 2
**Files:** Modify `styles.css`, `app.js`, `index.html`

**Steps:**

1. Update `<thead>` to show 5 columns: Responsible, Topic, Status, Goal, Updated
2. Keep Department and Team in the group header row (already grouped by department)
3. Update `renderTable()` to render only 5 `<td>` cells per row
4. Add click handler on each `<tr>` that toggles an expansion row below it showing Details, Notes, Team
5. Style the expansion row: indented, lighter background, clearly subordinate
6. Add `cursor: pointer` and a subtle expand indicator (e.g., a chevron) to each row
7. Add `aria-expanded` attribute to expandable rows for accessibility

**Commit:** `feat: condense table to 5 columns with row expansion`

---

### Task 7: Compact filters with toggle

Replace the always-visible 5-dropdown layout with a search bar + collapsible filter panel.

**Blocked by:** Task 6
**Files:** Modify `styles.css`, `app.js`, `index.html`

**Steps:**

1. Restructure the controls section:
   - Search bar always visible (full width)
   - "Filters" toggle button next to search
   - Filter dropdowns hidden by default, revealed when toggle is clicked
2. Add cascading behavior: selecting a Department should filter the Team dropdown to only show teams in that department
3. Update `populateFilters()` to support cascading (re-populate downstream dropdowns when upstream changes)
4. Style the collapsed/expanded states with a clean transition
5. Add active filter count badge on the toggle button when filters are applied

**Commit:** `feat: compact filters with search bar and collapsible panel`

---

## Phase 3: Polish

### Task 8: Responsive layout

Add media queries for the new layout to work from 320px to 1440px+.

**Blocked by:** Tasks 3-7
**Files:** Modify `styles.css`

**Steps:**

1. Mobile (< 640px): Stack hero stats vertically, single-column goals, full-width search
2. Tablet (640-1024px): 2-column goals grid, hero stats side by side
3. Desktop (> 1024px): Full layout as designed
4. Table: horizontal scroll on narrow viewports with `min-width` on the table
5. Header: stack logo and title on mobile

**Commit:** `feat: responsive layout for mobile and tablet`

---

### Task 9: Accessibility pass

Ensure WCAG AA compliance across the redesigned interface.

**Blocked by:** Tasks 3-7
**Files:** Modify `styles.css`, `app.js`, `index.html`

**Steps:**

1. Verify all text meets 4.5:1 contrast ratio against its background (test brand colors carefully — gold `#FCB614` cannot be used for text on white)
2. Add `aria-live="polite"` to result count and summary regions
3. Add `scope="col"` to all `<th>` elements
4. Add `aria-expanded` to expandable table rows and filter toggle
5. Add `prefers-reduced-motion` media query to disable animations
6. Add `:focus-visible` styles for all interactive elements
7. Keyboard test: Tab through entire page, verify all controls reachable

**Commit:** `feat: WCAG AA accessibility — contrast, ARIA, focus, reduced motion`

---

### Task 10: Final cleanup and verification

**Blocked by:** Tasks 8-9
**Files:** All

**Steps:**

1. Run Prettier: `npx prettier --write index.html styles.css app.js`
2. Remove any leftover old CSS rules or unused variables
3. Full manual test:
   - Data loads from Google Sheets
   - Hero shows correct completion percentage
   - Goal progress bars render correctly
   - Blocked section appears/hides based on data
   - All 5 filters work, cascading works
   - Search with debounce works
   - Table rows expand/collapse
   - Reset button clears everything
   - Responsive at 320px, 768px, 1024px, 1440px
   - Keyboard navigation works end-to-end
4. Update `CLAUDE.md` to reflect multi-file architecture

**Commit:** `chore: final cleanup, formatting, and verification`

---

## Execution dependency graph

```
Task 1 (split files)
  │
  └─→ Task 2 (brand tokens)
        │
        ├─→ Task 3 (hero zone) ──→ Task 4 (blocked callout)
        │
        ├─→ Task 5 (goal progress)
        │
        └─→ Task 6 (condensed table) ──→ Task 7 (compact filters)
                                              │
                              ┌───────────────┘
                              │
                         Tasks 8 + 9 (responsive + a11y — can run in parallel)
                              │
                              └─→ Task 10 (cleanup + verify)
```

**Parallelism opportunities:**

- Tasks 3 and 5 can run in parallel (hero zone and goal progress are independent)
- Tasks 8 and 9 can run in parallel (CSS responsiveness and accessibility are independent)

**Estimated scope:** ~10 tasks, each touching 1-3 files. Total rewrite of CSS, significant JS changes for new rendering logic, moderate HTML restructuring.
