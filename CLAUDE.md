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

The approval service and optional local R/MCP companion have tests. Run `node --test tests/*.test.cjs`, plus `Rscript tests/integration.R` and `node tests/mcp-stdio.cjs` when the R dependencies are installed. CI runs the checks and tests on pushes and PRs. See `docs/local-companion.md`. The static browser app still has no build step or external runtime dependencies.

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

**Lab mode** (`dist/lab.js`) is off unless the host serves a `lab.json` beside the page (`{"gateway": "gw/"}`, a path on the same address; the lab's server forwards it to its PAIvik gateway, see the private paivik-deploy repo). Then an Ask PAIvik box and Ticker, Planner, Manuscripts, Seminar, Lab map and Instruments views appear (`LAB_VIEWS` in `app.js`; `PAIvikLab.render(view)` is called after every render). Lab data is fetched from the gateway's `/api/v1/…` and never stored in IndexedDB; writes happen on the server with the signed-in person's own eLabFTW key; a person's own changes are written at once, while model-drafted proposals still wait for an approver on the gateway review page. The Seminar agenda is built by the gateway from ticks (flagged, with a result, or with an open question) and remarks go back to the ticks as comments. The Lab map shows eLabFTW storage units and instruments; only box positions and sticky notes are kept by the gateway. Never commit a `lab.json`. On the public site (`github.io`) lab mode never starts. Keep the About copy honest about this.

A lab can host `dist/` with an optional `links.json` beside it (`[{name, url, note}]`), shown folded as "More lab services" in the sidebar. Never commit a `links.json`: internal addresses stay out of this public repository.

Research mutations must use `stageChange()` and `dist/change-service.js`; do not add direct graph writes in event handlers. The user's click is the decision: there is no second confirmation dialog (the lab prefers speed and fixes mistakes retroactively). `stageChange` commits, records the audit event and offers Undo in the toast; only whole-workspace replacement (reset, import, `{wipe: true}`) asks once. Do not add typed or second-step confirmations back. Capture intake, draft checkbox choices and graph layout are separate. The core binds approval to a proposal ID, revision, SHA-256 digest and expected workspace snapshot, then appends an audit event. Browser persistence writes state and file changes in one IndexedDB transaction and rejects stale writes from another tab.

The optional local companion uses the same core through `server/workspace.cjs`. Its R tools expose read/draft operations only; do not expose approval, commit or discard as model tools. `app.R` is a single-owner localhost approval console. The local file store is an initial adapter, not multi-user authentication or automatic browser sync. Keep `.r-library`, `.deps` and `local-data` ignored and out of commits.

`dist/resource-library.js` merges the MinION metadata catalog without replacing existing projects and groups protocol/checklist artifacts by family, platform and revision. Never merge different platforms just because kit names match. New revisions are new records; retain the IDs used by past experiments. Do not commit source PDFs. Attachments stay in IndexedDB and are matched to catalog digests. Optional `state.avatars` is an array keyed by category ID and participates in the shared approval/audit service. Keep avatar image formats limited to embedded PNG/JPEG/WebP, with text labels still present.

After any change, run both checks and try the flows in a browser (capture → review → accept, reload persists, export/import).
