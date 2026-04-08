# Architecture

High-level system structure, relationships, data flow, and invariants.

**What belongs here:** major runtime components, state/data flow, invariants workers must preserve.
**What does NOT belong here:** low-level implementation steps or command references.

---

## System Shape

- Phase 1 remains a static browser application served from this repository.
- The user experience must remain a single-page dashboard: no routing, no multi-page transitions, and no URL-based navigation state.
- The dashboard is composed of one continuous page with two conceptual layers:
  1. overview
  2. scoped detail

## Data Flow

1. The browser fetches CSV data from the configured Google Sheets export endpoint.
2. CSV rows are parsed into flat update records.
3. The application derives presentation state from those rows:
   - summary metrics
   - goal-card metrics
   - blocked-item subset
   - scoped/filtered result set
   - grouped table rows
   - freshness/staleness signals
4. The page renders all visible sections in place from that derived state.

## Core Runtime Invariants

- All interactions must update the existing page in place.
- Scope is filtering with visual emphasis, not navigation.
- Reset and dismiss actions must restore the same canonical overview state.
- Blocked visibility has one canonical dedicated section on the page.
- Freshness and staleness are derived from `Added/updated` data semantics, not merely from when the user pressed refresh.
- The detail table stays grouped by department.
- At most one detail row may be expanded at a time.
- Mobile behavior may hide columns in collapsed rows, but must preserve access to the hidden information inside expanded content.

## Refactor Direction

Workers may perform a larger internal cleanup, but should preserve these boundaries:

- keep runtime browser-only and static
- preserve the live Google Sheets integration
- preserve the single-page mental model
- favor explicit state and derived selectors over DOM-coupled implicit state
- create stable hooks/selectors needed for durable browser validation

## Browser Validation Shape

The mission’s quality bar depends on behavior-focused browser validation. The architecture should therefore support:

- deterministic scope/filter/search state
- deterministic freshness/staleness calculation
- durable interactive selectors for key UI regions
- predictable rendering of overview, blocked section, controls, and table under all major states
