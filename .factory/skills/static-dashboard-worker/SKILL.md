---
name: static-dashboard-worker
description: Implement and verify static single-page dashboard features with behavior-focused browser validation.
---

# Static Dashboard Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use this skill for features in the static HTML/CSS/JS leadership dashboard, including UI refactors, browser interaction work, spec updates tied to this mission, and browser-test infrastructure for the single-page app.

## Required Skills

- `agent-browser` — use for browser-based verification of any user-facing dashboard behavior.
- `tdd` — use when adding or changing automated browser tests so work follows a red-green-refactor loop.

## Work Procedure

1. Read the assigned feature in `features.json`, the mission artifacts, `.factory/library/` files, and `AGENTS.md` before editing anything.
2. Preserve the single-page architecture. Do not add routing, URL-state navigation, frameworks, or backend services.
3. Treat browser-test tooling as mission infrastructure: if the assigned feature is responsible for adding or evolving that tooling, do so explicitly; otherwise use the existing tooling from the manifest.
4. When changing behavior, write or update behavior-focused browser tests first when the feature is testable through automation. Prefer high-value end-to-end or integration-style coverage over low-value isolated unit tests.
5. Keep state derivation explicit and deterministic. Favor reusable selectors/helpers and stable DOM hooks where needed for validation.
6. Implement only the assigned feature scope. If the feature depends on missing architecture or conflicting requirements, return to orchestrator.
7. Use the manifest and worker-base startup flow for server lifecycle by default. If direct init execution fails because `.factory/init.sh` lacks an execute bit in this repo snapshot, run it via `sh .factory/init.sh`. Only start or stop extra processes yourself when the existing manifest flow is insufficient, and always clean them up.
8. Manually verify the changed behavior in a browser using `agent-browser`, including adjacent regressions in overview, scope/filter state, and table behavior when relevant.
9. Run the manifest commands relevant to the feature (`lint`, `test`, and any focused test command you add). The baseline `test` command may pass with zero tests only before the browser-test harness is implemented; once tests exist, treat failures as real failures. Use `format` when you changed mission/repo artifact files in addition to runtime code. If a command is not yet available because your feature creates it, report that clearly.
10. Stop any long-running processes you started and leave no orphaned servers or watch tasks.
11. In the handoff, include exact commands run, browser checks performed, tests added/updated, and any gaps or discovered issues.

## Example Handoff

```json
{
  "salientSummary": "Added goal-card scoping with a visible scope indicator and reset parity, plus browser tests for goal scope, dismiss, and URL stability. Verified the flows manually in the local dashboard and ran the focused Playwright suite plus formatting checks.",
  "whatWasImplemented": "Implemented in-place goal scoping for the single-page dashboard, including selected-card styling, dimming of unrelated cards, scope-indicator rendering, dismiss/reset parity, and stable data attributes for browser tests. Added behavior-focused Playwright coverage for goal scope activation, dismiss, and no-URL-change assertions.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npx playwright test tests/dashboard-scope.spec.ts --workers=2",
        "exitCode": 0,
        "observation": "All scope and reset behavior tests passed."
      },
      {
        "command": "npx prettier --check index.html styles.css app.js",
        "exitCode": 0,
        "observation": "Formatting checks passed for edited runtime files."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Loaded the dashboard, clicked a goal card, then dismissed scope from the scope indicator.",
        "observed": "Summary, blocked section, and table all narrowed to the goal in place; dismiss restored the full overview without changing the URL."
      },
      {
        "action": "Clicked the same selected goal card again.",
        "observed": "The page returned to the default overview and removed selected/dimmed goal-card states."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/dashboard-scope.spec.ts",
        "cases": [
          {
            "name": "goal card scopes dashboard without URL change",
            "verifies": "Selecting a goal updates summary, blocked section, and table in place while preserving the same URL."
          },
          {
            "name": "dismissing scope restores overview",
            "verifies": "Scope dismiss and reset both return the dashboard to the default overview state."
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The feature needs data fields or sheet-schema changes beyond Phase 1 boundaries.
- The feature would require routing, multi-page navigation, or URL-based state to complete.
- Browser validation is blocked by missing runtime tooling or an external Google Sheets outage that you cannot restore.
- The spec and current mission artifacts disagree about expected behavior.
