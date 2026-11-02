# Rscript mcp.R -- stdio MCP server. No approval tool is registered.
entry <- grep("^--file=", commandArgs(), value = TRUE)
if (length(entry)) setwd(dirname(normalizePath(sub("^--file=", "", entry[[1]]), mustWork = TRUE)))
if (dir.exists(".r-library")) .libPaths(c(normalizePath(".r-library"), .libPaths()))
source("R/workspace.R")
source("R/mcp-tools.R")
ui <- shiny::fluidPage(
  shiny::titlePanel("PAIvik research tools"),
  shiny::p("Tools can search and draft. Open the local Shiny review app to approve exact changes."),
  shiny::h3("Workspace"), shiny::verbatimTextOutput("workspace"),
  shiny::h3("Records"), shiny::verbatimTextOutput("records"),
  shiny::h3("Record"), shiny::verbatimTextOutput("record"),
  shiny::h3("Proposal awaiting human review"), shiny::verbatimTextOutput("proposal"),
  shiny::h3("Pending proposals"), shiny::verbatimTextOutput("proposals")
)
app <- shinymcp::mcp_app(ui, tools = paivik_tools(), name = "paivik-research")
shinymcp::serve(app)
