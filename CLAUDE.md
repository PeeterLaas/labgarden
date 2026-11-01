# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PAIvik (repo name Labgarden) is a local-first research workspace that runs entirely in the browser: a static site with no build step, no dependencies and no backend. Data is stored in the user's IndexedDB and never leaves the browser. The "gardener" that suggests records and links is plain rule-based JavaScript, not a model, and the page says so. Keep that copy honest: eLabFTW/PAIvik notebook, Carpentries Workbench, protocols.io and model integrations are planned, not implemented here.

The design follows University of Tartu style: signature blue `#2C5696` dominant, deep blue `#1B365D` for the sidebar, Rubik (self-hosted in `dist/fonts/`), grey rather than black text, accents used sparingly. It does not use the official UT logo.

## Commands

```sh
python3 -m http.server 8000 --directory dist   # run locally at http://localhost:8000
node --check dist/app.js                        # syntax check (the only JS "lint")
python3 scripts/check_assets.py                 # verify every local <script src>/<link href> in index.html exists
```

There are no tests. CI (`.github/workflows/check.yml`) runs the two checks on every push and PR.

## Deployment

- Pushes to `main` run the same checks, then publish `dist/` to GitHub Pages at https://peeterlaas.github.io/labgarden/ (`.github/workflows/pages.yml`).
- `.openai/hosting.json` configures a separate Sites deployment that also serves `dist/`. Leave it in place.
- Anything outside `dist/` is never served.

## Code structure

Readable, framework-free files in `dist/`:

- `index.html`: the shell. Sidebar (`[data-nav]` views, `#project-list`), the work view with `[data-tab]` tabs and the `#panel-graph`, `#panel-inbox`, `#panel-review` panels, the `#capture` form, the `#view-about` view, and one shared `<dialog>`.
- `app.js`: one IIFE.
  - `store` wraps IndexedDB (`kv` holds the whole `state` object, `files` holds Blobs by id) with an in-memory fallback. `save()` is debounced; call it after every mutation, then `render()`.
  - `state` = `{version, current, selected, projects, nodes, edges, inbox, proposals}`. Nodes carry `x`/`y` in the 800×420 SVG viewBox. `TYPES` defines record types (label, `kind` rec/hub/evi, icon, radius).
  - Routing is the URL hash (`#graph`, `#inbox`, `#review`, `#about`); `render()` redraws everything for the current project.
  - Capture → `addCapture()` → `suggest()` (the gardener) creates `proposals`: one `add` proposal with checkable `links`, plus optional `flag` proposals. `accept()` turns an `add` proposal into a node and edges.
  - All user text goes through `esc()` before entering `innerHTML`. Clicks are handled by one delegated listener keyed on `data-*` attributes.
  - Export is JSON (`app: 'paivik'`, state, files as data URLs); import validates that shape before replacing everything.
- `style.css`: design tokens on `:root`, redefined under `prefers-color-scheme: dark`; phone layout below 860px.

After any change, run both checks and try the flows in a browser (capture → review → accept, reload persists, export/import).
