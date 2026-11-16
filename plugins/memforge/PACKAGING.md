# Packaging and shipping the MemForge skill (G1)

*Draft of 2026-11-16, for the `salishforge/memforge` maintainers.*

Spec details were checked against the official docs on 2026-11-16. Code details were checked against `main` (commit `16e2f15`, 2026-07-29).

## Summary

- **What ships, and when** (release train in [NEXT-ITERATION-PLAN §4](../../planning/NEXT-ITERATION-PLAN.md)):
  - **Skill 0.1 (Phase A)** with v3.13.0 (RT-1): REST transport through `scripts/memforge.py`, as a Claude Code plugin from a marketplace in this repository, plus claude.ai and Cowork zips.
  - **Skill 1.0 (Phase B)** with v3.14.0 (RT-2): stdio MCP on AP-1's 10-tool core.
  - **Phase C1** at RT-3, on U-5a (remote Streamable HTTP): Claude Code HTTP transport, the Messages API MCP connector, a single-user claude.ai custom connector, ChatGPT through Secure MCP Tunnel. **Phase C2** at RT-4, on U-5b (OAuth resource server): per-user OAuth and directory submissions.
- **Channels:** the in-repo marketplace; skill and plugin zips; the Claude API skills endpoint; skills.sh (`npx skills add`).
- **CI test gates:** steps 1–2 (static checks, script contract tests) in RT-1, with one manual run of steps 4–5 before the GA announcement; steps 3–5 (live REST, trigger evals, behaviour evals) in CI from RT-2.
- **Open questions (§10):** eval tool naming, skills.sh discovery, claude.ai sandbox network, auto-recall default, consolidation cadence, the script permission rule.

The 2026-11-16 verification pass against the code is in Appendix A.

## Contents

1. What is in this folder, and what works today
2. Spec compliance
3. Distribution channels
4. Proposed repository layout
5. Code changes that must come before or with the skill
6. Traceability: skill text and the finding behind it
7. Test plan
8. What we took from competitors, and what we didn't
9. Sequencing and effort
10. Open questions
11. Appendix A: verification pass (2026-11-16)

Effort sizes:

- **S:** under 1 day.
- **M:** 1–5 days.
- **L:** more than a week of focused work.

"Sessions" are AI coding sessions of about 2–3 hours each.

Evidence labels:

- Audit IDs (RA, SC, PERF, SR, SEC, MX, ARCH) come from the October 2026 audit, with its verification status: **confirmed**, **partial** or **unverified**.
- **NEW-n** marks a problem found while writing this skill, with file and line evidence. NEW findings were not in the October audit.

---

## 1. What is in this folder, and what works today

```text
.claude-plugin/marketplace.json         # repository root: marketplace "salishforge" → ./plugins/memforge
plugins/memforge/
├── .claude-plugin/plugin.json          # 0.1.0; no userConfig, hooks or .mcp.json yet (Phase A remainder, Phase B)
├── README.md                           # what it does, how to install and configure it, what data it sends
├── skills/memforge/                    # the skill: copy as-is into a zip or .agents/skills
│   ├── SKILL.md                        # 238 lines in all, ~4k tokens in the body
│   ├── references/rest-api.md          # curl recipes, checked against src/app.ts
│   ├── references/mcp-tools.md         # intent → tool map and the gaps in the current tools
│   └── scripts/memforge.py             # REST helper, Python 3 standard library only
├── evals/                              # trigger queries, 4 behaviour cases, MCP mocks
├── tests/test_memforge_cli.py          # 12 contract tests for the script against a fake server (all pass)
└── PACKAGING.md                        # this file
```

**What works today.** The skill works on `main` through the REST API. Claude runs `scripts/memforge.py`, or curl as a fallback, from any surface that has a shell with network access to the server. In practice that means Claude Code, and Cowork sessions that run on the user's computer.

**What does not work yet.** MCP is not usable yet. The stdio server frames messages with LSP-style `Content-Length` headers, but MCP stdio is newline-delimited JSON-RPC. The MCP spec (2025-11-25 transports page) says: "Messages are delimited by newlines, and MUST NOT contain embedded newlines". So standard clients never get an `initialize` reply. See **MX-1 / SR-2** (critical, confirmed; `src/mcp.ts:1004-1007, 1085-1103`, re-read in this task).

The skill states this dependency explicitly. It uses MemForge MCP tools only when they appear in the tool list. When they are missing, it falls back to REST.

**Why a script and not only curl recipes.** The script removes the five most common ways a REST call silently goes wrong:

1. **Namespace dropped on reads.** It adds the namespace to every call. Read routes ignore the namespace header (NEW-1).
2. **Content broken by escaping.** It builds JSON correctly for multi-line content.
3. **"today" in a query.** It refuses the query (RA-3), because the server turns "today" into a filter that matches nothing.
4. **Credentials in content.** It refuses content shaped like a credential before anything leaves the machine.
5. **Missing dates.** It prints each result's event date, epistemic status and pool provenance, which the server never puts in front of the reader (RA-20).

The script also retries a failed hybrid query in keyword mode (SR-10). It is the cheap, client-side version of the RA-20 "reader-facing context" fix.

---

## 2. Spec compliance

Every row below was checked on 2026-11-16 against the source listed with it.

