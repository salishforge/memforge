# memforge skill evals (draft)

- `trigger-queries.json`: 20 trigger queries (10 should fire, 10 near misses) for skill-creator's description optimizer or a `tool_used: Skill` sweep.
- `*/prompt.md` + `graders/`: behaviour cases in `claude plugin eval` format (Claude Code v2.1.269+).
- `mocks/memforge/`: fixed answers for the plugin's `memforge` MCP server.

The behaviour cases need the plugin to declare a `memforge` MCP server, because `claude plugin eval` mocks only servers the plugin declares. So they become runnable in Phase B of PACKAGING.md, once the stdio framing fix (MX-1/SR-2) ships. Until then, run the same prompts by hand, or with skill-creator against a seeded local server over REST (see "Test plan" in PACKAGING.md).

Every case appends the same system note (`agent_id alice`, project namespace `billing-api`), because eval runs do not inherit `MEMFORGE_*` variables.

Tool names in the graders assume Claude Code's plugin form, `mcp__plugin_memforge_memforge__<tool>`. Confirm this with one `claude plugin eval . --case recall-prior-decision --runs 1` before you trust the scores. If the name differs, update the `tool:` lines.
