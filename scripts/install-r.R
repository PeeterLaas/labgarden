# Install into an ignored project library, without changing the user's R library.
dir.create(".r-library", showWarnings = FALSE)
.libPaths(c(normalizePath(".r-library"), .libPaths()))
install.packages(c("shiny", "ellmer", "jsonlite", "remotes"), lib = ".r-library", repos = "https://cloud.r-project.org")
remotes::install_github("JamesHWade/shinymcp@0476fcf54a66bf82b0d8a1c0ab3bc516629b0a6b", lib = ".r-library", dependencies = NA, upgrade = "never")
