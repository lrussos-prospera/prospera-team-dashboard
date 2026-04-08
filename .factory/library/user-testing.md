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
- The live Google Sheets CSV endpoint is currently reachable.
- Before validation, ensure the local server is running from `.factory/services.yaml` and browser tooling dependencies are installed.

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
