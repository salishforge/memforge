# MemForge MCP tools: intent → tool

Read this only when MemForge tools appear in your tool list. The fully qualified form is `memforge:memforge_query`; Claude Code shows it as `mcp__memforge__memforge_query`, and a plugin install adds a plugin prefix to the server name.

These tools reach you only through a server version whose stdio transport speaks standard MCP framing, or through a future remote endpoint. If the tools are absent, use `scripts/memforge.py` or `rest-api.md`. Do not try to install or configure the MCP server yourself.

## Contents

- Rules that differ from REST
- Core tools
- Gaps: when to fall back to REST
- App-defined tools with the same names
- Tools to leave alone

## Rules that differ from REST

- **`agent_id` on every call.** The server has no default agent. Pass the same stable id every time (see Setup in SKILL.md).
- **`namespace` on every call.** Pass it explicitly on reads (`memforge_query`, `memforge_timeline`, `memforge_stats`), even when the server was launched with `MEMFORGE_NAMESPACE`. That variable reaches writes (add, consolidate) but read routes ignore it, so a read without `namespace` searches `default`.
- **Results and errors.** Results are the JSON `data` part of the REST response. Errors come back as text starting with `Error:`.
- **Limits.** The MCP server rejects any `limit` outside 1–200, even where a tool's schema says 500. Some routes are tighter: `memforge_active_recall` takes at most 20, `memforge_principles` at most 50.

## Core tools

| Intent | Tool | Arguments to set |
|---|---|---|
| Is memory reachable, and how big is it? | `memforge_stats` | `agent_id`, `namespace` |
| Recall before answering | `memforge_query` | `agent_id`, `q` (short and single-topic, no time words), `namespace`, `limit` 8, `snippet_tokens` 1500. Leave `mode` unset: `semantic` fails when the server has no embeddings |
| Recall when the namespace is `default` | `memforge_active_recall` | `agent_id`, `context`, `limit` up to 20. It also returns learned procedures. It cannot take a namespace and always searches `default`, and it returns full content with no dates or status, so use `memforge_query` everywhere else |
| Store one memory | `memforge_add` | `agent_id`, `content` (turn-marked note), `namespace`, optional `metadata` |
| Make stored memories searchable | `memforge_consolidate` | `agent_id`, `namespace` (leave `mode` unset) |
| What was stored recently | `memforge_timeline` | `agent_id`, `namespace`, `from` (ISO; always set it, because results run oldest first) |
| Should maintenance run? | `memforge_sleep_advisory` | `agent_id` |
| Run maintenance (asked for only, LLM required) | `memforge_dreams_create`, then `memforge_dreams_status` | Create: `agent_id`, `namespace`. Status: `agent_id`, `run_id` (the `id` that create returned). Poll a few times, then stop |
| Why is a memory ranked as it is | `memforge_explain` | `agent_id`, `warm_id` (the `id` of one of your own query results, as a string; not a pool result) |
| Archived memories (asked for only) | `memforge_cold_search`, then `memforge_cold_restore` | Search: `agent_id`, `q` (substring), `namespace`. Restore: `agent_id`, `cold_id` (the `id` from the search) |

## Gaps: when to fall back to REST

When a shell is available, use `scripts/memforge.py` for these:

- **Session-start resume:** there is no `memforge_resume` tool. Use `memforge.py resume`, or call `memforge_query` with a broad project query.
- **Typed, dated or correcting writes:** `memforge_add` cannot set `outcome_type`, `occurred_at` or `hints.supersedes`. Without a shell:
  - write the type and date into the content ("Decision (2026-03-02): …");
  - for a correction, state it explicitly ("Correction: supersedes the earlier note that …").
- **Time-bounded or identifier queries:** `memforge_query` has no `after`, `before`, `max_tokens` or `code` mode.

## App-defined tools with the same names

An application can define tools from `@salishforge/memforge/tools` and run them itself, without the MCP server. Those definitions share most tool names but not every parameter. Check each tool's schema before relying on this file:

- `memforge_query` there takes `after` and `before`, but has no `snippet_tokens`. Results then carry full content, so ask for fewer results (`limit` 5).
- `memforge_add` there takes `session_id`, but still has no `outcome_type`, `occurred_at` or `hints`.
- `memforge_sleep_advisory` and the namespace-deprecation tools are absent.

## Tools to leave alone

Do not call these unless the user explicitly asks for that operation:

- **Feedback:**
  - `memforge_feedback`: query results do not yet carry the retrieval ids it needs (RA-11).
  - `memforge_record_procedure_outcome` belongs with it.
- **Synchronous sleep:** `memforge_sleep` blocks for minutes and needs an LLM. Prefer dream runs, and only when asked.
- **LLM synthesis:** `memforge_reflect` and `memforge_meta_reflect` need an LLM and cost tokens.
- **Always empty, or duplicates:**
  - `memforge_mental_models` always returns nothing.
  - `memforge_certainty` is `memforge_query` with an epistemic filter.
  - `memforge_health` gives quality metrics, not reachability.
- **Shared pools and other agents' knowledge:** `memforge_publish_procedures`, `memforge_shared_procedures`, `memforge_expertise` and `memforge_bootstrap`. Pool access has no roles yet, and published content cannot be recalled.
- **Destructive or outward-facing:**
  - `memforge_deprecate_namespace` and `memforge_undeprecate_namespace`;
  - `memforge_set_validity`;
  - `memforge_anthropic_push`, `memforge_anthropic_pull` and `memforge_anthropic_sync_state`;
  - `memforge_dreams_cancel`, except to stop a run you started.
- **Graph and analytics:** `memforge_entities`, `memforge_graph`, `memforge_procedures`, `memforge_reflections`, `memforge_principles`, `memforge_causal_chain`, `memforge_predict`, `memforge_drift`, `memforge_epistemic_profile`, the role tools, `memforge_dedup_entities` and `memforge_dreams_list`. Use them only to answer a direct question about that data.
