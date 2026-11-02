# Local single-owner approval console. Launch with shiny::runApp('.', host='127.0.0.1').
if (dir.exists(".r-library")) .libPaths(c(normalizePath(".r-library"), .libPaths()))
source("R/workspace.R", local = TRUE)
ui <- shiny::fluidPage(
  shiny::titlePanel("PAIvik — local approval console"),
  shiny::p("Single-owner local prototype. Review the exact before/after values, then type CONFIRM and commit. Models cannot use this approval control."),
  shiny::actionButton("refresh", "Refresh pending proposals"),
  shiny::selectInput("proposal_id", "Pending proposal", choices = character()),
  shiny::actionButton("preview", "Load exact preview"),
  shiny::verbatimTextOutput("change_preview"),
  shiny::textInput("confirmation", "Type CONFIRM for the displayed revision", value = ""),
  shiny::actionButton("commit", "Confirm and commit displayed changes"),
  shiny::verbatimTextOutput("result"),
  shiny::hr(), shiny::h3("Bring in a text-only browser workspace"),
  shiny::fileInput("browser_export", "PAIvik JSON export (text-only)", accept = ".json"),
  shiny::actionButton("draft_import", "Prepare import for review"),
  shiny::downloadButton("export", "Export local workspace")
)
server <- function(input, output, session) {
  displayed <- shiny::reactiveVal(NULL)
  result <- shiny::reactiveVal("No changes committed.")
  refresh <- function() {
    proposals <- paivik_request("list")
    choices <- stats::setNames(vapply(proposals, function(p) p$id, ""), vapply(proposals, function(p) paste(p$reason, p$id), ""))
    shiny::updateSelectInput(session, "proposal_id", choices = choices)
  }
  safely <- function(f) tryCatch(f(), error = function(e) { result(conditionMessage(e)); NULL })
  shiny::observeEvent(input$refresh, { displayed(NULL); safely(refresh) }, ignoreNULL = FALSE)
  shiny::observeEvent(input$proposal_id, { displayed(NULL); shiny::updateTextInput(session, "confirmation", value = "") })
  shiny::observeEvent(input$preview, {
    displayed(NULL)
    p <- safely(function() paivik_request("preview", id = input$proposal_id))
    displayed(p)
    shiny::updateTextInput(session, "confirmation", value = "")
  })
  output$change_preview <- shiny::renderText({
    p <- displayed()
    if (is.null(p)) "Load a proposal before confirming." else paivik_json(p)
  })
  shiny::observeEvent(input$commit, {
    safely(function() {
      p <- displayed()
      if (is.null(p) || !identical(input$confirmation, "CONFIRM")) stop("Load the preview and type CONFIRM first")
      approval <- list(confirmed = TRUE, proposalId = p$id, revision = p$revision, hash = p$hash,
        actor = Sys.getenv("PAIVIK_OWNER", unset = "local-user"), method = "typed")
      committed <- paivik_request("commit", id = p$id, confirmation = approval)
      result(paivik_json(committed)); displayed(NULL)
      shiny::updateTextInput(session, "confirmation", value = "")
      refresh()
    })
  })
  shiny::observeEvent(input$draft_import, {
    safely(function() {
      shiny::req(input$browser_export)
      exported <- jsonlite::fromJSON(input$browser_export$datapath, simplifyVector = FALSE)
      p <- paivik_request("draft_import", export = exported)
      result(paste("Import proposal prepared:", p$id)); displayed(NULL); refresh()
    })
  })
  output$result <- shiny::renderText(result())
  output$export <- shiny::downloadHandler(filename = function() "paivik-local-export.json", content = function(file) {
    writeLines(paivik_json(paivik_request("export")), file, useBytes = TRUE)
  })
}
shiny::shinyApp(ui, server)
