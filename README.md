# PAIvik (Labgarden)

Research, kept connected. A local-first research workspace in University of Tartu style: capture notes, files and voice memos, connect them into a research graph, and review every suggested change. Everything runs and stays in the browser.

## Run locally

Requires Python 3. No dependency installation or build step is needed.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000.

## What works

- Research graph per project: click a node for details, drag (or use arrow keys) to rearrange, edit, link, unlink and delete records, and add records directly.
- Capture text notes, files (images, audio, CSV and others, up to 50 MB each) and voice notes recorded in the browser.
- A rule-based gardener suggests a record type and links (matching names and IDs such as `014`) and flags missing collection times and possible duplicates.
- Review: accept, edit then accept, or dismiss each suggestion; nothing joins the graph without it. Decided changes are kept as history.
- Research changes now show an exact before/after preview and require typing `CONFIRM`. Edits, relationships, deletions, project creation, imports and resets use the same approval service. Capturing evidence and moving graph nodes remain separate from committing research changes.
- Previews for images, audio and CSV files; download the original file.
- Several projects, data saved in IndexedDB across reloads, JSON export and import (including files), and reset to the sample.
- Light and dark mode, keyboard access, and a phone layout.

## Current scope

This is a browser-only app, not a connected laboratory system. Data is stored in the browser's IndexedDB on the user's device and is never uploaded; clearing site data deletes it, so use Export to keep a copy. Suggestions come from simple rules, not an AI model. Model inference and the PAIvik notebook (eLabFTW), Carpentries Workbench and protocols.io connections are planned integrations.

An optional **local R/Shiny + shinymcp companion** is now included. It shares the exact JavaScript validation/approval core, exposes search and draft tools, and provides a separate human approval console. It uses its own local text workspace, not automatic browser synchronization. See [local companion setup](docs/local-companion.md).

## Project structure

- `dist/index.html`: app shell (sidebar, graph/inbox/review views, capture form, About view, dialog)
- `dist/style.css`: UT theme (signature blue #2C5696, deep blue #1B365D, Rubik), dark mode and phone layout
- `dist/app.js`: storage, rendering, gardener rules, review, graph interaction, export/import
- `dist/change-service.js`: shared validation, immutable proposal previews, approval matching and audit events
- `server/workspace.cjs`: local file-backed workspace and draft service
- `R/`, `app.R`, `mcp.R`: R adapter, Shiny approval console and draft-only MCP tools
- `dist/fonts/`: Rubik webfonts (SIL Open Font License, `OFL.txt`); `dist/favicon.svg`: PAIvik mark
- `.openai/hosting.json`: existing Sites deployment configuration
- `.github/workflows/check.yml`: JavaScript syntax and local asset checks
- `.github/workflows/pages.yml`: validate and publish `dist/` to GitHub Pages

## Validate

With Node.js and Python 3 installed:

```sh
node --check dist/app.js
node --test tests/*.test.cjs
python3 scripts/check_assets.py
```

## Deployment

Pushes to `main` validate and publish `dist/` to GitHub Pages at https://peeterlaas.github.io/labgarden/. The deployment can also be run manually from Actions. The Sites deployment remains configured separately.

If initial Pages setup is blocked by repository permissions, select **GitHub Actions** in Settings → Pages → Build and deployment, then rerun the Deploy GitHub Pages workflow.

## Roadmap

- Replaceable local model adapters for tagging, extraction and link suggestions
- Import from protocols.io and the PAIvik notebook
- Human-reviewed, traceable integration writes
- Spoken confirmation, authenticated shared-server access, and automatic browser/server synchronization

Licensed under the MIT License. See [LICENSE](LICENSE).