| Rule | Source | How this skill complies |
|---|---|---|
| `name`: 1–64 characters of `a-z`, `0-9` and `-`. No leading, trailing or doubled hyphens. Must match the folder name | agentskills.io/specification | `memforge`, in folder `memforge/` |
| `name` and `description` may not contain XML tags. `name` may not contain `anthropic` or `claude` | platform.claude.com …/agent-skills/best-practices and overview | Complies. The description contains no `<` or `>` |
| `description`: 1–1,024 characters, saying both what the skill does and when to use it. Third person | spec; best-practices ("Always write in third person") | 979 characters. Opens with "Stores and recalls …", then a "Use this skill whenever …" clause and near-miss exclusions |
| Claude Code truncates `description` plus `when_to_use` at 1,536 characters in the skill listing, so the key use case should come first | code.claude.com/docs/en/skills | Memory recall and storage come first |
| Outside Claude Code, only six frontmatter keys are accepted: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Any other key is a hard error on upload | code.claude.com/docs/en/skills | The skill uses `name`, `description`, `license`, `compatibility` (277 of 500 characters) and `metadata` (a map of strings to strings) |
| Keep the body under 500 lines, with instructions under about 5k tokens | spec ("Progressive disclosure"); best-practices | The body is 230 lines and about 4k tokens (characters ÷ 4). It is close enough to the guideline that new text should replace old text, not add to it |
| Keep references one level deep, and give files over 100 lines a table of contents | best-practices | `rest-api.md` and `mcp-tools.md` are linked from SKILL.md and both have a Contents list |
| Reference scripts as `${CLAUDE_SKILL_DIR}/scripts/…`. Claude Code and Cowork substitute it. claude.ai copies the folder, so the relative path must stay readable too | claude.com/docs/skills/how-to | SKILL.md uses both forms |
| Name MCP tools in full, as `ServerName:tool_name` | best-practices ("MCP tool references") | `mcp-tools.md` uses `memforge:memforge_query` and also notes the Claude Code form |
| No credentials in skill files | how-to ("Don't put API keys …") | The skill holds none. The token comes from the environment or plugin config |
| "When a script needs to reach an outside service, have Claude use a connector for that service instead" | how-to ("Add scripts") | Not met yet. The script is a stopgap until a remote MCP endpoint exists (section 5, P2; Phase C1). Say so in the plugin README |
| A skill uploaded to claude.ai is a zip whose top-level entry is the skill folder | how-to ("Package your skill") | `zip -r memforge.zip memforge/` |

**Validation run.** `claude plugin validate --strict` passes for both the plugin and the repository marketplace (2026-11-16). With `--profile directory` the only finding is ICON_MISSING: a square PNG icon is still needed before a directory submission. `skills-ref validate` was not run, because installing it was blocked; frontmatter was instead parsed with PyYAML and checked against the rules above. Run both validators in CI (test plan, step 1).

---

## 3. Distribution channels

### 3.1 Claude Code plugin and marketplace in this repository (primary channel)

The plugin and marketplace formats below were checked on 2026-11-16 against `code.claude.com/docs/en/plugins-reference` and `/plugins/marketplace-reference.md`.

**Install:**

```bash
claude plugin marketplace add salishforge/memforge      # or /plugin marketplace add salishforge/memforge
claude plugin install memforge@salishforge
```

**Names:**

- `memforge` is a valid plugin name. Names that start with `claude-` or `anthropic-`, or are close imitations of them, are reserved.
- `salishforge` is a valid marketplace name. It is not on the reserved list, and the reserved prefix `claudeai-` does not apply.

**`.claude-plugin/marketplace.json` (repository root):**

```json
{
  "name": "salishforge",
  "owner": { "name": "Salish Forge", "url": "https://github.com/salishforge" },
  "description": "MemForge plugins: long-term memory for Claude via a self-hosted MemForge server",
  "plugins": [
    { "name": "memforge", "source": "./plugins/memforge", "category": "memory",
      "description": "When and how to use a self-hosted MemForge memory server" }
  ]
}
```

Relative plugin sources resolve when the marketplace is added from GitHub or git. The repository is 2.6 MB without `.git`, so cloning the whole repo as a marketplace is fine.

**`plugins/memforge/.claude-plugin/plugin.json`:**

```json
{
  "name": "memforge",
  "displayName": "MemForge memory",
  "version": "0.1.0",
  "description": "Long-term memory for Claude through a self-hosted MemForge server: resume, recall, remember, consolidate.",
  "author": { "name": "Salish Forge", "url": "https://github.com/salishforge" },
  "homepage": "https://github.com/salishforge/memforge",
  "repository": "https://github.com/salishforge/memforge",
  "license": "MIT",
  "keywords": ["memory", "mcp", "postgres", "self-hosted"],
  "userConfig": {
    "memforge_url":   { "type": "string", "title": "MemForge URL", "description": "Base URL of your MemForge server", "default": "http://localhost:3333" },
    "memforge_token": { "type": "string", "title": "MemForge token", "description": "Bearer token (MEMFORGE_TOKEN on the server)", "sensitive": true },
    "agent_id":       { "type": "string", "title": "Agent id", "description": "One stable id for you, e.g. alice", "required": true },
    "namespace":      { "type": "string", "title": "Default namespace", "description": "Leave empty to use the git repository name", "default": "" }
  }
}
```

**Hooks.** Hooks run only in Claude Code and Cowork; claude.ai chat ignores them (`claude.com/docs/plugins/platform-support`). They are therefore conveniences, never required behaviour. The skill must work without them. Every hook fails open, a lesson borrowed from Mem0: "Mem0 never blocks normal Claude Code work when a hook fails".

- **`SessionStart`, matchers `startup|resume|compact`** (`hooks/session-start.sh`):
  1. Bridges plugin config into Bash. It writes `export MEMFORGE_URL=…`, `MEMFORGE_AGENT_ID`, `MEMFORGE_NAMESPACE` (defaulting to the git repository name) and `MEMFORGE_TOKEN` to `$CLAUDE_ENV_FILE`. The hook receives these values as `CLAUDE_PLUGIN_OPTION_<KEY>`.
     - `CLAUDE_ENV_FILE` exists only for SessionStart, Setup, CwdChanged and FileChanged hooks, and not under PowerShell (`code.claude.com/docs/en/hooks`).
     - On Windows without Git Bash, users set the variables themselves.
  2. Runs `memforge.py resume --chars 300`, with a 5-second timeout, and prints the output to stdout. SessionStart stdout becomes context.
  3. The `compact` matcher re-injects that context after compaction.
- **`PreCompact`:** prints one line that becomes an instruction for the compaction summary: "List decisions, preferences and outcomes from this session that were not yet stored in MemForge." Claude can then still store them after compaction. This hook stores nothing itself.
- **`SessionEnd`:** runs `memforge.py consolidate`. SessionEnd hooks share a 1.5-second budget unless the hook's `timeout` raises it (up to 60 seconds). Set `timeout: 10`. Fails open.
- **Not in v0.1:** per-prompt auto-recall (`UserPromptSubmit`), as Supermemory and Mem0 do. The reasons are latency, the 100 requests/minute per-IP limit (PERF-10, confirmed), and noise. Offer it later as an opt-in `auto_recall` option. Mem0 limits automatic search to the first prompt, with up to 5 memories.

