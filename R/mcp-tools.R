# Only read and draft operations are registered. Approval/commit are not MCP tools.
paivik_tools <- function(request = paivik_request) {
  list(
    ellmer::tool(function(query = "", project_id = "") {
      list(records = paivik_json(request("search", query = query, project = project_id)))
    }, name = "search_records", description = "Search the local research records. Returns up to 50 matches; does not change records.",
    arguments = list(query = ellmer::type_string("Text to find", required = FALSE), project_id = ellmer::type_string("Optional project ID", required = FALSE)),
    annotations = ellmer::tool_annotations(read_only_hint = TRUE)),
    ellmer::tool(function(record_id) {
      list(record = paivik_json(request("get", id = record_id)))
    }, name = "get_record", description = "Read a research record and its relationships.",
    arguments = list(record_id = ellmer::type_string("Exact record ID")),
    annotations = ellmer::tool_annotations(read_only_hint = TRUE)),
    ellmer::tool(function(project_id, text, experiment_id = "") {
      list(proposal = paivik_json(request("draft_observation", project = project_id, text = text, experiment = experiment_id)))
    }, name = "draft_observation", description = "Draft a text observation and optional experiment link. Saves a pending proposal only. A person must review and confirm it in the local Shiny approval app.",
    arguments = list(project_id = ellmer::type_string("Exact project ID; use workspace_status first"), text = ellmer::type_string("Original observation text"), experiment_id = ellmer::type_string("Optional exact experiment ID", required = FALSE)),
    annotations = ellmer::tool_annotations(read_only_hint = FALSE)),
    ellmer::tool(function(record_id, title, text, reason) {
      list(proposal = paivik_json(request("draft_update", id = record_id, title = title, text = text, reason = reason)))
    }, name = "draft_record_update", description = "Propose a replacement title and description for an existing record. Does not commit. Read the record first and preserve information the user did not ask to change.",
    arguments = list(record_id = ellmer::type_string("Exact record ID"), title = ellmer::type_string("Proposed complete title"), text = ellmer::type_string("Proposed complete description"), reason = ellmer::type_string("Why this change is proposed")),
    annotations = ellmer::tool_annotations(read_only_hint = FALSE)),
    ellmer::tool(function(proposal_id) {
      list(proposal = paivik_json(request("preview", id = proposal_id)))
    }, name = "preview_proposal", description = "Read an exact pending proposal. Reading it is not user approval.",
    arguments = list(proposal_id = ellmer::type_string("Exact proposal ID")),
    annotations = ellmer::tool_annotations(read_only_hint = TRUE)),
    ellmer::tool(function() {
      list(workspace = paivik_json(request("status")), proposals = paivik_json(request("list")))
    }, name = "workspace_status", description = "List local projects, record count and pending proposals. Review and commit with the local Shiny app; no model approval tool exists.",
    arguments = list(), annotations = ellmer::tool_annotations(read_only_hint = TRUE))
  )
}
