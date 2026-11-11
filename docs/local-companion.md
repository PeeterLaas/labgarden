# Approval service and local Shiny MCP companion

The browser app and the optional R companion share `dist/change-service.js`. Both prepare structured before/after changes, validate them, require explicit confirmation, commit the approved revision, and append an audit event. A model can search and draft through MCP; it cannot approve through the registered tools.

## Browser workflow

Accepting or editing a suggestion commits it straight away: the click is the decision. The toast offers **Undo**, and the exact before/after is kept under **Review → Decided changes**. Only reset and import, which replace the whole workspace, ask once. Record creation, editing, linking, unlinking, deletion, project creation, capture deletion, flag decisions, import and reset use the same boundary. Capturing evidence, selecting draft links and rearranging the graph do not themselves commit scientific changes.

The proposal includes a SHA-256 content digest and the expected workspace snapshot. A changed preview, mismatched user/revision, stale workspace or repeated commit is rejected. Approval commits persist browser state and associated file changes together in one IndexedDB transaction. Capture intake writes files before the debounced state save; an interruption between them can leave a capture absent after reload. Another tab cannot silently overwrite newer research content. The Review history shows approved operations and the original values.

This is a single-user application boundary, not a security boundary against someone who controls the browser console, operating-system account or workspace files. History is application-maintained, not a tamper-evident regulatory audit trail. Existing pre-service decisions are retained in legacy proposal data but do not acquire invented approval events. Spoken confirmation is not implemented yet.

## Install the local companion

Requires Node.js 22+, R 4.3+ and the R packages Shiny, ellmer, jsonlite and shinymcp. Run from the repository root:

```sh
Rscript scripts/install-r.R
Rscript -e '.libPaths(c(normalizePath(".r-library"), .libPaths())); shiny::runApp(".", host="127.0.0.1", port=8767)'
```

Open `http://127.0.0.1:8767`. Dependencies are installed in the ignored `.r-library/` directory. The installer and CI pin shinymcp to the revision tested with this implementation, `0476fcf54a66bf82b0d8a1c0ab3bc516629b0a6b`; its API is under development.

By default the local workspace is `local-data/workspace.json`. Configure `PAIVIK_WORKSPACE` to an absolute file path and optionally `PAIVIK_OWNER` to a local owner label. Use the same values for Shiny and MCP. `PAIVIK_NODE` can identify a specific Node executable. These values come from the process environment, not model arguments.

The owner label is not authentication. Keep the console on loopback for a trusted single owner. Shared or internet-facing deployment requires real identity, authorization and operational hardening first. This change does not install a Linux service or expose a public endpoint.

## Register MCP

Example desktop client configuration (replace the paths):

```json
{
  "mcpServers": {
    "paivik": {
      "command": "Rscript",
      "args": ["/absolute/path/to/labgarden/mcp.R"],
      "env": {
        "PAIVIK_WORKSPACE": "/absolute/path/to/paivik-data/workspace.json"
      }
    }
  }
}
```

The entry script resolves its own directory, so the client need not start in the repository. It serves MCP over stdio with a small Shiny UI resource showing tool results. The separate local Shiny approval console is the only supplied user approval interface; approval is not embedded into model tools.

Available tools:

| Tool | Behavior |
| --- | --- |
| `workspace_status` | List projects, record count and pending proposals |
| `search_records` | Search up to 50 matching records |
| `get_record` | Read a record and relationships |
| `draft_observation` | Save a proposal for a text observation, optionally linked to an existing experiment |
| `draft_record_update` | Save a proposed complete title/description replacement |
| `preview_proposal` | Read the exact pending proposal |

Example: ask the model to call `workspace_status`, then draft an observation in project `p-local`. No research record is added. In the local Shiny console, refresh, select the proposal and load its exact preview. Type `CONFIRM` and commit. A stale proposal must be redrafted; the model cannot bypass that requirement.

Committing changes the workspace, so it also removes any other pending proposals prepared against the old version and lists them in its result; draft them again if they are still wanted. Older proposals that can no longer commit appear as `[out of date]`. To drop a proposal yourself, select it and choose **Discard selected proposal**. Discarding is available only in the Shiny console, never as a model tool, and does not change research records.

Drafts and approved records survive restarts. The initial local adapter uses a lock file and atomic replacement of a JSON workspace. A concurrent request fails closed rather than overwriting another process. After a crash, inspect the workspace and the PID in its `.lock` file before manually removing a genuinely stale lock. Back up the workspace regularly. Database-scale concurrency and power-loss durability are outside this adapter's guarantee.

## Move text workspaces between browser and companion

The browser and companion are separate stores using the same data schema and approval core. No automatic sync or network bridge is installed.

1. Export a text-only browser workspace.
2. In the local Shiny console, upload the export and select **Prepare import for review**.
3. Load and confirm that import proposal. Existing local records are replaced only after approval; local audit history is retained.
4. Search and draft through MCP, then review changes in Shiny.
5. Export the local workspace and import it into the browser; the browser asks once before replacing its workspace.

The companion rejects file-bearing imports instead of losing or uploading attachments. Keep recordings, photos and file-bearing workspaces in the browser for now. Imported history is not treated as locally verified approval history.

## Validation

```sh
node --check dist/app.js
node --check dist/change-service.js
node --test tests/*.test.cjs
python3 scripts/check_assets.py
Rscript tests/integration.R
node tests/mcp-stdio.cjs
```

If Rscript is not on PATH, set `RSCRIPT_BIN` to its executable for the stdio test. The R integration test exercises real shinymcp functions through the Node adapter. The stdio test performs the actual MCP handshake, tool listing, drafting and rejection of an unavailable commit tool. No model credentials are required.

Upstream API references: [rewriting as tools](https://jameshwade.github.io/shinymcp/articles/rewriting-as-tools.html), [shinymcp](https://github.com/JamesHWade/shinymcp).
