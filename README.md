# PAIvik (Labgarden)

Research, kept connected. A local-first research workspace in University of Tartu style: capture notes, files and voice memos, connect them into a research graph, and review every suggested change. The browser app runs and stores its data on your device; an optional local R companion uses a separate on-disk workspace.

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
- Research changes save on the click that asks for them, with no second confirmation. The toast offers **Undo**, and every change, with its exact before/after, stays under **Review → Decided changes**, so mistakes are fixed afterwards. Undo is not offered when a change adds or removes stored files (for example deleting a capture whose file nothing else uses): the history keeps the record's metadata, not the file, so export first if you may need it. Only replacing the whole workspace (reset, import) asks once. Edits, relationships, deletions, project creation, imports and resets use the same approval service. Capturing evidence and moving graph nodes remain separate from committing research changes.
- Previews for images, audio and CSV files; download the original file.
- Several projects, data saved in IndexedDB across reloads, JSON export and import (including files), and reset to the sample.
- Light and dark mode, keyboard access, and a phone layout.
- Resources and protocol version stacks, with the newest dated revision in your library first. Older records and experiment links stay intact when adding a revision.
- A MinION Sequencer starter library with separate MinION/Flongle records, full protocols, checklists and reference notes. Add it from **Resources & protocols → Add MinION library**; it is added at once and can be undone from the toast.
- Category-wide avatars: choose an emoji, initials, or a local PNG/JPEG/WebP picture up to 256 KB from **Category avatars**. Labels remain visible and avatars travel with workspace exports.

## Current scope

The browser app is not a connected laboratory system. Its data is stored in IndexedDB on the user's device and is never uploaded; clearing site data deletes it, so use Export to keep a copy. Suggestions come from simple rules, not an AI model. Model inference and the PAIvik notebook (eLabFTW), Carpentries Workbench and protocols.io connections are planned integrations.

An optional **local R/Shiny + shinymcp companion** is now included. It shares the exact JavaScript validation/approval core, exposes search and draft tools, and provides a separate human approval console. It uses its own local text workspace, not automatic browser synchronization. See [local companion setup](docs/local-companion.md).

## MinION resource library

The catalog is metadata derived from the supplied source PDFs; the PDFs themselves are not included in this repository. After approving the starter library, choose **Attach source PDFs** and select the original files on your device. Matching uses SHA-256, so duplicate copies share one source record. Files stay in IndexedDB and can be opened or downloaded from the record details. A different source file must be attached to a new revision or separate record, not overwrite an existing source identity.

Version stacks group a protocol family and platform, then group full protocols, checklists and alternate exports by revision. **Newest in library** means the newest unambiguously dated revision you have stored; no online latest-version check is performed. Unknown dates remain unranked. Use **New revision…** on a protocol to create a separate record, and attach its new source PDF. Existing experiments continue pointing to the revision they used.

The supplied MinION catalog records 14 filenames as 13 unique PDF sources. Platform labels and kit scope come from the documents, with explicit review notes where filename and document heading differ. Supporting notes are separate from protocol versions. Adding a resource to this catalog does not certify workflow compatibility.

## Project structure

- `dist/index.html`: app shell (sidebar, graph/inbox/review views, capture form, About view, dialog)
- `dist/style.css`: UT theme (signature blue #2C5696, deep blue #1B365D, Rubik), dark mode and phone layout
- `dist/app.js`: storage, rendering, gardener rules, review, graph interaction, export/import
- `dist/change-service.js`: shared validation, immutable proposal previews, approval matching and audit events
- `dist/resource-library.js`, `dist/catalogs/minion.json`: mergeable equipment catalog and protocol version grouping
- `server/workspace.cjs`: local file-backed workspace and draft service
- `R/`, `app.R`, `mcp.R`: R adapter, Shiny approval console and draft-only MCP tools
- `dist/fonts/`: Rubik webfonts (SIL Open Font License, `OFL.txt`); `dist/favicon.svg`: PAIvik mark
- `.openai/hosting.json`: existing Sites deployment configuration
- `.github/workflows/check.yml`: JavaScript syntax, local assets, core approval tests and R/MCP integration tests
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
