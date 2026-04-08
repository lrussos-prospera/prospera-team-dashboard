# Leadership Dashboard Spec

## Objective
- Reframe the dashboard for leadership review, starting with strategic status and supporting drilldown into departments, teams, and individual owners.
- Preserve the current Google Sheet structure for phase 1.
- Improve information hierarchy so a CEO or COO can move from `Are we on track?` to `Where is the risk?` to `Who needs attention?` in a few clicks.

## Design Context
- Audience: CEO, COO, leadership team, and managers reviewing the dashboard in weekly meetings and during quick laptop pulse-checks.
- Tone: clean, authoritative, data-confident. Precise, efficient, and not decorative for its own sake.
- Constraints: static HTML/CSS/JS, no build step, existing Google Sheets source, light mode only.

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
- `Goal` appears to be a controlled field with 4 fixed values, so these function more like strategic pillars than granular project goals.
- The current sheet supports operational visibility and workload signals better than formal performance scoring.

## Product Framing
This should become a leadership operating view, not just a prettier status table.

The dashboard should answer, in order:
1. Are we on track overall?
2. Which strategic goal is healthiest or most at risk?
3. Which departments and teams are carrying the load?
4. Where are blocked items concentrated?
5. Which owners have the most active or stuck work?

## Proposed Information Architecture
1. Executive overview
   - completion percentage
   - status counts
   - blocked snapshot
   - freshness / last updated signal

2. Strategic goals
   - 4 top-level goal cards
   - each card shows:
     - total items
     - done / in progress / blocked counts
     - completion percentage
     - optional mini list of highest-risk teams or blocked count
   - clicking a goal drills into that goal

3. Operational breakdown
   - parallel drilldown paths for:
     - Department
     - Team
     - Responsible
   - user can switch grouping mode within any scoped view:
     - Group by Department
     - Group by Team
     - Group by Owner
     - Group by Status
     - Sort by Updated

4. Detail layer
   - underlying update rows remain the source of truth
   - row expansion continues to show:
     - Team
     - Details
     - Notes
     - Updated date
     - Goal

## Reliable Metrics Using Current Data
These are valid now and should be presented as operational signals, not absolute judgments.

### Overall / scoped metrics
- total updates
- done / in progress / blocked counts
- completion percentage
- blocked rate
- recent activity using `Added/updated`

### Department and team signals
- number of active items
- number of blocked items
- goal distribution
- owner distribution
- recency of updates

### Individual signals
- items owned
- active items owned
- blocked items owned
- goal mix
- recent update cadence

## Metrics To Avoid Overclaiming
Do not label these as hard performance metrics without more structure.
- raw item count as productivity
- done percentage as quality
- owner ranking as performance score
- cross-team comparison without accounting for task size or complexity

Recommended framing:
- workload
- throughput signals
- blockage / risk signals
- update cadence

## Recommended Navigation Model
### Default landing view
- executive summary first
- strategic goals second
- blocked callout near the top
- operational drilldown entry points immediately after goals

### Drilldown paths
1. `Overview -> Goal -> grouped updates`
2. `Overview -> Department -> Team -> Owner -> updates`
3. `Overview -> Team -> Owner -> updates`
4. `Overview -> Owner -> updates`

This creates hierarchy in the interface without requiring hierarchical storage in the sheet.

## Suggested UI Behavior
### Overview page
- strong top summary answering `Are we on track?`
- 4 strategic goal panels
- dedicated blocked section
- operational directory section for departments / teams / owners

### Goal detail page
- breadcrumb: `Overview / Goal`
- scoped summary bar
- grouping toggle: `Department | Team | Owner | Status | Updated`
- filter bar with search
- grouped update list or table

### Department detail page
- breadcrumb: `Overview / Department`
- summary cards for workload and blocked items
- team breakdown underneath
- owner breakdown available via toggle or second grouping layer
- task/update list at the bottom

### Team detail page
- breadcrumb: `Overview / Department / Team`
- team summary
- owner distribution
- blocked items highlighted first
- recent updates list

### Owner detail page
- breadcrumb: `Overview / Team / Owner`
- active workload
- blocked items
- recent updates
- goal distribution

## Frontend Design Audit Notes
The initial goal-first spec was directionally correct but too feature-structural and not leadership-oriented enough.

Changes made after design review:
- shifted framing from `goal drilldown` to `leadership operating view`
- elevated blocked/risk visibility, since leadership cares about what needs intervention
- added explicit department, team, and owner drilldown paths
- clarified that the interface should support progressive disclosure, not dump all filters equally at once
- emphasized summary-first layout for shared-screen leadership review
- kept the design faithful to the project’s existing brand and information-density goals

## What This Does Well
- gives leadership a top-down view with immediate drilldown into the org
- uses current sheet data with low implementation risk
- creates more meaningful paths for managers than a flat table alone
- supports both strategic review and operational follow-up

## Limitations
- the 4 goals are broad strategic pillars, not true nested goals/projects
- there is no separate project entity
- there is no effort, priority, due date, or capacity field
- task size is not normalized, so workload is a proxy, not a precise capacity model
- individual `performance` cannot be measured credibly from this sheet alone

## Recommended Phase Plan

### Phase 1: Leadership drilldown without sheet changes
- keep current flat sheet
- add top-level strategic goal drilldown
- add department, team, and owner drilldowns
- add scoped summaries and grouping controls
- add blocked and recent-activity views within each scope

### Phase 2: Light schema improvement
- add a `Project` field
- preserve `Goal` as the strategic pillar
- optional additions:
  - `Priority`
  - `Due Date`
  - `Health`
  - `Project Owner`
- resulting hierarchy:
  - Goal -> Project -> Updates/tasks

### Phase 3: Structured operating model
- split into linked tabs:
  - `Goals`
  - `Projects`
  - `Tasks/Updates`
- use IDs instead of text matching
- support durable rollups, clearer ownership, and better operational reporting

## Acceptance Criteria
- user can start at a top-level leadership view
- user can drill into a goal, department, team, or owner
- each scoped view shows summary metrics plus underlying updates
- blocked work is easy to find in every scope
- existing sheet structure remains valid for phase 1
- no claims of formal performance scoring are made from insufficient data

## Recommendation
- proceed now with a leadership-focused phase 1
- treat the 4 `Goal` values as strategic pillars
- add department/team/owner operational drilldowns on top of the existing flat sheet
- if leadership later wants true project accountability or stronger performance reporting, add `Project` and a few operational metadata fields before redesigning the full data model

## Summary
- The current sheet is strong enough to support a much better leadership dashboard now.
- The right phase-1 hierarchy is: `Overview -> Goal / Department / Team / Owner -> updates`.
- This will improve workload and risk visibility without overpromising on performance measurement.
- A deeper sheet redesign is only needed once you want real project hierarchy, capacity planning, or durable performance reporting.