**Commands.** `commands/status.md` (runs check and advisory), `commands/remember.md` and `commands/recall.md`. In chat, commands load as skills.

**MCP servers:**

- **Phase A (skill 0.1, v3.13.0):** declare no `.mcp.json`. v3.13.0 fixes the stdio framing (TT-10), but the plugin stays on the REST script until skill 1.0, so the evals and the 10-tool core arrive together. (On today's `main` the stdio server would hang the client, MX-1.)
- **Phase B (with skill 1.0 in v3.14.0, RT-2):** declare a stdio server pinned to a version, for example `npx -y -p @salishforge/memforge@<ver> memforge-mcp`, with `env` taken from `${user_config.*}`.
- **Phase C1 (RT-3, after U-5a):** declare `{"type":"http","url":…}`. A URL that contains `${user_config.*}` is ignored in chat, so chat users add their server as a custom connector instead (single-user, beta static headers, until C2).
- **Phase C2 (RT-4, after U-5b):** per-user OAuth through the user's own OIDC IdP (E0-8 recipes) or the reference Keycloak compose; directory submissions.

**Also:**

- No top-level `bin/`. A plugin with one cannot be installed on claude.ai or in Cowork.
- **Permission prompts.** Each script run is a Bash call that needs approval. Document a permission rule that names the script's absolute path, such as `Bash(python3 /abs/path/memforge.py *)`. Do not offer a broad wildcard (how-to: "a wildcard before the path would approve more than you intend").

### 3.2 claude.ai and Cowork

Sources: the skills overview, `claude.com/docs/skills/how-to` and `claude.com/docs/plugins/build`.

**Skill only:**

- Zip the `memforge/` folder and upload it under **Customize > Skills**.
- Available on Pro, Max, Ultra, Team and Enterprise plans, with code execution enabled.
- Network access in the chat sandbox "might be full, partial, or none" depending on admin settings. A server on `localhost` or a private network is unreachable from it. So on claude.ai the skill mostly helps once a remote connector exists (Phase C1 for one user; C2 for per-user OAuth).

**Whole plugin:**

- Zip the plugin folder and upload it under **Customize > Plugins > Add > Upload plugin**.
- A plugin installed on the account also appears in Claude Code as a synced plugin.
- Team and Enterprise owners can sync a GitHub marketplace and set each plugin to Not available, Available to install, Installed by default, or Required. This is the natural G2 rollout path.

**Anthropic directory:**

- Submit the *plugin*. Skills alone cannot be submitted.
- Requirements: a public GitHub repository, a README of at least 40 words, and a license.
- Every version gets automated validation and a security scan, and new listings get human review.
- Directory listing fields (`icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`) go in `plugin.json`.
- A listed *connector* needs a remote MCP URL with OAuth (Phase C2) at a public HTTPS endpoint, which a self-hosted product does not have. Whether to run a demo endpoint is an owner decision (NEXT-ITERATION-PLAN decision 19), as are the privacy-policy and terms URLs the listing fields need.

### 3.3 Claude API skills endpoint

Sources: `platform.claude.com/docs/en/build-with-claude/skills-guide` and the overview.

**Upload:**

- `POST /v1/skills` with multipart `files[]` or a zip.
- Under 30 MB uncompressed, and up to 20 skills per request.
- Each version is a complete snapshot.
- Skills are visible to the whole workspace.

**Use.** Attach the skill through `container.skills` (`type: custom`) together with the code execution tool.

**Constraint.** API skills run "with no network access and no runtime package installation", so the script and curl cannot reach MemForge. The skill still works as guidance in two setups:

- **App-defined tools.** The app defines tools from `@salishforge/memforge/tools` (`src/tool-definitions.ts`) and executes them itself. `mcp-tools.md` covers this case in its section "App-defined tools with the same names". The two tool sets are close but not identical: `tool-definitions.ts` has 42 of the MCP server's 46 tools (no `memforge_sleep_advisory`, no namespace-deprecation tools), and its `memforge_query` takes `after`/`before` but not `snippet_tokens`. Both share the other MX-6 gaps. Generating both from one source (MX-6) removes the difference.
- **MCP connector.** The Messages API MCP connector points at a *remote* MemForge MCP endpoint (Phase C1). It reaches remote Streamable HTTP servers only (research card skills-distribution).

Skills are not eligible for ZDR or HIPAA (overview, "Data retention"). Enterprise operators need to know this.

### 3.4 Other vendors

- **Agent Skills open standard.** OpenAI Codex and ChatGPT, Gemini CLI and Antigravity, GitHub Copilot and Letta read `SKILL.md` from paths such as `.agents/skills/`, `.github/skills/` and `.claude/skills/`. This comes from the skills-distribution research card, fetched 2026-10-30, and was not re-checked here. The frontmatter already uses only portable keys, so the same folder works there.
- **skills.sh.** `npx skills add salishforge/memforge --skill memforge`. The syntax was checked on `github.com/vercel-labs/skills`. The CLI installs project skills into `.agents/skills/<name>`.
  - The page does not document which repository folders it scans. Test that it finds `plugins/memforge/skills/memforge`.
  - If it does not, add a top-level `skills/memforge` copy generated in CI. Do not use a symlink: marketplace loading warns on symlinked local sources.
- **OpenAI plugin portal.** It accepts Claude plugin archives and converts them, but drops hooks and `userConfig`. Public submission requires a remote endpoint and no lifecycle hooks (research card, not re-checked). Submit only in Phase C2, and only with a public endpoint (NEXT-ITERATION-PLAN decision 19).

---

## 4. Proposed repository layout

```text
.claude-plugin/marketplace.json            # marketplace "salishforge" → ./plugins/memforge
plugins/
  memforge/                                # the Claude plugin; also the zip for claude.ai upload
    .claude-plugin/plugin.json
    README.md                              # ≥ 40 words: what it does, how to use it, what data it sends
    skills/memforge/                       # canonical skill (this folder's memforge/)
      SKILL.md
      references/rest-api.md
      references/mcp-tools.md
      scripts/memforge.py
    commands/{status,remember,recall}.md
    hooks/hooks.json                       # SessionStart, PreCompact, SessionEnd (Claude Code and Cowork only)
    hooks/session-start.sh
    hooks/session-end.sh
    .mcp.json                              # Phase B (stdio) or Phase C1/C2 (remote); absent in Phase A
    evals/                                 # claude plugin eval cases, mocks/, trigger-queries.json
    tests/test_memforge_cli.py             # script contract tests (no network)
  claude-desktop/                          # existing: replace its config and TOOLS.md, which document
                                           # tools and params that do not exist (MX-6), or delete it
  m365-copilot/, power-automate/           # unchanged here (G2)
```

The `files` array in `package.json` should not include `plugins/`. The npm package stays the server and SDK.

Add a CI job that builds `dist/memforge-skill.zip` (skill only) and `dist/memforge-plugin.zip` and attaches both to each GitHub release.

---

## 5. Code changes that must come before or with the skill

Notes on the columns:

- **Status** is the audit verification status. "Re-checked" means this task re-read the cited code.
- **Skill impact** names the skill text that becomes simpler once the change ships.
- Session counts assume an AI coding session of about 2–3 hours.

### P0: before announcing the skill

| ID (status) | Change | Why the skill needs it | Effort |
|---|---|---|---|
| **MX-1 / SR-2** (confirmed; re-checked) | Switch the MCP stdio transport to newline-delimited JSON. Echo the negotiated protocol version, answer `ping`, and ignore unknown notifications. Add a spawn test (initialize, tools/list, tools/call) to CI. Consider the official SDK for the transport only. | Without it, no MCP client connects. The skill falls back to REST, so Chat, the API connector and Codex cannot use MemForge | S, 1–2 sessions |
| **MX-2** (confirmed) | Publish the current server: an npm release cut from `main`, Docker images on GHCR, and the Python SDK under a non-conflicting name. Fix every quick-start in the docs. Add a CI job that runs each documented install command. | The skill requires a v3.13+ server. Today the only route is building from source. The published npm package is the 3.0 beta, which ignores `namespace`, `snippet_tokens` and `occurred_at`. **The skill already warns against `pip install memforge`.** | M, 4–6 sessions |
| **ARCH-1 / MX-4 / SEC-3** (confirmed, partial, confirmed) | Make authentication the default on every deployment path: forward tokens in compose, add them to `.env.example`, refuse to start in production without auth, and log a loud warning otherwise. When no token is configured and OAuth2 is off, answer a request that carries a token with a clear 4xx message instead of a 503 (noted by the MX-5 verifier). | The skill assumes a token-protected server and has to warn users when it is not. Today a client with a stale token sees only a 503 | S, 1–2 sessions |
| **RA-9, SEC-12, ARCH-18, MX-13, MX-15** (partial; confirmed; unverified ×3) | Remove phantom features from README, CLAUDE.md and INTEGRATION.md: `POST /hints`, `GET /conflicts`, preference extraction, `ENABLE_LLM_INGEST`, and the wrong tool, route and version counts. Generate these facts in CI. | Docs that contradict the skill make users and models call routes that do not exist. The skill already says not to call them | S, 2 sessions |
| **NEW-1** (new) | Make read routes honour the `X-Memforge-Namespace` header, as writes already do. Evidence: `resolveCallerNamespace` (`src/app.ts:109-111`) is used only by add (`:400`), consolidate (`:1024`) and dreams (`:1210`). Query (`:465`), principles (`:698`), abstractions (`:754`), timeline (`:833`), stats (`:1047`), resume (`:1306`) and export (`:1449`) read only `?namespace=`. | An MCP or SDK client started with `MEMFORGE_NAMESPACE` writes to the project namespace but reads from `default`. The skill and script work around it by always passing `namespace` | S, 1 session |

### P1: ship with the skill, or soon after

Each of these lets the skill drop a workaround.

| ID (status) | Change | Skill impact once fixed | Effort |
|---|---|---|---|
| **MX-6** (partial) | Ship a curated core MCP toolset of about 10 tools, with the rest behind `MEMFORGE_MCP_TOOLSET=advanced`. Tools to include: resume; add with `outcome_type`, `occurred_at`, `hints.supersedes` and `session_id`; query with `after`, `before`, `max_tokens` and `code` mode; active_recall; consolidate; timeline; stats; sleep_advisory; dreams_create and dreams_status; feedback once MX-3 lands. Add `readOnlyHint` and `destructiveHint` annotations. State LLM prerequisites in descriptions. Generate `mcp.ts`, `tool-definitions.ts` and the Python tools from one source. | Removes the "Gaps" section of `mcp-tools.md`. Mem0 cut its plugin to one read-only search tool, and Cognee teaches four verbs: a small surface wins | M, 4–6 sessions |
| **MX-3 / RA-11 / PERF-22** (partial; confirmed; confirmed) | Return a `retrieval_id` per query result (an INSERT with RETURNING). Accept those ids in `/feedback`. Add an HTTP test that runs query, then feedback, and expects `updated > 0`. | Replace "6. Feedback: not yet" with the text in section 6 below | S, 1–2 sessions |
| **RA-3** (confirmed) | Treat time words as soft hints: a proximity boost, or a fallback to an unfiltered search. Make "today" mean the start of the day, and accept a `tz` parameter. | Drop the time-words rule and the script's refusal of "today" | S, 1 session |
| **RA-2** (confirmed) | Always search the whole cleaned query, and fuse sub-query results with RRF instead of max. | Drop "one topic per query; avoid *and*" | S, 1 session |
| **RA-18 / SR-14 / ARCH-21** (unverified ×2, low; re-checked: `consolidationThreshold` is set at `memory-manager.ts:341` and `server.ts:50` and never read) | Add a low-weight hot-tier search arm, or auto-consolidate when a threshold is reached. | Consolidation stops being a correctness step. Keep it at session end only | M, 3–4 sessions |
| **SC-24 / MX-16** (unverified; re-checked: `memory-manager.ts:2494-2497` throws before any phase runs) | Run the SQL phases without an LLM and report `llm_phases_skipped`. | Maintenance becomes available on every install. Soften the "requires an LLM" guidance | S, 1–2 sessions |
| **RA-8** (confirmed) | Demote superseded and expired memories at query time, and return `superseded_by`, `valid_until` and `confidence`. | Drop "the server does not demote superseded memories"; trust the order | M, 2–3 sessions |
| **RA-20** (unverified) and **RA-4** (partial) | Add `format=context` to queries, with dates, status and source for each result. Use `COALESCE(occurred_at, …)` everywhere, including timeline. | The script's client-side rendering becomes redundant | S, 1–2 sessions |
| **NEW-2** (new) | Add `namespace` to active-recall. `POST /active-recall` (`app.ts:1422-1440`) takes none, and `activeRecall()` (`memory-manager.ts:3116-3130`) calls `query()` without one, so it always searches `default`. | Promote active_recall into the core loop | S, under 1 session |
| **NEW-3** (new) | Give timeline an `order=desc` default, or a "most recent N" mode. It returns `ORDER BY … ASC LIMIT n` (`memory-manager.ts:1323-1329`), so without `from` you get the *oldest* rows. | Drop "always set `--since`" | S, under 1 session |
| **NEW-4** (new; tested) | Make snippet extraction fall back to the `---` separators that consolidation inserts (`memory-manager.ts:1494`) when a row has no turn markers, or index each memory separately (RA-14). Evidence: running `src/snippet.ts` on 21 concatenated notes found the relevant note only when notes carried `[assistant]:` markers. Without markers it returned the head of the row. | The turn-marker content rule becomes advice rather than a requirement | S, 1 session (the separator fallback) |
| **NEW-5** (new) | A consolidated row keeps only the earliest `occurred_at` of its batch (`memory-manager.ts:1502-1505`). Keep one row per event date, or one row per memory (RA-14). | Drop "write the date in the text too" | S/M, 1–3 sessions |
| **NEW-6** and **SR-13** (new; unverified, re-checked: the global handler maps every error to 500 at `app.ts:2165-2168`) | Return useful statuses: 409 for "sleep already running", 400 for "semantic search needs embeddings", 413 or 400 for body-parser errors. These are masked as 500 today (`app.ts:1133-1138` for sleep, `:570-571` for query). | Simplify the troubleshooting table | S, 1 session |
| **NEW-7** (new) | Give `resume` a recency tie-break, for example `ORDER BY importance DESC, COALESCE(occurred_at, time_end, consolidated_at) DESC`. Today it orders by importance alone (`memory-manager.ts:2664-2668`), every warm row starts at importance 0.5 (`schema/schema.sql:93`), and only a sleep cycle (`sleep-cycle.ts:551`) or feedback rescores it. With no LLM (SC-24) and no usable feedback (MX-3), `resume` returns arbitrary rows on most installs. | Drop the "arbitrary few" caveat under "1. Session start" | S, under 1 session |
| **SR-12** (unverified; re-checked: `SleepSchema` thresholds have no bounds, `schemas.ts:119-126`) | Clamp sleep thresholds to [0,1]. Require an admin scope for dream `instructions` (SC-21). | The skill already says to leave thresholds and instructions at defaults. Keep that rule as defence in depth | S, under 1 session |
| **SC-22** (unverified; re-checked: `last_sleep_cycle` is read at `memory-manager.ts:4452` and never written in `src/`) | Write `last_sleep_cycle` and `sleep_cycle_cost_tokens` at the end of each cycle. | Drop "time-since-last-sleep is unreliable" | S, under 1 session |
| **SR-5 / MX-18** (confirmed; unverified) | Add a lease and recovery for dream runs stuck in `running`. | Simplify the "stuck pending" troubleshooting row | M, 2–3 sessions |
| **SR-15** (unverified; re-checked: the add, consolidate and synchronous sleep routes call `invalidateAgent`, but nothing does after a dream run) | Invalidate the cache from the manager, so dream runs and every other entry point are covered. | Drop "results stay cached for up to about 10 minutes after a dream run" | S, under 1 session |
| **SR-10** (confirmed) | Fall back from hybrid to keyword search inside the server when the embedding provider fails. | The script's retry becomes redundant | M, 2 sessions |

### P2: reach beyond Claude Code

| ID / source | Change | Why | Effort |
|---|---|---|---|
| skills-distribution card; Mem0, Supermemory and Hindsight run hosted remote MCP | **Remote MCP, stage 1 = NEXT-ITERATION-PLAN U-5a (RT-2).** A stateless Streamable HTTP endpoint at `/mcp` in `createApp()` with the same core toolset and tool annotations, an MCP conformance suite for 2026-07-28 and 2025-11-25, authenticated by the existing bearer token. Validate `Origin` and bind to loopback by default, as the MCP transport spec requires; enable it beyond loopback only once AR-4 has landed (SEC-1). | Opens the Claude Code HTTP transport, the API MCP connector, a single-user claude.ai connector and ChatGPT through Secure MCP Tunnel without a local process. Phase C1 of the plugin | M, 4–6 sessions |
| skills-distribution card (MCP authorization 2026-07-28; ChatGPT reportedly supports per-user OAuth only: skills-distribution card, not fact-checked; E0-8 confirms); **SEC-14** | **Remote MCP, stage 2 = NEXT-ITERATION-PLAN U-5b (RT-3).** OAuth 2.1 resource server only: Protected Resource Metadata, JWKS, audience validation, challenges. The authorization server is the user's own OIDC IdP or the reference Keycloak broker (ENTERPRISE-EDITION §4.2, E0-8). A native broker with CIMD is EE E2-2 (D-EE-5). | Needed for per-user claude.ai custom connectors, the Anthropic directory connector listing, ChatGPT and M365 Copilot. Phase C2 of the plugin | M, 4–6 sessions |
| **SEC-1 / ARCH-2** (confirmed) | A principal model that binds a caller to the agent ids and spaces it may use, enforced before every route. | The skill's "assume shared visibility" rule exists because this is missing. Required before any shared instance (G2). Change the Privacy section when it ships | L (G2 plan) |
| **MX-12** (unverified) | Complete OpenAPI with `operationId`s. | ChatGPT actions and Copilot plugin manifests bind to it | M, 2–3 sessions |
| **MX-8** (partial) | Memory-specific metrics: empty-query rate, consolidate lag, hot backlog. | Field metrics for the skill (test plan, step 7) | M, 2–3 sessions |

---

## 6. Traceability: skill text and the finding behind it

When a fix ships, edit the skill in the same pull request.

| SKILL.md text | Finding | Replace with, once fixed |
|---|---|---|
| "Lands in a hot tier that is **not searchable yet**"; "4. Consolidate" | RA-18, SR-14, ARCH-21 | "Searchable within seconds. Consolidate at session end." |
| "Consolidating soon keeps rows small …"; "A consolidated row takes the most common type …" | RA-14, RA-1, NEW-5 | Remove once each memory is indexed as its own row (RA-14) |
| "On a server that has never run one, every memory has the same importance …" | NEW-7, SC-24 | Remove |
| Troubleshooting row "HTTP 503 while sending a token" | ARCH-1, MX-4 | Map it to the new 4xx message |
| "The stdio MCP server cannot yet complete a handshake …" | MX-1, SR-2 | Remove. Make MCP the preferred transport where available |
| "pass the namespace on every call" | NEW-1 | Keep as good practice and drop the warning |
| "Keep time words out of the query text" | RA-3 | Remove. Remove the script's refusal of "today" |
| "One topic per query" | RA-2 | Soften to a tip |
| "The server does not demote superseded or expired memories" | RA-8 | "Superseded memories rank lower and say what replaced them." |
| Turn-marker shape for memories | NEW-4, RA-14 | Keep as a recommendation |
| "a consolidated row keeps only the earliest event date in its batch" | NEW-5, RA-4 | Remove |
| "The server currently ignores them" (hint fields) | RA-9 | Document whichever hints become real |
| "It needs an LLM provider on the server …" | SC-24, MX-16 | "Without an LLM the cycle runs scoring and archiving only." |
| "Its time-since-last-sleep signal is unreliable" | SC-22 | Remove |
| "If a run stays `pending` …" | SR-5, MX-18 | Keep a short version |
| "expect query results to stay cached for up to about 10 minutes after a dream run" | SR-15 | Remove |
| "6. Feedback: not yet" | MX-3, RA-11, PERF-22 | Use the replacement text below |
| "Anyone who holds this server's token can read every agent's memory" | SEC-1, ARCH-2 | "This server isolates agents by caller identity." Keep "store only what the user would share with the space's members". |
| "If `check` warns that the server runs without authentication …" | ARCH-1, MX-4 | Keep. Old servers still exist |
| Troubleshooting rows that mention 500 | NEW-6, SR-13, SR-10 | Map them to the new status codes |
| `mcp-tools.md`, "Gaps: when to fall back to REST" | MX-6, NEW-2 | Delete the gaps that the core toolset closes |
| "Never `pip install memforge` …" | MX-2 | Name the correct package instead |

**Edits to apply when packaging skill 0.1 for v3.13.0 (RT-1).** The skill text above is accurate for today's `main`. These rows change because v3.13.0 fixes the finding; apply them in the release PR, before the GA announcement. The drift check (step 1) must find no pre-fix text left:

| SKILL.md text today | Finding fixed in RT-1 | Text for the v3.13.0 package |
|---|---|---|
| Frontmatter `compatibility`: "built from the main branch (schema migration v3.13 or later; the published npm 3.0 beta lacks needed features)" | MX-2 (TT-9) | "MemForge 3.13.0 or later (the npm 3.0 beta lacks needed features)" |
| "The stdio MCP server cannot yet complete a handshake with standard MCP clients, so the tools are usually missing." | MX-1, SR-2 (TT-10) | "Servers from 3.13.0 speak MCP over stdio. This plugin version still uses the script; MCP tools arrive in skill 1.0." |
| Setup step 4: "say it must be built from the main branch for now; several documented quick starts do not work yet" | MX-2 (TT-9) | Name the published 3.13.0 install channels (npm, GHCR images, compose, the renamed PyPI package) |
| Troubleshooting "HTTP 503 while sending a token" | ARCH-1, MX-4 (TT-11) | The new 4xx code and message |
| Troubleshooting "HTTP 500 on add" and "HTTP 500 on sleep" | NEW-6, SR-13 (TT-6; 409 in AP-4) | 413/400 on add; 409 on sleep once AP-4 lands |
| "pass the namespace on every call" warning | NEW-1 | Keep the practice; drop the warning |
| "Anthropic memory store push or pull" (Privacy) and the `anthropic_*` tools and routes in the references | SC-3, SC-10 (bridge removed from core in RT-1) | Remove the mentions |

**Replacement text for "6. Feedback" once MX-3 ships.** After you use retrieved memories in an answer the user accepted or corrected, send feedback once:

- `positive` for the results that helped;
- `negative` for results that were wrong or outdated.

Use the `retrieval_id` values from that query. Never send memory ids, never send cached results, and never send feedback twice. Feedback adjusts importance, epistemic status and pool reputation (SC-15, unverified; confirm before relying on this text).

---

## 7. Test plan

The plan answers two questions:

- Does the skill *trigger* on the right requests, and only those?
- Does Claude *work correctly* once it has triggered?

### Step 1: static checks in CI (S, 1 session)

- `skills-ref validate plugins/memforge/skills/memforge` and `claude plugin validate plugins/memforge --strict`.
- A small linter for the skill:
  - frontmatter keys are a subset of the six portable keys;
  - `description` is at most 1,024 characters and contains no `<` or `>`;
  - `compatibility` is at most 500 characters;
  - the body is at most 500 lines and about 5,000 tokens;
  - every relative link resolves;
  - `name` equals the folder name.
- **Drift check:**
  - every route in `references/rest-api.md` exists in `src/app.ts`;
  - every tool name in `references/mcp-tools.md` exists in `src/mcp.ts`.

  This follows MX-15 and ARCH-18: generated facts, asserted in CI.

### Step 2: script contract tests (done)

`python3 -I tests/test_memforge_cli.py` runs 12 tests against a fake server that mirrors the shapes in `src/app.ts`. All pass. They cover:

- the namespace on reads and writes;
- the add body (type, `occurred_at`, supersedes, metadata);
- refusing four credential shapes without any network call, while allowing ordinary text;
- refusing "today";
- the keyword retry after a 500;
- global flags after the subcommand;
- 401 and unreachable-server handling;
- namespace validation.

Run them in the existing CI workflow.

### Step 3: live REST test against a real server (M, 2–3 sessions)

Bring up MemForge with docker compose, with auth on (needs ARCH-1 fixed) and no LLM. Seed it with a fixture script, then assert today's behaviour with the script:

1. A memory is not found before consolidate, and is found after it (flip this assertion when RA-18 ships).
2. Namespaces are isolated, and reads work with `--ns` (flip when NEW-1 ships).
3. A query containing "today" returns nothing on the server: the script's refusal is justified.
4. A turn-marked note is found through `snippet_tokens`, and a plain note in the same batch is not (NEW-4).
5. Sleep returns 400 "requires an LLM provider".
6. A dream run against a server with no LLM ends `failed`.
7. A note consolidated on its own keeps its own `occurred_at` and `outcome_type`. Notes consolidated together share the earliest date and the majority type (NEW-5, RA-14). Compare top-5 retrieval for the same seeded notes consolidated one by one and in one batch: this is the evidence for the skill's "consolidate soon" rule.
8. `resume` on a server that has never slept returns rows in no useful order (NEW-7).

This doubles as the regression test for every P1 fix. Each fix flips one assertion and edits one line of the skill (section 6).

### Step 4: trigger evals (M, 2–3 sessions; reusable for every description change)

Before the v3.13.0 GA announcement, run the 20 queries once by hand (or with skill-creator) and put the result in the release notes. Automated runs start in RT-2.

- **Queries:** `evals/trigger-queries.json` holds 20 realistic queries: 10 that should trigger and 10 near misses. The near misses cover editing CLAUDE.md, working *on* the MemForge code, Redis and LRU "memory", out-of-memory errors, SQL, summarizing the current conversation, and comparing vendors.
- **Optimizer:** run skill-creator's description optimizer (`scripts.run_loop`). It uses a 60/40 train/validation split, 3 runs per query and at most 5 iterations, and picks the best description by validation score. This method comes from agentskills.io and the skill-creator docs.
- **Or:** run a `claude plugin eval` sweep with a `tool_used: Skill` grader.
- **Targets:**
  - should-trigger queries fire in at least 90% of runs;
  - near misses fire in at most 10% of runs;
  - test on Haiku, Sonnet and Opus. Anthropic's best-practices page says to test with all models you plan to use.

### Step 5: behaviour evals (Phase A by hand or with skill-creator; Phase B in CI with `claude plugin eval`)

**Cases in `evals/`:**

- `recall-prior-decision`: queries the project namespace and attributes the answer, with its date.
- `store-preference`: stores turn-marked content in `default`, then consolidates, and tells the user.
- `refuse-secret`: the password never reaches a tool call (the grader runs in both arms).
- `no-time-words-in-query`: query text contains no time words.

**How they run.** The cases use MCP mocks with `expect:` guards: `agent_id` must be `alice`, and `namespace` must be present. Because `claude plugin eval` mocks only servers the plugin declares, these cases run in CI from Phase B onwards. In Phase A, run the same prompts once with skill-creator against a local server before the v3.13.0 GA announcement: it runs with and without the skill and reports the difference. Put the results in the release notes.

**Cases still to add:**

- resume at session start;
- a correction uses `--supersedes` with the id of a retrieved memory;
- an empty result is followed by a consolidate or namespace check, not "I have no record";
- maintenance runs only when asked;
- no secrets in metadata;
- second-hand pool results are cited;
- retrieved memory content that contains instructions is not followed;
- a near miss: "edit CLAUDE.md" must not touch MemForge (`tool_used` with `min: 0`, `max: 0`).

**CI gate:** `--threshold 0.8`, with a positive Δ against the no-plugin baseline on every case.

### Step 6: cross-surface smoke checklist (manual, each release, about 1 session)

- **Claude Code:** install from the marketplace, set userConfig, confirm `/memforge:status`, and confirm SessionStart context appears.
- **claude.ai:** upload the skill zip and ask "which skills do you have?". Upload the plugin zip and confirm the Connectors tab is empty in Phases A and B.
- **Cowork:** the skill loads and hooks run.
- **API:** upload with `/v1/skills`, attach it with the code execution tool and app-defined tools from `@salishforge/memforge/tools`, and confirm Claude follows `mcp-tools.md`.
- **Codex:** run `npx skills add salishforge/memforge --skill memforge` and confirm the folder lands in `.agents/skills/memforge`.

### Step 7: field signals after release (needs MX-8)

Track, without storing content:

- consolidate calls per add, which should not be near 0;
- empty-query rate;
- the share of queries that contain time words or conjunctions (should fall after release);
- 4xx counts per route.

---

## 8. What we took from competitors, and what we didn't

All of this comes from the research files; Mem0 and Cognee plugin details were re-fetched on 2026-11-16.

- **Mem0.** Mem0's Claude Code plugin (marketplace `mem0-plugins`) captures via hooks without a model call. It flushes every 5 exchanges, at compaction and at session end, runs one automatic search on the first prompt, exposes one read-only MCP tool and has `/mem0:*` commands. Mem0 also splits its skills by job: `mem0`, `mem0-integrate` and `mem0-test-integration`.
  - **Took:** hooks that fail open, a small core tool surface, slash commands, and a later separate `memforge-integrate` skill for developers. Keep the runtime skill's description narrow so the two don't compete.
  - **Did not take:** automatic capture of every exchange. It stores raw transcripts, which this skill's privacy rules reject. It is ignored in chat. And MemForge already packs 50 events per row (RA-14).
- **Cognee.** Cognee teaches a four-verb API (remember, recall, improve, forget) and says to prefer the memory API and "drop to the low-level operations" only when needed. It ships the `cognee-memory@cognee` plugin with 14 skills (fact-check: confirmed). **Took:** the verb table at the top of SKILL.md and the core-versus-advanced split in `mcp-tools.md`. MemForge has no honest "forget" verb yet (SEC-9), so the skill says so instead of pretending.
- **MemOS.** MemOS's local plugins install a `memos-memory-guide` skill alongside search and timeline tools. **Took:** shipping the skill *inside* the plugin, so guidance is always present with the tools.

  MemOS also had a supply-chain incident: malicious npm and PyPI versions on 2026-09-23 (GHSA-mhjf-v53x-7p87; fact-check confirmed). The lessons for MemForge:
  - pin plugin and MCP versions;
  - publish with trusted publishing and provenance;
  - fix the PyPI name collision (MX-2).
- **Supermemory.** Supermemory's `claude-supermemory` uses SessionStart profile loading, UserPromptSubmit recall, PreToolUse auto-allow of read-only tools, Stop capture, and memory keyed to the git remote. **Took:** SessionStart resume, and the namespace defaulting to the repository name. Per-prompt recall is deferred (PERF-10 rate limit).
- **Basic Memory, Honcho, Hindsight and claude-mem.** These ship an uploadable zip, a skills folder, and a plugin with SessionStart resume and a PreCompact checkpoint (emerging-specialists card). **Took:** the three-artifact release (skill zip, plugin zip, marketplace).
- **Gap MemForge can fill.** Per the skills-distribution card, no memory vendor ships a portable, cross-vendor SKILL.md that teaches *when and how* to use memory. Vendors ship hooks and commands instead. A well-evaluated MemForge skill would be early. It is a guidance layer, not a moat: the differentiation still has to come from the server.

---

## 9. Sequencing and effort

| Phase | Contents | Effort |
|---|---|---|
| **A: ships with v3.13.0 (RT-1)** | Land `plugins/memforge` (this skill, hooks, commands, marketplace, release zips), and static checks plus script tests in CI. The P0 fixes land in the same release: MX-1/SR-2, ARCH-1, RA-9 docs, NEW-1, MX-2 publishing. Apply the §6 release-time edits; one manual run of steps 4–5 | Packaging M (4–6 sessions). P0 code is counted in RT-1's TT items |
| **B: v3.14.0 (RT-2), after AP-1's 10-tool core** | Add the stdio `.mcp.json`, turn on mock-based behaviour evals and trigger evals in CI, and work through the P1 fixes, editing the skill with each | M, 6–9 sessions for skill 1.0. The P1 fixes are counted in RT-2's register rows |
| **C1: RT-3, on U-5a** | Claude Code HTTP transport, the Messages API MCP connector, a single-user claude.ai custom connector via beta static headers, ChatGPT via Secure MCP Tunnel | Skill-C1 S, 1–2 sessions; U-5a (4–6) is counted in RT-2 |
| **C2: RT-4, on U-5b** | Per-user OAuth through the user's own IdP (E0-8 recipes) or the reference Keycloak compose; submit the plugin to the Anthropic directory; list the npm server package in the MCP Registry. A directory connector listing and OpenAI public submission need a public HTTPS endpoint (NEXT-ITERATION-PLAN decision 19) | Skill-C2 S, 1 session; U-5b (4–6) is counted in RT-3 |

---

## 10. Open questions

1. **MCP tool names in eval graders.** The graders assume Claude Code names plugin MCP tools `mcp__plugin_memforge_memforge__<tool>`. Confirm with one `claude plugin eval … --runs 1`.
2. **skills.sh discovery.** It is not documented which folders `npx skills add` scans. Test against the repository before announcing that channel.
3. **claude.ai sandbox network.** Can a Team or Enterprise admin allow a private MemForge host? If not, chat users depend on Phase C1 (one user) or C2 (per-user OAuth).
4. **Auto-recall.** Should first-prompt auto-recall (the Mem0 pattern) be on by default in the plugin? The trade-offs are rate limits (PERF-10), latency, and surfacing memories the user didn't ask for.
5. **Consolidation cadence.** The skill now says to consolidate soon after each store, which gives one small row per memory. That matches how the official benchmark was measured (one session per warm row) but has not been measured for skill-sized notes. Step 3, assertion 7 settles it. If batching turns out better, revert the rule.
6. **Script permission rule.** Should the plugin ship a PreToolUse hook that auto-approves only the plugin's own script path (the Supermemory pattern), or leave the rule to the user? The hook is convenient, but enterprise skill vetting treats network-calling scripts as a high-risk indicator (skills-distribution card), so users must be able to see the rule.

---

## Appendix A: verification pass (2026-11-16)

A second reviewer re-checked every tool name, parameter, route, field and behavioural claim in the skill against `src/app.ts`, `src/mcp.ts`, `src/tool-definitions.ts`, `src/schemas.ts`, `src/client.ts`, `src/auth.ts` and `src/memory-manager.ts`, and corrected these:

- An empty bearer token does not cause a 503. With no token configured, a request that sends a non-empty token gets 503 instead of a clear 4xx (ARCH-1, MX-4; tested: Node strips the empty `Bearer ` value).
- `/stats` returns zero counts for an unknown agent, not 404 (`memory-manager.ts:1964-1975`).
- Underscore-prefixed metadata keys are not caller-safe: some are reserved and the rest are dropped at consolidation, so the skill tells callers not to use them.
- `outcome_type: observation` carries no scoring weight, and a consolidated row takes the batch's majority type (`sleep-cycle.ts:566-571`; `memory-manager.ts:1627-1640`).
- The query splitter also splits on "and also" and "along with" (`memory-manager.ts:410-413`).
- Query text is stored in the database (`retrieval_log`, `knowledge_gaps`), not in the HTTP request log, which records only the path (`src/logger.ts:53-70`).
- `memforge_cold_restore` takes `cold_id`; `memforge_dreams_status` takes `run_id`; `memforge_active_recall` caps `limit` at 20 (`app.ts:1431`).
- The app-defined tool definitions differ from the MCP server's: no `snippet_tokens` on query, and no `memforge_sleep_advisory` (see section 3.3).
- `resume` ordering is arbitrary until a sleep cycle has scored importance (NEW-7).
- Consolidation guidance changed from "not after every add" to "soon after storing" (RA-14, RA-1, NEW-5): small rows retrieve better.
