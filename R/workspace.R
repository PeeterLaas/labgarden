# Shared adapter for the Shiny review UI and the MCP tool definitions.
# Run from the repository root; the Node service owns validation and commits.
paivik_request <- function(action, ...) {
  root <- Sys.getenv("PAIVIK_ROOT", unset = getwd())
  script <- normalizePath(file.path(root, "server", "workspace.cjs"), mustWork = TRUE)
  workspace <- Sys.getenv("PAIVIK_WORKSPACE", unset = file.path(root, "local-data", "workspace.json"))
  workspace <- normalizePath(workspace, winslash = "/", mustWork = FALSE)
  node <- Sys.getenv("PAIVIK_NODE", unset = Sys.which("node"))
  if (!nzchar(node)) stop("Node.js 22 or newer is required")
  input <- jsonlite::toJSON(c(list(action = action), list(...)), auto_unbox = TRUE, null = "null", digits = NA)
  old <- Sys.getenv("PAIVIK_WORKSPACE", unset = NA_character_)
  Sys.setenv(PAIVIK_WORKSPACE = workspace)
  on.exit(if (is.na(old)) Sys.unsetenv("PAIVIK_WORKSPACE") else Sys.setenv(PAIVIK_WORKSPACE = old), add = TRUE)
  output <- suppressWarnings(system2(node, shQuote(script), input = input, stdout = TRUE, stderr = FALSE))
  status <- attr(output, "status")
  if (!length(output) || !nzchar(paste(output, collapse = ""))) {
    stop(sprintf("Workspace service returned no response (exit status %s). Check the Node executable and service path.", if (is.null(status)) 0L else status), call. = FALSE)
  }
  response <- tryCatch(jsonlite::fromJSON(paste(output, collapse = "\n"), simplifyVector = FALSE),
    error = function(e) stop("Workspace service returned an invalid response. Check the local Node service.", call. = FALSE))
  if (!isTRUE(response$ok)) stop(response$error, call. = FALSE)
  if (!is.null(status) && status != 0L) stop(sprintf("Workspace service failed (exit status %s)", status), call. = FALSE)
  response$result
}

paivik_json <- function(value) {
  jsonlite::toJSON(value, auto_unbox = TRUE, pretty = TRUE, null = "null", digits = NA)
}
