## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- **AUTOMATIC START OF CHAT**: At the beginning of every new chat or complex task, automatically read `graphify-out/GRAPH_REPORT.md` to gain context on the architecture and god nodes before performing any research.
- **AUTOMATIC UPDATE**: After any code modification, run `graphify update .` to keep the knowledge graph, report, and visualization in sync with the current codebase (AST-only, fast, no API cost).
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files.
- If the graphify MCP server is active, utilize tools like `query_graph`, `get_node`, and `shortest_path` for precise architecture navigation instead of falling back to `grep`.
- If the MCP server is not active, the CLI equivalents are `graphify query "<question>"`, `graphify path "<A>" "<B>"`, and `graphify explain "<concept>"` — prefer these over grep for cross-module questions.
