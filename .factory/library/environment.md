# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** required env vars, external API dependencies, local setup notes, tooling prerequisites.
**What does NOT belong here:** service ports/commands (use `.factory/services.yaml`).

---

## External Dependencies

- Google Sheets CSV endpoint configured in `app.js` is the live Phase 1 data source.
- No backend, database, queue, or auth service is part of this mission.

## Local Setup Notes

- The app is a static HTML/CSS/JS site and must remain single-page with no framework and no routing.
- Local validation should serve the repo on port `3100`.
- Browser-based testing tooling must be installed in-repo during the mission because the repo currently has no test stack.
- Installing `@playwright/test` does not install browser binaries; if Chromium is missing locally, run `npx playwright install chromium` before relying on browser tests.
- `.factory/init.sh` is not executable in this repo snapshot; invoke it with `sh .factory/init.sh` (or `sh "/absolute/path/to/.factory/init.sh"`) rather than executing it directly.

## Constraints

- Keep the existing Google Sheet schema unchanged for Phase 1.
- Do not replace the live-sheet integration with a different runtime data source.
- Preserve light mode and the existing brand-system direction from `.impeccable.md`.
