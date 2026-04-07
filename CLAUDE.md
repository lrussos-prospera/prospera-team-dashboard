# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Static web application — no build tools, no dependencies, no transpilation. Three files:

- `index.html` — HTML structure and base64-encoded logo
- `styles.css` — all styles, CSS custom properties for brand tokens, responsive breakpoints
- `app.js` — data fetching, CSV parsing, rendering, filtering logic

## Data Source

The dashboard fetches data from a Google Sheets spreadsheet via the `gviz` CSV export endpoint. The fetch happens client-side in `fetchSheetData()`. The custom `parseCSV()` handles quoted fields.

## Development

Open `index.html` in a browser, or use a local HTTP server (`python3 -m http.server 8000`) — a server is needed for the Google Sheets fetch to work due to CORS.

## Deployment

Push to `main` → GitHub Pages serves `index.html` automatically. No build step.

## When Making Changes

Explain tradeoffs and alternatives when proposing modifications — the maintainers are still learning this codebase.
