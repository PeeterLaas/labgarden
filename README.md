# Labgarden

Research, kept connected. An interactive concept for a local-first research assistant and model-tended knowledge graph.

## Run locally

Requires Python 3. No dependency installation or build step is needed.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000.

## What works

- Explore the sample research graph using mouse or keyboard.
- Capture notes and file metadata in the demo inbox.
- Accept or dismiss illustrative review proposals.
- Switch project context and explore three product directions.
- Reset the demo to its initial state.

## Current scope

This is a browser-only concept, not a connected laboratory system. Session state is kept in memory and resets on reload. File contents are not uploaded or processed. Model inference, durable storage, eLabFTW, Workbench, and MCP adapters are proposed future integrations.

## Project structure

- `dist/index.html`: page and interactive workspace markup
- `dist/style.css`: responsive presentation
- `dist/app.js`: demo state and interactions
- `.openai/hosting.json`: existing Sites deployment configuration
- `.github/workflows/check.yml`: JavaScript syntax and local asset checks

## Validate

With Node.js and Python 3 installed:

```sh
node --check dist/app.js
python3 scripts/check_assets.py
```

## Deployment

Serve `dist/` with any static host. The current Sites deployment remains configured separately. This repository does not automatically publish to GitHub Pages.

## Roadmap

- Durable local storage and export
- A source-backed graph data model
- Replaceable local model adapters
- Human-reviewed, traceable integration writes

Licensed under the MIT License. See [LICENSE](LICENSE).
