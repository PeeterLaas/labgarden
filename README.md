# PAIvik (Labgarden)

Research, kept connected. PAIvik is a lab's front door to its electronic notebook (eLabFTW), in University of Tartu
style: plan a run, follow it step by step at the bench, see what the workgroup is doing, and let a seminar agenda
build itself, all written into the notebook in each person's own name.

The same static page works in two ways:

- **Lab mode**, when a lab hosts it next to its own PAIvik gateway: the views below, with the lab's data staying on
  the lab's server.
- **On its own** (and always on the public site, https://peeterlaas.github.io/labgarden/): a private research
  workspace in your browser. Nothing leaves your device.

## Lab mode

Switched on when the host serves a `lab.json` that points to the lab's PAIvik gateway (a separate, private service
in front of eLabFTW). Lab data is read and written on the lab's server with each person's own notebook key and is never
stored in the browser.

- **Ask PAIvik**: one sentence in. "PCR of colonies 1–8 with 27F/1492R" opens the Planner filled in; anything else
  becomes a note in the notebook, in the person's own words.
- **Planner**: start from a recently used protocol, the workgroup's protocols and templates, an import from
  protocols.io, or a new protocol. PCR runs get a master-mix calculator, tube and gel-lane lists and an instrument
  timer; any other protocol becomes a run whose steps are copied into the experiment. A run can cite a published method
  from the institute's protocol archive.
- **Ticker**: each person's day as a feed of notebook entries, with comments, follow-up entries and **Print today** for
  a paper notebook.
- **Seminar**: the weekly agenda puts itself together from flagged entries, results and open questions; remarks go back
  to the entries as comments, so the conversation carries on.
- **Lab projects** graph from the notebook's links, and **Manuscripts**: a Materials & Methods outline compiled from
  chosen entries.
- **Lab map** of rooms, fridges, freezers and instruments, with sticky notes and "put today's products here".
- **Instruments** with live bookings; **bench screens**, small touch displays beside the work that show a run step by
  step and tick its steps (scan the screen's QR code to use it); **balances** whose live weight goes into a run.
- **Feedback**: a button on every page for bugs, ideas and questions, answered in the same place.

A person's own changes are written at once (mistakes are fixed afterwards); changes drafted by a model or an AI
assistant wait for a person to approve them on the gateway's review page. On the public site lab mode never starts.
The gateway and its deployment are private and not part of this repository.

## The browser workspace

- A research graph per project: capture notes, files (up to 50 MB) and voice memos, and connect them.
- A rule-based gardener (plain rules, not an AI model) suggests record types and links and flags missing details; you
  accept, edit or dismiss each suggestion.
- Changes save on the click, with **Undo** and a full before/after history under **Review → Decided changes**.
- Protocol version stacks and a MinION starter library ([details](docs/minion-library.md)), category avatars, JSON
  export and import, light and dark mode, keyboard access and a phone layout.
- Data lives in your browser (IndexedDB); clearing site data deletes it, so export to keep a copy.

An optional local R/Shiny companion shares the same approval core and offers draft-only tools for an AI assistant
([setup](docs/local-companion.md)).

## Run locally

Requires Python 3; nothing to install or build.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000.

## Validate

With Node.js and Python 3:

```sh
node --check dist/app.js
node --test tests/*.test.cjs
python3 scripts/check_assets.py
```

## Deployment

Pushes to `main` validate and publish `dist/` to GitHub Pages, and are mirrored (fast-forward only) to the University
of Tartu GitLab. Changes are merged on GitHub. The Sites deployment in `.openai/hosting.json` is configured separately.

## Project structure

- `dist/index.html`, `dist/style.css`, `dist/app.js`: the page, the UT theme (#2C5696, #1B365D, Rubik), and the browser
  workspace (storage, graph, gardener, review, export/import)
- `dist/lab.js`: lab mode (off unless the host serves a `lab.json`)
- `dist/change-service.js`: validation, previews, approval matching and audit events
- `dist/resource-library.js`, `dist/catalogs/minion.json`: protocol version grouping and the MinION catalog
- `server/`, `R/`, `app.R`, `mcp.R`: the optional local companion
- `dist/fonts/`: Rubik (SIL Open Font License); `dist/favicon.svg`: the PAIvik mark
- `.github/workflows/`: checks, GitHub Pages, and the GitLab mirror

## Roadmap

- Shared project and workgroup notes that every lab member's AI assistant reads, with each note's readers chosen by
  the people who write it
- Bench screens over the network, and data links to more instruments
- Synchronization between the browser workspace and the lab server

Licensed under the MIT License. See [LICENSE](LICENSE).
