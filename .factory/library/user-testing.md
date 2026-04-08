# User Testing

Testing surface, tools, and runtime validation notes.

**What belongs here:** user-facing validation surfaces, tool choices, setup notes, runtime constraints, concurrency guidance.

---

## Validation Surface

### Browser UI

- Primary validation surface is the local dashboard served over HTTP.
- Default validation tool: `agent-browser` for user-facing browser assertions.
- Automated behavior-focused browser tests will be added in-repo during the mission and should cover the same critical flows as the validation contract.
- The baseline Playwright manifest command is allowed to pass with zero tests until the test-harness feature lands; once tests exist, failures must fail the command normally.
- Manual/browser QA is still required for animation quality, hierarchy, and visual fidelity review.

## Validation Readiness

- Local static serving is workable on `http://127.0.0.1:3100`.
- The live Google Sheets CSV endpoint is currently reachable, but live-sheet smoke checks can settle slowly enough to need an extended wait or one controlled reload before concluding failure.
- Before validation, ensure the local server is running from `.factory/services.yaml` and browser tooling dependencies are installed.
- Because the manifest `web.start` command resolves repo root via `git rev-parse --show-toplevel`, run startup/healthcheck flows from inside the repository git worktree.

## Validation Concurrency

### Browser UI

- Max concurrent validators: **2**
- Rationale:
  - Machine capacity is high (16 CPU cores, 64 GB RAM), but this project depends on a live remote Google Sheets endpoint.
  - Conservative concurrency reduces flaky failures caused by shared live-network dependency rather than local resource pressure.
  - Prefer serial or low-parallel validation for scoped/filter-heavy flows that reuse the same live dataset.

## Known Testing Focus Areas

- Load, refresh, error, and retry behavior
- Summary and goal-card recomputation under scope/filter/search
- Blocked-item visibility rules
- Scope indicator and dismiss/reset semantics
- One-row-at-a-time expansion behavior
- Keyboard interactions and reduced-motion behavior
- Mobile layout and content preservation in expansion

## Flow Validator Guidance: Browser UI

- Use the shared local app at `http://127.0.0.1:3100/index.html` unless your assignment explicitly requires a different path.
- Keep validation within the browser surface; do not modify app source, test fixtures, or shared runtime data during a flow-validation run.
- Each subagent must use its own isolated browser session/workspace and save reports only to its assigned `.factory/validation/<milestone>/user-testing/flows/<group-id>.json` path.
- Shared-state risk is low because the dashboard is a static app backed by live-sheet fetches, but validators can still interfere through simultaneous refresh-heavy traffic; respect the max concurrency of 2 and avoid unnecessary repeated refresh/retry loops.
- If an assertion requires network failure or empty-data simulation, prefer the existing Playwright/browser interception patterns over changing the production sheet URL.
- For deterministic fixture-backed scenarios in manual browser QA, prefer the localhost-only `?qaFixture=<allowlisted-name>` runtime path added in `app.js` over brittle route interception. The app only honors this query param on localhost hosts (`localhost`, `127.0.0.1`, `[::1]`), and fixture CSVs are loaded from `tests/fixtures/<name>.csv` when the allowlisted name is present.
- Playwright route interception in `tests/helpers/sheet-fixtures.js` remains useful for automated tests and for scenarios like network failure/empty-data simulation that are not driven by the manual QA fixture toggle.
- Capture concrete evidence for each assertion group: the specific user actions performed, the observed UI state, any console/network anomalies, and the final pass/fail/blocked decision for each assigned assertion.
- Do not create or rely on URL-based state, alternate ports, or route transitions; the single-page invariant is part of the contract under test.
- If the shared web server becomes unhealthy, stop and report the blocker instead of restarting unrelated services from inside a flow-validator run.
