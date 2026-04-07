# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Single-file static web application — all HTML, CSS, and JavaScript live in `index.html`. No build tools, no dependencies, no transpilation.

- `index.html` — the entire application (served via GitHub Pages)

## Data Source

The dashboard fetches data from a Google Sheets spreadsheet via the `gviz` CSV export endpoint. The fetch happens client-side in `fetchSheetData()`. The custom `parseCSV()` handles quoted fields.

## Development

Open `index.html` in a browser, or use a local HTTP server (`python3 -m http.server 8000`) — a server is needed for the Google Sheets fetch to work due to CORS.

## Deployment

Push to `main` → GitHub Pages serves `index.html` automatically. No build step.

## When Making Changes

Explain tradeoffs and alternatives when proposing modifications — the maintainers are still learning this codebase.
