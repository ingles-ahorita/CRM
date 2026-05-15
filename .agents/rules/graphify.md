# graphify

Canonical graphify policy for this repo. **Read this file at the start of every chat** (enforced via `.cursor/rules/session-boot.mdc` and [Agent session protocol](../../AGENTS.md#agent-session-protocol)).

This project has a knowledge graph at `graphify-out/`.

## Rules

- **START OF EVERY CHAT**: Read this file, then read `graphify-out/GRAPH_REPORT.md` (god nodes + communities relevant to the task) before any research or code changes.
- **AFTER CODE CHANGES**: After non-trivial edits, run `graphify update .` from the repo root so the graph, report, and visualization stay in sync (AST-only, fast, no API cost).
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- If the graphify MCP server is active, use `query_graph`, `get_node`, and `shortest_path` for architecture navigation instead of falling back to `grep`.
- If the MCP server is not active, prefer CLI over grep for cross-module questions: `graphify query "<question>"`, `graphify path "<A>" "<B>"`, `graphify explain "<concept>"`.
- Full CLI pipeline: `~/.agents/skills/graphify/SKILL.md` when installed.
