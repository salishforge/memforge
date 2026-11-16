# MemForge plugin for Claude

This plugin teaches Claude **when** and **how** to use a self-hosted MemForge memory server. With it, Claude can:

- resume a project with what it already knows;
- recall earlier decisions, preferences and outcomes before answering;
- remember new ones;
- consolidate stored memories so they become searchable.

It works across sessions, projects and AI tools that share the same server.

**Status: 0.1.0, skill only.** The plugin contains one skill (`skills/memforge/SKILL.md`). It talks to the server over REST through a bundled helper script (`skills/memforge/scripts/memforge.py`, Python 3 standard library only), or over curl.

The plugin declares no MCP server yet. The current stdio MCP server cannot complete a handshake with standard MCP clients (audit IDs MX-1 / SR-2). The plugin will declare it once that is fixed (Phase B in [PACKAGING.md](PACKAGING.md)). Hooks and commands are also planned for a later version.

## Requirements

- A reachable MemForge server built from the `main` branch (schema migration v3.13 or later). The published npm 3.0 beta lacks features the skill relies on.
- Python 3 or curl in the shell where Claude runs.
- Do **not** `pip install memforge`. That PyPI name belongs to an unrelated project.

## Install (Claude Code)

Inside Claude Code:

```text
/plugin marketplace add salishforge/memforge
/plugin install memforge@salishforge
```

Or from a shell: `claude plugin marketplace add salishforge/memforge`, then `claude plugin install memforge@salishforge`.

On claude.ai you can instead zip `skills/memforge/` and upload it under **Customize > Skills**. The chat sandbox usually cannot reach a server on `localhost` or a private network.

## Configure

Set these in the environment Claude Code runs in:

| Variable | Default | Meaning |
|---|---|---|
| `MEMFORGE_URL` | `http://localhost:3333` | Base URL of your server |
| `MEMFORGE_TOKEN` | — | Bearer token (`MEMFORGE_TOKEN` on the server). The script never prints it. |
| `MEMFORGE_AGENT_ID` | — | One stable id per person, for example `alice`. If it is unset, Claude asks once. |
| `MEMFORGE_NAMESPACE` | `default` | Project namespace, for example the repository name |

Each script call is a Bash command that needs approval. To avoid repeated prompts, allow exactly the script by its absolute path. For example:

```text
Bash(python3 /absolute/path/to/plugins/memforge/skills/memforge/scripts/memforge.py *)
```

Don't use a broader wildcard.

## What data it sends

The plugin sends data only to the server at `MEMFORGE_URL`:

- the text Claude stores;
- the text of each query.

The server keeps both. Query text is logged in its `retrieval_log` and `knowledge_gaps` tables.

The script refuses to store content that looks like a credential. MemForge has no per-memory delete yet, so don't store anything you may need to erase.

On a shared server, all holders of one token form a single trust domain until per-user isolation ships. Treat everything you store as visible to every other holder of that token.

## Tests and evals

```bash
cd plugins/memforge
python3 -m unittest discover -s tests -v                      # script contract tests against a fake server
claude plugin validate . --strict                             # plugin manifest
```

`evals/` holds trigger queries and four behaviour cases in `claude plugin eval` format. The behaviour cases need the plugin to declare a `memforge` MCP server, so they become runnable in Phase B; see [evals/README.md](evals/README.md).

For the release plan, the channels, and the server fixes the skill is waiting on, see [PACKAGING.md](PACKAGING.md) and [../../planning/NEXT-ITERATION-PLAN.md](../../planning/NEXT-ITERATION-PLAN.md).
