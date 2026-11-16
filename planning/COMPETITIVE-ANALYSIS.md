# MemForge competitive analysis: November 2026

**Date:** 2026-11-16
**Supersedes:** the competitive-landscape, benchmark and positioning sections of
`NEXTGEN-RECOMMENDATIONS.md` (2026-07-27). That file's work blocks (WB-xx) remain a
useful backlog; this document updates the market picture they rest on.
**Status:** planning input for maintainer review.

**Basis**

- **Code.** MemForge `main` at commit `16e2f15` (2026-07-29, still the last commit on
  2026-11-16). v3.7.0 is tagged in git with a CHANGELOG date of 2026-05-21, but the npm
  `latest` tag is still 3.0.0-beta.4 from 2026-04-18 (MX-2, confirmed against the live
  registry 2026-10-30). Earlier planning notes said v3.7.0 was published to npm; MX-2
  supersedes that.
- **Audit.** An October 2026 AI-assisted code audit; a separate verifier then tried to refute
  each critical and high finding (and security mediums) from the code: 151 findings (38 confirmed, 41 partially confirmed, 71 unverified, 1 refuted).
  Audit IDs appear in parentheses. Findings marked *unverified* are plausible but unproven;
  a few were spot-checked in the code for this document and are marked *spot-checked*.
- **Research.** Thirteen competitive targets were researched on 2026-10-30. The
  benchmark, framework and enterprise-knowledge targets were refreshed from primary
  sources on 2026-11-16. Fact-check corrections override the original claims. The Letta
  and hyperscaler cards were first drafted from model knowledge and then corrected against
  primary pages; residual uncertainty is flagged inline.

**Conventions**

- Every benchmark carries its **metric type** (QA accuracy, retrieval recall, or other),
  its **reader model**, and whether it is **self-reported** or **independent**. Retrieval
  recall is never compared with QA accuracy.
- `n/f` = not found in the research. `n/v` = not verified.
- Security issues are described as work to do, by audit ID. This document may be
  committed to the public repository.
- Effort: **S** < 1 day, **M** 1–5 days, **L** > 1 week of focused work. One AI coding
  session ≈ 2–3 hours.

---

## 1. Executive summary

**TL;DR**

- **Dreaming is a commodity.** Six vendors shipped background consolidation in 2026; none publishes an open sleep-on/off delta, so only *proof* can still differentiate.
- **MemForge trails its like-for-like cohort by 15.8–18.9 QA points** (LongMemEval-S, gpt-4o-class reader: 67.6% against 83.4–86.5%), and its benchmarked configuration is not the shipped one (RA-14).
- **Distribution gap:** no working install channel, no plugin, stdio MCP that does not speak MCP (MX-1, MX-2), against competitors in every marketplace.
- **G2's open slice is narrow:** self-hosting with SSO is already a paid tier at Hindsight, Cognee, Supermemory and Zep (BYOC). What is left is team features that are free to self-host, with inspectable source, epistemic status and a verifiable audit on the same instance.
- **Thesis D1–D5 (§9):** measured improvement (most exposed), epistemic governance (strongest), sovereign team memory with a compliance plane (D3 with D4 folded in), and honest measurement as the enabler.

**Detail**

- **"Dreaming" became a platform default, so a sleep cycle no longer differentiates by
  itself.** Background consolidation shipped everywhere in 2026:
  - Letta's Dreaming subagents (2026-03-16);
  - Anthropic Dreams, a research preview (2026-05-06);
  - Supermemory Dynamic Dreaming (2026-05-25);
  - OpenAI ChatGPT Dreaming V3 (2026-06-04);
  - Mem0 Dream (August/September 2026);
  - plus Honcho's Dreaming Agent and MIRIX AutoDream.

  Only OpenAI reports a gain: internal factual recall rose from 41.5% (2024) to 82.8%
  (2026). That evaluation is closed, and it compares system versions rather than running
  sleep on and off. **No vendor publishes consolidation deltas on a standard benchmark.**
  The July thesis, "memory that measurably improves over time", is still unclaimed, but
  only as a *proof*, not as a feature.
- **The accuracy bar moved, and MemForge sits at the bottom of its like-for-like cohort.**
  - With a gpt-4o reader, three systems report 83–87% LongMemEval-S QA: Redis Remis
    (hybrid dense+BM25 with no LLM at ingest, MemForge's own architecture class), Mastra
    Observational Memory, and Redis Remis+Instruct. MemForge reports **67.6% QA**
    (gpt-4o-2024-08-06 as reader and judge).
  - MemForge's retrieval recall is high where measured (§5.3), so the gap most likely
    sits in unit size, context assembly and reading. N-1 will measure it directly: the
    share of wrong answers whose complete evidence was in the reader context.
  - The audit adds a sharper problem: the benchmarked configuration (one session per
    warm row) is not the shipped default (RA-14, RA-1).
  - Credibility now comes from BEAM-10M, DolphinBench, LongMemEval-V2 and
    **independent reproduction**. Redis's reproduction report of 2026-09-21 found gaps of
    +3 to −28 points between vendor claims and reproduced scores.
- **The distribution rails standardised, and every serious competitor is on them except
  MemForge.**
  - Agent Skills became an open standard and was donated to the Agentic AI Foundation on
    2026-10-22 (Anthropic cites 70+ adopting platforms).
  - MCP revision 2026-07-28 is stateless, with an OAuth profile.
  - Mem0, Zep, Hindsight, Supermemory, Honcho and Cognee all ship a Claude Code plugin,
    installer or skill.
  - All but Cognee also run a hosted remote MCP endpoint. OAuth is confirmed for Zep,
    Hindsight Cloud and Supermemory; Mem0's auth mode is reported inconsistently.
  - MemForge has stdio-only MCP that does not speak MCP's stdio framing (SR-2, MX-1, both
    critical and confirmed), no plugin, and no working install channel (MX-2).
- **Cross-platform team memory is no longer an empty space, but a narrow open slice
  remains.**
  - Zep made its MCP server generally available (2026-08-19), with identity-fixed scope,
    UserGroup ABAC and a bundled skill, and launched Agent Skills (2026-11-05).
  - Cognee sells a "company brain"; Mem0 has orgs and Gateway; Glean, Microsoft Work IQ
    and Notion approach from the knowledge side.
  - Supermemory exited the team market on 2026-09-10.
  - What remains open is an **open-source, fully self-hostable (including air-gapped, on
    plain Postgres), vendor-neutral team memory that learns from AI interactions and
    carries epistemic governance and a compliance plane.** The 2026-11-16 research calls
    that window "real but closing".
- **MemForge's assets are real but mostly dormant.** The audit found that the
  differentiating features exist in the schema and code but do not yet work end to end:
  - conflict detection never runs (RA-10);
  - the feedback loop cannot be closed through the API (RA-11);
  - eight sleep phases disable themselves after three idle cycles (SC-1, SR-3);
  - Postgres RLS is not enforced on the application path (SEC-2);
  - audit verification reports tampering on healthy data (SR-4);
  - the Anthropic Dreams and Memory Store layers target an assumed wire format (SC-3).

  In an honest capability matrix (§4), most of MemForge's "Yes" cells are "Partial".
- **Per-user memory is a commodity, and the commodity layers are distribution channels.**
  - First-party memory now covers one user on one vendor well.
  - AWS AgentCore Memory, Google Agent Platform Memory Bank and Microsoft Foundry memory
    cover one cloud.
  - Almost every agent framework gained a pluggable memory contract in 2026: Strands,
    Pydantic AI, CrewAI, ADK, Microsoft Agent Framework, and the Claude Agent SDK's
    SessionStore.
  - MemForge should be a backend behind these contracts rather than a rival to them.
- **Strategic implication: compete on proof, trust and sovereignty, not breadth.**
  1. Make the existing differentiators true (the G3 "Truth & Trust" work).
  2. Ship the G1 skill and plugin on a transport that works.
  3. Build the G2 fork around four things none of the leaders combine: self-host,
     vendor-neutral remote MCP under the customer's identity, epistemic governance, and a
     tamper-evident audit.
  4. Publish the first open, reproducible "improves over time" benchmark, including a
     null result if that is what it shows.

### 1.1 What changed since the July analysis

| July 2026 position (NEXTGEN-RECOMMENDATIONS.md) | November 2026 reality | Evidence |
|---|---|---|
| Headline benchmark: "93.2% retrieval R@5" (relabelled from QA) | WB-02 is done. MemForge now publishes **67.6% LongMemEval-S QA accuracy** (gpt-4o-2024-08-06 as reader and judge, 2026-07-29) alongside **R@5 95.4% retrieval recall**. July's "knowledge-update 97.4%" was a recall figure; KU **QA** is 76.9%. | `benchmarks/OFFICIAL-RESULTS.md` |
| Zep: "LongMemEval 63.8% (accuracy, GPT-4o)" | **Correction:** 63.8% used a **gpt-4o-mini** reader. Zep's gpt-4o result is **71.2%** (gpt-4o-2024-11-20 reader; MemForge used 2024-08-06). Zep now also claims 90.2% with gpt-5.4 (2026-09-29, LongMemEval variant not stated). | Zep paper arXiv 2501.13956; Zep research page |
| Letta "ahead on evidence" for sleep-time compute; ~13K stars | Letta pivoted to Letta Code ("Our Next Phase", 2026-03-16). Server-side sleep-time agents became client-side **Dreaming** subagents, and the V1 server was archived (last tag v0.16.8, May 2026). Its evidence is still math-task compute savings, not conversational memory. Stars were ~25.3K (2026-10-30); the July figure was wrong. | letta.com/blog; fact-check |
| Mem0 "ahead on distribution by orders of magnitude" (~58K stars) | The gap widened: ~67.6K stars (2026-10-22), 2.46M PyPI downloads/month (2026-11-16). Plugins for Claude Code, Codex, Cursor and others; Vercel Marketplace; DolphinBench; Gateway. The OSS core was hollowed out (graph, Dream, temporal and orgs are Platform-only). | Mem0 changelog; pypistats |
| Hindsight "closest Hermes-bundled analogue" | Now the strongest specialist: MIT on Postgres, v1.0 "the API is a promise" (2026-10-13), v1.1 (2026-10-21), ~56K org stars, Cloud with native MCP OAuth, an Enterprise tier, Knowledge Pages. No longer bundled in Hermes, which now bundles only RetainDB and ByteRover. | Hindsight releases; Hermes docs |
| "BEAM is where credibility is earned" | Still true. Added: DolphinBench (action-based, Mem0-authored, 2026-09-22), LongMemEval-V2 (2026-05-12, no leaderboard entries yet) and independent reproductions (Redis, 2026-09-21). Best BEAM-10M QA is 68.0% (Exabase, Gemini 3 Flash reader). LongMemEval-S is saturated at 94–96% (self-reported, strong readers). | Benchmarks research, 2026-11-16 |
| "No system in this field measures whether stored memory improves" | Partly overtaken: OpenAI publishes a **closed, internal** longitudinal figure (41.5% → 82.8%). Still true for open, reproducible measurement on standard benchmarks. | openai.com/index/chatgpt-memory-dreaming (2026-06-04) |
| Competitive set = memory specialists plus the Hermes ecosystem | Five categories were missing: **first-party platform memory** (OpenAI, Anthropic), **hyperscaler managed memory**, **framework-native memory contracts**, **enterprise knowledge platforms with remote MCP** (Glean, Work IQ, Notion, Atlassian), and **MCP gateways and control planes** (Agent 365, IBM ContextForge). | §2 |
| "Do not build a hosted SaaS" | Still the right call for a solo maintainer. But **remote MCP with OAuth on the self-hosted server** is now mandatory: per-user OAuth on hosted assistants, and every public directory listing, require a remote (Streamable HTTP) MCP endpoint. ChatGPT can also reach a private stdio or HTTP server through OpenAI's Secure MCP Tunnel, but then every user shares one token (openai, fact-check corrected; see §3.5). | Skills/distribution research; openai fact-check; MCP 2026-07-28 |
| "Do not compare MemForge numbers against competitor numbers until like-for-like" | Now possible for one cohort (gpt-4o reader, LongMemEval-S QA), and the comparison is unfavourable (§5). | §5 |
| Implicit: the features exist and need evidence | The audit shows many of them exist only partially (§4), so evidence must wait until they work. | RA-10, RA-11, SC-1, SEC-2, SR-4 |

---

## 2. Market map

Categories overlap. A vendor appears where its centre of gravity sits. "Relation" says
whether MemForge should compete, complement or use the category as a channel.

| Category | Players (status, dated) | Relation to MemForge |
|---|---|---|
| **Memory layers / APIs** | **Mem0** (Apache-2.0 OSS plus paid Platform; ~67.6K stars, 2026-10-22). **Hindsight** (MIT on Postgres plus Cloud and Enterprise; v1.1, 2026-10-21). **Supermemory** (closed engine, MIT SDKs; exited team product 2026-09-10). **MemOS** (Apache-2.0; supply-chain compromise 2026-09-23). **Memori** (memory from agent traces, 2026-05-07). **Redis Agent Memory Server** (self-hostable REST plus MCP). | **Compete** (G3); Hindsight is the direct analogue |
| **Temporal-KG memory** | **Zep / Graphiti** (Graphiti Apache-2.0, 32.4K stars; Zep v4 GA 2026-10-14). **Cognee** (graph plus ontology; 1.0 shipped 2026-04-11). post-graph-rag (Postgres bi-temporal, research). | **Compete** (G2, G3); Zep is the G2 benchmark |
| **Agent runtimes with memory** | **Letta / Letta Code** (git-backed MemFS, Dreaming). **Hermes Agent** (provider catalog; bundles RetainDB and ByteRover). **OpenClaw**. **OpenViking** (ByteDance/Volcengine, AGPL-3.0, ~41.1K stars). | **Channel** (provider plugins); Letta competes for the sleep thesis |
| **First-party platform memory** | **OpenAI**: ChatGPT Memory with Dreaming V3, Codex memory v2, Agents SDK Sessions. **Anthropic**: Claude app memory, the memory tool (GA 2026-02-17), Managed Agents Memory Stores (beta), Dreams (research preview), Claude Code auto memory. | **Frenemy**: coexist and route (§6) |
| **Hyperscaler managed memory** | **AWS Bedrock AgentCore Memory** (GA 2025-10-13; short-term per-GB pricing from 2026-10-06). **Google Agent Platform Memory Bank** (renamed from Vertex AI Agent Engine). **Microsoft Foundry Agent Service memory** (preview, Ignite 2025). | **Complement**: cross-cloud system of record; adapters |
| **Enterprise knowledge platforms** | **Glean** ($300M+ ARR, 2026-05-28; Personal and Enterprise Graphs). **Microsoft Work IQ / Copilot memory** (read-only `coreMemories` MCP path from December 2026). **Atlassian Rovo / Teamwork Graph**. **Notion 3.8** (2026-10-13). Guru, Box, Slack, Dust, Onyx. Start-ups: ContextVault, Rafter, Decispher, Skillsync (YC W26), Sentra. Control planes: Agent 365, IBM ContextForge 1.1.1 (2026-11-10). | **Complement** (G2): learned experience next to indexed documents; import source |
| **Framework-native memory** | LangGraph `BaseStore` / LangMem, LlamaIndex Memory, CrewAI `StorageBackend`, **Mastra Observational Memory**, Strands `MemoryStore`, ADK `BaseMemoryService`, Microsoft Agent Framework `ContextProvider`, Pydantic AI Harness `MemoryStore`, Claude Agent SDK `SessionStore`, OpenAI Agents SDK Sessions, Vercel AI SDK (tool pattern). | **Channel**: ship adapters |
| **Specialists** | **Honcho** (peer/user modelling, AGPL-3.0). **Basic Memory** (Markdown, Teams, 1.0). **claude-mem** (~104K stars, Claude Code plugin). **ByteRover** (Markdown context tree; Hermes-bundled). **MemPalace** (credibility collapse, 2026-04). Accuracy-research systems: **Exabase M-1**, **Papr**, **Emergence**, **Redis Remis**. | Learn from; Honcho is orthogonal |

---

## 3. Competitor profiles

Threat is rated per goal: **G1** (Claude skill), **G2** (enterprise multi-user fork),
**G3** (core accuracy, speed, manageability, stability).

### 3.1 Zep / Graphiti — threat: HIGH (G2), MEDIUM (G3)

- **What it is.** Graphiti is an Apache-2.0 Python framework for bi-temporal context
  graphs on Neo4j, FalkorDB or Neptune. Zep is the proprietary managed platform built on
  it, now pitched as "the unified context layer for enterprise data".
- **2026 moves.**
  - Context (formerly Memory) MCP Server: generally available on all plans, managed and
    BYOC (2026-08-19). Streamable HTTP, OAuth 2.1 + PKCE.
  - zep-context plugin with a skill, for Claude, ChatGPT, Codex and Cursor.
  - v4 Context API GA (2026-10-14): graph navigation, idempotency keys, identity and
    protected properties.
  - Hyperedges (2026-10-15).
  - Agent Skills, which compiles verified traces into versioned SKILL.md files
    (2026-11-05, arXiv 2611.01386).
  - "Company brain" positioning (2026-11-12).
- **Strengths vs MemForge.**
  - Higher QA on the same reader family: 71.2% vs 67.6% on LongMemEval-S with a gpt-4o
    reader, though the snapshots differ. Zep is ahead on temporal reasoning (62.4 vs 56.4;
    Zep paper; its other per-category rows are unreliable, because the gpt-4o row appears
    to duplicate the gpt-4o-mini row).
  - Real bi-temporal invalidation.
  - Governance: OIDC SSO, SCIM (beta), RBAC for humans, and ABAC for agents. Default-deny
    applies to Enterprise UserGroup access; API-key ABAC defaults to allow, per the
    fact-check.
  - SOC 2 and HIPAA.
  - Identity-fixed MCP scope.
- **Weaknesses vs MemForge.**
  - The governed platform cannot be self-hosted: Community Edition ended 2025-04-02, and
    BYOC is Enterprise-only.
  - Graphiti's own servers are reference-only, with no auth.
  - It needs a separate graph database.
  - Ingestion is LLM-heavy and metered.
  - A disputed LoCoMo history: claimed 84%, corrected to 75.14%; Mem0's re-run gave 58.44%.
  - No per-memory epistemic status beyond skill maturity.
- **Learn.**
  - Identity-derived scoping, with the agent supplying no `agent_id` (G2).
  - A personal scope plus shared scopes per group (G2).
  - Protected properties that the sleep-cycle LLM must never rewrite (G2; addresses SC-8,
    SC-10).
  - A plugin that bundles skill and connector (G1).
  - Verified-procedure compilation to SKILL.md (G1/G3).
  - Report accuracy, latency and context tokens together (G3).

### 3.2 Hindsight (Vectorize) — threat: HIGH (G3, G1), MEDIUM-HIGH (G2)

- **What it is.** An MIT-licensed memory server on Postgres, with Hindsight Cloud and an
  Enterprise tier (SSO, BYOC, on-prem, and Memlake, a Rust object-store engine).
  MemForge's closest architectural analogue.
- **2026 moves.**
  - Cloud MCP with OAuth 2.1, Dynamic Client Registration and PKCE (2026-03-30).
  - BEAM claims (2026-04-02).
  - Knowledge Pages (0.9.0, 2026-08-06).
  - An installer that wires one shared bank per repository into 10, later 18, coding
    agents.
  - v1.0 stable-API commitment (2026-10-13), passing 50K stars (2026-10-15).
  - Per-document change history (1.1.0, 2026-10-21).
  - Its own models and benchmark site (2026-11-03).
- **Strengths vs MemForge.**
  - Traction (~56K org stars on 2026-10-29) and shipping cadence.
  - Four-way retrieval (semantic, BM25, graph, temporal) with RRF and a cross-encoder.
  - An answer-synthesis layer (reflect/CARA): 91.4% LongMemEval-S QA with a Gemini-3 Pro
    reader and 83.6% with OSS-20B (self-reported, GPT-OSS-120B judge). This is the layer
    where MemForge's reading gap sits.
  - Stability promises (503 + Retry-After).
  - A stated scale envelope: Postgres below ~50K memories per bank, Memlake beyond.
- **Weaknesses vs MemForge.**
  - Team, org and scoped-key features are Cloud/Enterprise only (issue #2235, possibly
    stale).
  - Self-hosted MCP is bearer-only.
  - Change history records ids and counts, not content.
  - No epistemic status, hearsay discounting or tamper-evident audit found.
  - The July notes recorded no supersession and no bi-temporal model (not re-verified).
- **Learn.**
  - Token-budgeted recall with a cross-encoder (G3).
  - An `ask`/`reflect` reader endpoint with cost tiers (G3).
  - Knowledge Pages as reviewable institutional memory (G2).
  - "The API is a promise" release discipline (G3; SR-7, SR-17).
  - A published scale envelope (G3; PERF-20, unverified).
  - A one-command multi-agent installer (G1).

### 3.3 Mem0 — threat: HIGH (distribution, G1), MEDIUM (G2, G3)

- **What it is.** A YC-backed company ($24M). Apache-2.0 SDKs and self-hosted server,
  plus the paid Mem0 Platform.
- **2026 moves.**
  - v2.0.0 (2026-04-16): single-pass, add-only extraction; semantic + BM25 + entity
    fusion; external graph stores removed.
  - Dream on the Platform (Aug/Sep 2026): merge and supersede inline on all plans;
    synthesis on Pro+, weekly on Pro and roughly daily on Enterprise.
  - Mem0 Gateway (agent identity, tool permissions, audit).
  - DolphinBench (2026-09-22).
  - Vercel Marketplace (~2026-09-16).
  - Claude Code, Codex, Cursor and other plugins; a hosted MCP endpoint.
  - OpenMemory removed from the monorepo (2026-07-29).
  - New accounts can now buy only Free and Custom plans.
- **Strengths vs MemForge.**
  - Distribution: 67.6K stars and 2.46M PyPI downloads a month, against 28 npm downloads
    a month for MemForge.
  - Plugins on every agent surface.
  - Org → project roles and per-user keys.
  - A compliance posture (SOC 2 Type I, HIPAA-ready).
  - ~7K tokens per query.
- **Weaknesses vs MemForge.**
  - The open core is hollow: graph, Dream, temporal, orgs and export are Platform-only.
  - Add-only accumulation, with superseded facts in default reads unless `latest_only`
    is set.
  - Independent reproductions fall far below its claims. MemTensor OmniMemEval measured
    56.00 LongMemEval-S QA and 77.68 LoCoMo QA (gpt-4.1-mini reader, gpt-4o-mini judge),
    against self-reported 94.4 and 92.5 with an unnamed reader.
  - Only READER and OWNER roles.
  - No reported gains from Dream.
- **Learn.**
  - Skills split by job: runtime use, integration, operations (G1).
  - Plugin hooks: SessionStart → resume, PreCompact → extract (G1).
  - Tiered sleep: cheap merge and supersede near write time, expensive synthesis on a
    gated schedule (G3).
  - An entity arm in RRF (G3).
  - One-click marketplace provisioning (G2).
  - Run on the neutral harnesses where Mem0 already has numbers (G3).

### 3.4 Anthropic first-party memory — threat: HIGH for single-user Claude memory (G1), MEDIUM (G2)

- **What it is.**
  - Claude app memory, per user and per project.
  - The memory tool `memory_20250818`: GA 2026-02-17, client-side storage, ZDR- and
    HIPAA-eligible.
  - Managed Agents Memory Stores (beta, `agent-memory-2026-07-22`): hosted,
    path-addressed, immutable per-write versions, `redact`, `content_sha256` concurrency.
  - Dreams (research preview since 2026-05-06): non-destructive; writes a new store.
  - Claude Code CLAUDE.md files and auto memory.
- **2026 moves.**
  - Skills API GA (2026-08-19).
  - Agent Skills donated to the Agentic AI Foundation (2026-10-22).
  - Plugins in the claude.ai developer portal (2026-09-25).
  - Enterprise Managed Auth for connectors.
  - Dreams added Opus 5.5, Fable 5.1 and Sonnet 5.5 (2026-10-01).
  - Memory export and transfer between AI services, labelled experimental.
- **Strengths vs MemForge.**
  - Zero-install defaults on every Claude surface.
  - A safe consolidation UX: Dreams never modifies its input.
  - Governance primitives MemForge lacks: actor-attributed versions, `redact`,
    optimistic concurrency.
  - Model co-design.
- **Weaknesses vs MemForge.**
  - Claude-locked.
  - No team or institutional memory beyond sharing a Memory Store across sessions in one
    API workspace.
  - Memory Stores have no retrieval engine: grep and read, 100 kB per memory, 10k
    memories per store.
  - Memory Stores and Dreams are not ZDR- or HIPAA-eligible, and there is no self-host.
  - No published memory benchmarks.
- **Learn.**
  - Non-destructive, reviewable revision by default (G3). MemForge's
    `output_mode: 'new_namespace'` is currently rejected in code (`memory-manager.ts:3710`).
  - Rebuild the Memory Store bridge against the documented API (SC-3).
  - A memory-tool backend (G1).
  - Coexistence routing in the skill (G1; §6).

### 3.5 OpenAI first-party memory — threat: HIGH for consumer personal memory, LOW (G2)

- **What it is.** ChatGPT Memory, rebuilt as background Dreaming V3 (2026-06-04, Plus and
  Pro first). Also Codex memory v2 (default from October 2026), Conversations/Responses
  compaction, Agents API sessions (beta 2026-09-10; US-only, no ZDR), and Agents SDK
  Sessions with file-based sandbox memory.
- **2026 moves.**
  - Per-response "memory sources" (2026-05-05).
  - Per-role memory toggles for Enterprise and Edu (2026-06-25).
  - Plugins that bundle skills and MCP apps, shared across ChatGPT and Codex
    (2026-07-09).
  - Space and Dots (DevDay, 2026-09-29).
  - Secure MCP Tunnel for private servers.
- **Strengths vs MemForge.**
  - ~900M weekly users (Feb 2026).
  - The only published longitudinal improvement figure, though internal: factual recall
    41.5% → 82.8%, preference adherence 71.3%, time-sensitive accuracy 75.1%.
  - A memory summary page for review and steering.
  - Mature end-user controls.
- **Weaknesses vs MemForge.**
  - No team or institutional memory. Shared projects are project-only, and Space pages do
    not share members' memory.
  - No memory API and no portability.
  - Opaque: no epistemic status or revision history exposed.
  - No self-host.
- **Learn.**
  - Publish the same three axes (factual recall, preference adherence, time-sensitive
    accuracy) openly, with sleep on and off (G3).
  - Per-answer memory sources in tool responses (G1/G3; needs RA-11).
  - An editable memory-summary document generated by sleep (G2).
  - A documented Secure MCP Tunnel runbook for self-hosted MemForge (G2). Correction from
    the fact-check: the tunnel client can reach stdio servers, so stdio is not a hard
    blocker for ChatGPT, but the stdio framing must first be fixed (SR-2).

### 3.6 Cognee — threat: MEDIUM-HIGH (G2), LOW (G3)

- **What it is.** An Apache-2.0 Python memory engine (knowledge graph plus vectors,
  ontology grounding) with Cloud and Enterprise tiers. Backed by a $7.5M seed
  (2026-02-19). Its API has four verbs: remember, recall, improve, forget.
- **2026 moves.**
  - 1.0.0 shipped 2026-04-11, with the launch post on 2026-06-26.
  - Drive and Gmail connectors (v1.6.1, 2026-09-24).
  - A "One Brain For Every Agent" memo (2026-10-07): Claude Code and Codex share one graph.
  - A Claude Code plugin with 14 skills.
  - `memify()` deprecated in favour of `improve()` (v1.6.5, 2026-10-16).
- **Strengths vs MemForge.**
  - A working tenant → role → user → dataset ACL model, on by default in the Apache-2.0
    core and supported on Postgres/pgvector (fact-checked).
  - Institutional connectors.
  - A simple four-verb mental model, against MemForge's 72 routes and 46 MCP tools.
  - `improve()` feeds outcomes back into graph weights.
  - ~32.9K stars.
- **Weaknesses vs MemForge.**
  - Its production Postgres graph store is licensed, and SSO, BYOC, on-prem and
    air-gapped deployment are Enterprise-tier. (Multi-user mode does not force Kùzu +
    LanceDB; those are only the defaults, per the fact-check.)
  - No hosted OAuth remote MCP.
  - No bi-temporal model, epistemic status or audit chain found.
  - Its COGX export drops ACLs and audit history.
  - BEAM-10M QA of 67% was tuned on the same questions.
- **Learn.**
  - A four-verb skill model (G1).
  - Native Postgres grants on spaces with no superuser bypass (G2).
  - A gated promotion path from session to team "lessons" (G2).
  - Feedback-weighted graph edges (G3).

### 3.7 Microsoft Copilot memory / Work IQ — threat: MEDIUM-HIGH (G2 in Microsoft 365 organisations)

- **What it is.** Per-user Copilot memory (preview), plus Work IQ, a context layer with
  data, memory and skills exposed through a remote MCP server.
- **2026 moves.**
  - Work IQ MCP overview (doc dated 2026-11-10).
  - Message Center MC1539004 (2026-11-05): from December 2026, authorized agents get a
    read-only `/memory/me/coreMemories` path to the signed-in user's memory.
  - Copilot memory documentation (2026-11-03): preview; Purview retention does not apply;
    no audit logging.
  - Agent 365 at $15 per user; M365 E7 at $99.
- **Strengths.**
  - Permission-trimmed retrieval with sensitivity labels.
  - Bundling into existing seats.
  - The Purview compliance plane, which even covers ChatGPT and Claude Enterprise
    interactions (2026-05-27).
- **Weaknesses.**
  - Copilot memory is per-user, outside Purview retention and audit, and admins cannot
    restrict what enters it.
  - The Work IQ memory exit is read-only and single-user.
- **Learn.**
  - Import `coreMemories` into a governed per-user scope, making MemForge the portability
    hub (G2).
  - Build the compliance plane exactly where Microsoft is weak for memory: retention,
    legal hold, audit (G2).

### 3.8 Supermemory — threat: MEDIUM (G1, G3), LOW (G2)

- **What it is.** A VC-backed managed memory engine with MIT SDKs and plugins; the engine
  is closed. Self-host is a non-public binary capped at 10,000 documents.
- **2026 moves.**
  - Dynamic Dreaming (2026-05-25), self-triggered, with no quantitative results.
  - SMFS agent filesystem (2026-05-28).
  - Discontinued the company-brain and Nova products to go "all in on the memory engine"
    (2026-09-10).
  - Open-sourced Company Brain under Apache-2.0 (2026-09-25).
  - Teardown of Claude Code auto memory (2026-10-28).
- **Strengths.**
  - Remote OAuth MCP with per-space consent (read-only or read-write, time-boxed).
  - A four-hook Claude Code plugin (2.8K stars).
  - A backend for Anthropic's memory tool.
  - Connectors and multi-modal ingest.
  - SOC 2 Type II and a HIPAA BAA.
- **Weaknesses.**
  - Closed engine.
  - Its LongMemEval 97% is labelled both as Recall@20 and as QA.
  - Its own docs say its logs are "not a complete audit trail".
  - No epistemic model.
  - It left the team market.
- **Learn.**
  - Consent-time scoping in the OAuth flow (G2).
  - Auto-inject vs advisory recall modes (G1).
  - A memory-tool backend (G1).
  - The open Company Brain design for layered org/team/personal read scopes (G2).

### 3.9 Letta — threat: MEDIUM (G3 thesis), LOW (G2)

- **What it is.** A stateful-agent company (Berkeley Sky Lab spin-out, $10M seed in 2024).
  Its flagship is now **Letta Code**, a model-agnostic coding agent with git-backed MemFS
  memory.
- **2026 moves.**
  - "Our Next Phase" (2026-03-16): server-side features sunset; sleep-time agents became
    client-side Dreaming subagents that run after N steps or on compaction.
  - Letta Code App (April 2026).
  - Mods (June 2026).
  - Letta Agents SDK (2026-08-17).
  - The V1 Postgres server was archived.
- **Strengths.**
  - The sleep-time-compute paper (arXiv 2504.13171): ~5x less test-time compute at equal
    accuracy on math tasks (self-reported).
  - Diffable, git-tracked memory.
  - Brand lineage (MemGPT).
- **Weaknesses.**
  - Runtime lock-in: you get Letta memory by running inside Letta.
  - No neutral memory server for other assistants.
  - Evidence is not on conversational memory. Its LoCoMo 74.0% (gpt-4o-mini reader,
    scoring method unstated) used a now-retired filesystem path.
- **Learn.**
  - Reuse the Pareto framing (accuracy against query-time compute, with and without
    sleep) for MemForge's longitudinal benchmark (G3; SC-12).
  - Activity-triggered light sleep (G3).
  - A versioned, diffable memory view (G2).

### 3.10 Mastra Observational Memory (framework-native) — threat: MEDIUM (G3 accuracy bar)

- **What it is.** Mastra's (Apache-2.0) observation-style memory, which compresses history
  into dated observations and reflections.
- **2026 moves.**
  - LongMemEval-S **QA 84.23%** with a gpt-4o reader (gpt-4o judge, self-reported,
    2026-02-09); Redis reproduced 84.2%.
  - 94.87% with gpt-5-mini.
  - BEAM-10M QA 66.4% (Opus 5.5 answerer, 2026-10-29).
- **Strengths.**
  - The clearest like-for-like accuracy lead over MemForge, by category: temporal 85.7 vs
    56.4, multi-session 79.7 vs 59.4, preference 73.3 vs 56.7.
  - Framework distribution (@mastra/core 12.1M npm downloads a month).
- **Weaknesses.**
  - Locked to the Mastra framework.
  - LLM-heavy ingest ($0.365 per session vs $0.0703 for Redis Remis+Instruct, per Redis).
- **Learn.**
  - Dated observations plus a resident, prioritised preference block in front of the
    reader (G3; RA-20, unverified; RA-14).

### 3.11 Hyperscalers (AWS AgentCore Memory, Google Agent Platform Memory Bank, Microsoft Foundry memory) — threat: HIGH within each cloud, LOW for sovereign and cross-cloud use

- **What they are.** Managed, usage-billed memory bundled with each cloud's agent runtime.
  All three converged on raw events plus asynchronous LLM extraction into compact records,
  scoped by IAM.
- **2026 moves.**
  - AgentCore short-term pricing moved to per-GB from 2026-10-06.
  - Google renamed the product to Gemini Enterprise Agent Platform.
  - Microsoft Agent Framework 1.26 GA ships context providers, including Foundry memory.
  - *Note:* the 2026 detail on these services is thin. The research card was drafted from
    model knowledge and only partly corrected.
- **Strengths.**
  - IAM, KMS, PrivateLink and compliance inherited from the cloud.
  - Pluggable extraction strategies.
  - AgentCore self-reports 73.60% LongMemEval-S QA at 94% compression against a 75.2%
    full-context baseline (2025-10-15, reader not found).
- **Weaknesses.**
  - Locked to one cloud.
  - No self-host.
  - No native MCP endpoint for the memory store found.
  - No sleep-style revision, epistemic status or cross-agent trust semantics.
- **Learn.**
  - Asynchronous, event-first ingest with a published time-to-memory metric (G3; PERF-8).
  - Hierarchical namespaces bound to verified identity claims (G2).
  - Certify MemForge on each cloud's managed Postgres (G2).

### 3.12 Glean, Atlassian Rovo, Notion and the suite knowledge platforms — threat: MEDIUM (G2)

- **What they are.** Horizontal knowledge platforms that index source systems with
  permission inheritance and now expose remote OAuth MCP. Glean reaches 22 tested hosts.
- **2026 moves.**
  - Glean markets "enterprise memory" that "learns continuously" (Agentic Engine 2,
    2025-09-25) and passed $300M ARR (2026-05-28).
  - Notion 3.8 (2026-10-13) pitches Notion as the "shared place" for MCP agents and syncs
    skills to ChatGPT and Claude.
  - Atlassian MCP v2 reaches ChatGPT, Claude, Gemini and Copilot CLI.
- **Strengths.**
  - Permission-aware retrieval from source ACLs.
  - Buyer trust.
  - Bundling.
- **Weaknesses.**
  - They index *authored documents*. Decisions, procedures, failed approaches and lessons
    from AI sessions mostly evaporate or become private preferences.
- **Learn.**
  - Position MemForge as the learned-experience layer beside these platforms, not a
    document indexer (G2).
  - Copy Guru's owner and verify-by-date workflows on top of epistemic status (G2).

### 3.13 Honcho (Plastic Labs) — threat: LOW-MEDIUM

- **What it is.** Peer-centric user and agent modelling (workspace → peers → sessions),
  AGPL-3.0, with a hosted option.
- **2026 moves.**
  - v3.x: deriver at ingest, a Dreaming Agent offline, a Dialectic agent at query time.
  - LongMemEval-S QA 90.4% (claude-haiku-4.5 as dialectic and dreamer, self-reported).
  - Best DolphinBench entry with Claude Code + Sonnet 5, at 35.83%.
- **Learn.**
  - Peers (humans and agents) as first-class principals in a team scope model (G2).
  - Priced reasoning levels for a reader endpoint (G3).

### 3.14 Redis (Agent Memory Server; benchmark referee) — threat: MEDIUM (G3)

- **What it is.** Redis ships a self-hostable Agent Memory Server (REST plus MCP), and on
  2026-09-21 published the first broad cross-vendor LongMemEval-S reproduction with a
  gpt-4o reader. Redis is a competing vendor, not a neutral party.
- **Why it matters.**
  - Remis is hybrid dense + BM25, with topic-shift chunks plus neighbour expansion and no
    LLM at ingest. That is MemForge's architecture class.
  - Remis reaches **83.4% QA** (gpt-4o reader, official GPT-4o judge, self-run), and
    **86.5%** with an extracted-facts lane (Remis+Instruct).
- **Learn.** Chunking and neighbour restore is the cheapest proven lever for MemForge's
  15.8–18.9 point gap (G3; RA-1, RA-14).

### 3.15 Framework memory contracts (LangGraph, Strands, ADK, Microsoft Agent Framework, Pydantic AI, CrewAI, Claude Agent SDK) — threat: MEDIUM as defaults, HIGH as a missed channel

- **2026 moves.** Almost every framework gained a pluggable long-term memory contract:
  - Strands `MemoryManager` / `MemoryStore` (docs 2026-10-21);
  - Pydantic AI Harness `MemoryStore` (first release 2026-04-13);
  - CrewAI `StorageBackend`;
  - ADK `add_memory`;
  - Microsoft Agent Framework `ContextProvider` (GA 1.26);
  - Claude Agent SDK `SessionStore` with a conformance suite.

  File-shaped, versioned memory with compare-and-swap became the dominant 2026 pattern.
- **Strengths.** Reach: ai 167.7M npm downloads a month; claude-agent-sdk 69.1M npm plus
  35.6M PyPI; langgraph 57.3M PyPI.
- **Weaknesses.** Each is locked to its framework, has shallow lifecycles, and offers no
  cross-agent trust or audit.
- **Learn.** Adapters are MemForge's cheapest distribution:
  - Strands `MemoryStore`: roughly a day (S); only `search` is required.
  - ADK `BaseMemoryService`: S/M.
  - AI SDK provider: S/M.
  - LangGraph `BaseStore`: needs key-addressable, read-your-writes storage that MemForge
    lacks (M).

### 3.16 Other specialists and start-ups (grouped) — threat: LOW individually

- **Basic Memory:** an uploadable `basic-memory.zip` skill plus a Claude Code plugin with
  a session-start briefing and a pre-compaction checkpoint; Teams with
  Admin/Editor/Viewer roles (2026-05-31); 1.0 with a wiki (October 2026). **Learn:** the
  exact G1 packaging shape.
- **claude-mem:** ~104K stars, Apache-2.0, a Claude Code plugin rather than MCP.
  **Learn:** plugin-first reach beats server features for single developers.
- **OpenViking:** AGPL-3.0, ~41.1K stars; L0/L1/L2 tiered context written at ingest.
  **Learn:** token-tiered results (WB-10).
- **ByteRover:** a Markdown context tree with team spaces; bundled in Hermes.
- **Memori:** memory from agent execution traces (2026-05-07). **Learn:** trace ingest
  for procedure learning.
- **MemOS:** npm and PyPI packages compromised on 2026-09-23. **Learn:** release
  supply-chain hardening (trusted publishing, provenance) is now a buyer question.
- **MemPalace:** "500/500" was R@5 tuned on the test set, a cautionary tale.
  **Learn:** MemForge's honest labelling is an asset; keep it.
- **Organisational-memory start-ups** (ContextVault 2026-07, Rafter 2026-08, Decispher
  2026-08, Skillsync YC W26 2026-09, Sentra): they validate demand for "why we decided"
  and "how we fixed it" memory. Sentra offers VPC and air-gapped deployment but is closed.

---

## 4. Capability matrix

MemForge cells follow the audit. A feature that exists but is broken or dormant is
**Partial**, with the audit ID. Competitor cells are dated in §3. **Paid** means a paid or
managed tier only.

### 4a. Memory quality and lifecycle

| Capability | MemForge (honest) | Mem0 | Zep / Graphiti | Hindsight | Letta | Supermemory | Cognee | Anthropic 1P | OpenAI 1P |
|---|---|---|---|---|---|---|---|---|---|
| Background consolidation / revision | **Partial**: a 15-phase sleep cycle exists, but 8 phases self-disable after 3 idle cycles (SC-1, SR-3); no scheduler; refuses to run without an LLM (SC-24, unverified; spot-checked) | Paid (Dream) | Partial (ingest-time invalidation, Observations) | Partial (reflect, Knowledge Pages) | Yes (Dreaming subagents) | Yes (Dynamic Dreaming) | Yes (`improve()`) | Yes (Dreams, preview) | Yes (Dreaming V3) |
| Non-destructive, reviewable revision | **Partial**: in-place revision with full revision history; `new_namespace` output is rejected in code; apply path non-transactional (SC-5); "merge" does not merge (SC-8) | Partial (supersede keeps history) | Yes for facts (invalidate, not delete) | Partial (ids/counts history) | Yes (git MemFS) | Partial | n/f | **Yes** (new output store) | Partial (summary page) |
| Measured consolidation benefit | **No** (SC-12) | No | No (skills only) | n/f | Partial (math-task paper) | No | n/f | No | Internal only (41.5→82.8%) |
| Bi-temporal / validity windows | **Partial**: `occurred_at` and `valid_until` exist; `occurred_at` drives only after/before filters (RA-4); `valid_until` and confidence ignored in ranking (RA-8); time words become hard filters (RA-3) | Paid (as-of search, expiry) | **Yes** | Partial (temporal arm) | No | Partial | n/f | No | n/f |
| Supersession and conflict handling | **Partial**: the supersede hint lowers confidence but does not hide (RA-9); conflict detection has no producer (RA-10, SC-2); superseded rows not demoted (RA-8) | Paid; OSS add-only | **Yes** | n/f | No | Yes (claimed) | n/f | n/f | Partial (opaque rewrite) |
| Knowledge graph | **Yes**: recursive CTEs in Postgres, agent-scoped, not namespaced; traversal enumerates paths (PERF-16, unverified) | Paid | **Yes** (+ hyperedges, navigation) | Yes | No | Yes | **Yes** (+ ontology) | No | No |
| Epistemic status per memory | **Partial**: 5 states, evidence counts and a filter exist; promotion depends on feedback that cannot be closed via the API (RA-11, MX-3); filter runs after LIMIT (RA-7, unverified) | No | Partial (skills maturity only) | n/f | No | No | No | No | No |
| Provenance, trust and explainability | **Partial**: hearsay discount (0.8^hops × reputation) and `explain` (v3.10) exist; pool scores use an incompatible scale (RA-15); no actor in the audit (SEC-7) | Partial | **Yes** (episodes, protected properties) | Partial ("Based On") | Partial (git) | n/f | Partial | Partial (versions) | Yes for users (memory sources) |
| Published QA benchmark (metric, reader) | **Yes**: 67.6% QA, gpt-4o reader; measured config is not the shipped default (RA-14, RA-1) | Yes (reader not named) | Yes | Yes | Partial | Partial (labels inconsistent) | Partial (tuned) | No | Internal only |
| Independent reproduction | **No** | Yes (and far lower) | Disputed | n/f | No | Partial | No | No | Partial (2025 LoCoMo) |

### 4b. Enterprise, distribution and operations

| Capability | MemForge (honest) | Mem0 | Zep / Graphiti | Hindsight | Letta | Supermemory | Cognee | Anthropic 1P | OpenAI 1P |
|---|---|---|---|---|---|---|---|---|---|
| Team / org shared memory | **Partial**: shared pools with publish/subscribe exist; pool admin routes unusable when user and admin tokens differ (MX-5); pool reads need membership checks (SEC-4); pool dedup deletes without archive or audit (SC-9, ARCH-11); no user or org model | Paid (orgs/projects) | **Yes** (shared graphs) | Paid | Partial | Partial (Scale+) | **Yes** | Partial (shared store) | No |
| Identity, RBAC, SSO | **No**: one shared bearer token or coarse OAuth introspection; no principal model (SEC-1, ARCH-2, SEC-14) | Paid | Yes (Enterprise) | Paid | n/v | Partial | Yes | Yes (platform) | Yes (platform) |
| Enforced isolation / permission-aware retrieval | **Partial**: RLS policies exist but are not applied on the application path (SEC-2, ARCH-6); isolation is an `agent_id` filter | Partial | Yes | Partial | n/v | Yes | Yes | Yes | Yes |
| Tamper-evident audit chain | **Partial**: an HMAC chain with content snapshots exists; verification flags healthy data (SR-4); concurrent writers fork the chain (SEC-8); several event types dropped, no actor (SEC-7) | No (request logs) | No (conventional logs) | No | Partial (git) | No | No | Partial (versions, `redact`) | No |
| Compliance attestations | **No** | Yes | Yes | n/v | n/v | Yes | Inconsistent | Partial (not for Stores/Dreams) | Yes (platform) |
| Remote MCP with OAuth | **No**: stdio only, and the stdio framing is not MCP-compliant (SR-2, MX-1) | Yes (hosted; OAuth vs API key n/v) | **Yes** | Yes (Cloud) | No (MCP client) | Yes | Partial (local HTTP) | Host | Host |
| Claude skill / plugin | **No** (G1 draft in progress) | Yes | Yes | Yes | Partial | Yes | Yes | Native | Plugins |
| Framework integrations (native contracts) | **Partial**: documentation examples and tool definitions only; M365 manifest cannot bind (MX-12, unverified) | **Yes** (broad) | Yes | Yes (60+) | Runtime | Yes | Yes | SDK | SDK (short-term) |
| Self-host with the full feature set | **Yes in principle** (MIT, Postgres only), but every documented install path fails (MX-2, PERF-1, SEC-3) | Partial (hollow core) | No | Partial (team features reportedly paid; issue #2235, mid-2026, possibly stale) | Partial (V1 archived) | No (closed, 10K-doc cap) | Partial | No | No |
| Managed cloud | **No** (by design) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Export / portability | **Partial**: JSONL export lossy and import capped at 100 KB (SR-9, ARCH-8) | Paid | n/v | Yes (zip) | Yes (`.af`) | Partial | Partial (drops ACLs) | Partial (experimental) | No |

**Reading the matrix.**

- MemForge has **no row where it is uniquely "Yes"** today.
- It has three rows where **no competitor has a "Yes"** and MemForge has a credible
  "Partial" that the audit's fixes would turn into "Yes":
  - epistemic status;
  - tamper-evident audit;
  - self-host with the full feature set (once install paths work).
- A fourth row, **measured consolidation benefit**, is empty for everyone except
  OpenAI's closed internal figure.

These four rows are the basis of the differentiation thesis in §9.

---

## 5. Benchmark landscape

> **Caution: no cross-metric comparisons.**
>
> - **Retrieval recall** (R@k, complete-evidence recall) measures whether the evidence was
>   retrieved. **QA accuracy** measures whether a reader answered correctly, as graded by
>   a judge. Recall is typically 20–30 points higher than QA, so the two are never
>   comparable.
> - **The reader dominates QA.** The same Mastra memory scores 84.23% with gpt-4o and
>   94.87% with gpt-5-mini. MemForge's own QA ranges from 56% to 70% across reader
>   families with identical retrieval.
> - **Grading and data matter.** Judge visibility moves LongMemEval-S by 2.4 points and
>   LoCoMo by 12.7 (MemStrata, 2026-09). LongMemEval shipped cleaned haystacks in 2025-09.
> - **Self-reported scores move under reproduction.** Redis found gaps of +3 to −28
>   points (2026-09-21).
>
> Compare only rows with the same benchmark, metric and reader.

### 5.1 LongMemEval-S, QA accuracy, gpt-4o reader (the only like-for-like cohort for MemForge)

| System | QA accuracy | Reader | Judge | Self / independent | Date | Notes |
|---|---:|---|---|---|---|---|
| Redis Remis+Instruct | 86.5% | gpt-4o | official GPT-4o binary judge | Self (Redis-run) | 2026-09-21 | Chunks plus an extracted-facts lane; $0.0703/session |
| Mastra Observational Memory | 84.23% | gpt-4o | gpt-4o | Self; **reproduced 84.2% by Redis** | 2026-02-09 | LLM-heavy ingest |
| Redis Remis | 83.4% | gpt-4o | official GPT-4o judge | Self (Redis-run) | 2026-09-21 | Hybrid dense+BM25, **no LLM at ingest**: MemForge's class |
| Emergence Simple | 82.4% (reproduced 81.3%) | gpt-4o | GPT-4o | Self; reproduced by Redis | 2026-09-21 (repro) | RAG baseline |
| AWS AgentCore (semantic) | 77.0% | gpt-4o | official GPT-4o binary judge | Reproduced by Redis (competitor); the vendor's own 73.6% names no reader | 2026-09-21 | Managed, single-cloud |
| *Oracle evidence only (reference)* | *82.4%* | *gpt-4o* | *GPT-4o* | *Paper* | *LongMemEval paper* | *Upper reference, not a system* |
| Zep | 71.2% | gpt-4o-**2024-11-20** | GPT-4o | Self | 2025-01 | Different gpt-4o snapshot; ~1.6K context tokens |
| **MemForge** | **67.6%** | **gpt-4o-2024-08-06** | **gpt-4o-2024-08-06** | **Self** | **2026-07-29** | Default retrieval config, but **one session per warm row** (not the shipped default, RA-14); harness supplies dates to the reader (RA-20, unverified); context p50 32,396 tokens |
| *Full-context baseline* | *~60.2%* | *gpt-4o* | *GPT-4o* | *Zep paper* | *2025-01* | *No memory system* |

Not in this cohort despite similar labels:

- Zep's 63.8% used a **gpt-4o-mini** reader.
- AWS AgentCore's own 73.60% does not name its reader (Redis's gpt-4o reproduction is in
  the table above).
- Supermemory's 81.6% (vendor-reported, cited secondhand by Mastra and Redis; §5.2).

### 5.2 LongMemEval QA with other readers (not comparable with §5.1 or with each other)

| System | QA accuracy | Reader | Judge | Self / independent | Date |
|---|---:|---|---|---|---|
| Exabase M-1 | 96.4% (top-50) | Gemini 3 Flash | Gemini 3 Flash | Self | 2026-05 |
| Papr | 96.0% (top-20) | Claude Opus 4.6 | gpt-4o-2024-08-06 | Self; prompts tuned on half the questions | 2026-11-13 |
| Mastra OM | 94.87% | gpt-5-mini | gpt-4o | Self | 2026-02-09 |
| Mem0 Platform | 94.4 | Not named | Not named | Self | 2026 |
| Hindsight | 91.4% (89.0% OSS-120B; 83.6% OSS-20B) | Gemini-3 Pro | GPT-OSS-120B | Self | 2025-12-14 |
| Honcho | 90.4% | claude-haiku-4.5 (dialectic) | n/f | Self | 2026 |
| Zep | 90.2% (variant not stated) | gpt-5.4 | gpt-5.4 | Self | 2026-09-29 |
| MemOS | 89.20 | gpt-4.1-mini | gpt-4o-mini | Maker-run harness (OmniMemEval) | 2026 |
| AWS AgentCore (semantic) | 73.60% (baseline 75.2%) | Not found | Not found | Self | 2025-10-15 |
| MIRIX-2.0 | 72.6% | n/f | n/f | Self | 2026-11-09 |
| Mem0 cloud | **56.00** | gpt-4.1-mini | gpt-4o-mini | **Independent** (OmniMemEval) | 2026 |

Supermemory's "97%" is labelled both "Recall@20 with aggregation" and LLM-judge accuracy
on its own pages. A secondary leaderboard lists 81.6% QA. Treat both as unconfirmed.

### 5.3 Retrieval recall (never compare with QA)

| System | Metric | Score | Self / independent | Date | Notes |
|---|---|---:|---|---|---|
| **MemForge** | R@1 / R@5 / R@10 / complete-evidence recall, LongMemEval-S | 83.8% / 95.4% / 97.6% / **91.8%** | Self | 2026-07-29 | Query p50 46 ms; one session per row |
| Supermemory | Recall@20 "with aggregation", LongMemEval-S | 97% | Self | 2026-05 | Also claims 95% Recall@15 |
| MemPalace | R@5, LongMemEval | 96.6% (headline "500/500" was recall_any@5) | Self | 2026-04 | Tuned on the test set |

### 5.4 Harder or holistic benchmarks (where credibility is now earned)

| Benchmark | Best published | Metric | Reader | Self / independent | MemForge |
|---|---|---|---|---|---|
| BEAM-10M | Exabase 68.0%; Cognee 67% (tuned on the test questions); Mastra OM 66.4%; Hindsight 64.1%; Mem0 48.6%; Honcho 0.409 | QA | Gemini 3 Flash (Exabase); Opus 5.5 (Mastra); haiku-4.5 (Honcho); others not stated | All self | **None** |
| DolphinBench (Mem0-authored, 2026-09-22) | 70.67% (Hermes + GPT-5.6-Luna + Mem0; secondary, unconfirmed); with Claude Code + Sonnet 5, Honcho 35.83% | Task completion (graded on tool calls), cost and latency required | Agent harness model | Self (vendor-run) | **None** |
| LongMemEval-V2 (2026-05-12) | AgentRunbook-C 72.5%; leaderboard empty | QA over web-agent trajectories up to 115M tokens | Varies | Paper | **None**; an open slot |
| LoCoMo (saturated) | Zep 94.7% (gpt-5.4); Mem0 92.5 self vs **77.68 independent** (gpt-4.1-mini); Honcho 89.9%; Letta 74.0% (gpt-4o-mini, scoring method unstated); AgentCore 70.58% | QA | As listed | Mixed | None, deliberately (July advice stands) |
| CrossLearnBench / MixUA (2026-11-07) | Scoped lessons +5 points over a single global memory, ≤0.02% leakage | Multi-user QA plus privacy probes | n/f | Paper | **None**; fits G2 |

### 5.5 Longitudinal and internal claims (not benchmarks in the usual sense)

| Claim | Figure | Metric | Self / independent |
|---|---|---|---|
| OpenAI ChatGPT Dreaming V3 | Factual recall 41.5% (2024) → 67.9% (2025) → 82.8% (2026); preference adherence 71.3%; time-sensitive accuracy 75.1% | Internal eval; production models unspecified; across system versions | Self, closed methodology |
| Letta sleep-time compute | ~5x less test-time compute at equal accuracy | Math tasks (GSM-Symbolic, AIME) | Self (paper, 2025-04) |
| Anthropic memory tool + context editing | +39% task performance | Internal agentic-search eval | Self |
| Zep Agent Skills | +4.5 to +18.8 points task success | Procedural skills from verified traces | Self (2026-11-05) |
| Mem0 Dream, Supermemory Dynamic Dreaming, Anthropic Dreams | None published | — | — |

### 5.6 Where MemForge's 67.6% sits

- **In the only like-for-like cohort** (LongMemEval-S QA, gpt-4o reader), MemForge is:
  - above the full-context gpt-4o baseline (~60%);
  - about 3.6 points below Zep's 2025 figure (different gpt-4o snapshot);
  - **15.8 to 18.9 points below** the 2026 leaders in its own architecture class: Redis
    Remis 83.4%, Mastra OM 84.23%, Remis+Instruct 86.5%.

  It is last among the gpt-4o results published in 2026.
- **Its own data locates the gap.** With 91.8% complete-evidence recall, the shortfall is
  in **context assembly and reading**:
  - whole-conversation warm rows (~10K characters; context p50 of 32K tokens);
  - no chunk-level embedding (RA-1);
  - no extracted-facts lane (RA-14);
  - no reader-facing dates or status from the server (RA-20, unverified).

  The leaders' measured gains came from exactly these techniques: topic chunks with
  neighbour restore, dated observations, and a reader protocol.
- **The product default is unbenchmarked** (RA-14, RA-1). The official run used one
  session per warm row, while the shipped default packs 50 events into a row, which the
  default 512-token embedder truncates. A third-party reproduction of "MemForge defaults"
  would probably land below 67.6%. **Fix or document this before anyone else measures it.**
- **What MemForge does have:** unusually honest labelling (QA separate from recall, reader
  named, defaults reported rather than tuned), a reproducible harness, and a ~$35–40 cost
  for a full run. These are the foundations for D1 and D5 in §9.

---

## 6. Platform and frenemy analysis

### 6.1 Background consolidation compared

| | MemForge sleep cycle | Anthropic Dreams | OpenAI ChatGPT Dreaming V3 | Mem0 Dream |
|---|---|---|---|---|
| **Status / date** | Shipped in code; unreleased on npm (MX-2) | Research preview since 2026-05-06 | Rolled out from 2026-06-04 (Plus/Pro, US first) | Platform only, Aug/Sep 2026 |
| **Trigger** | External only; no scheduler; `sleepAdvisory()` timing signal never updated (SC-22, unverified) | API call: 1–100 sessions plus a memory store | Automatic, background | Merge and supersede inline on every add; synthesis weekly (Pro) or ~daily (Enterprise), ≥20 memories |
| **Scope** | Agent-wide; namespace scoping recorded but not honoured (SC-18, unverified) | One memory store plus selected sessions | Per user | Per user/entity |
| **What it does** | 15 phases: SQL scoring and triage, capacity eviction, conflict resolution (inert, RA-10), LLM revision with history, graph and entity maintenance, reflection (gated), schema crystallisation, procedure evolution, embedding migration, epistemic promotion | Consolidates sessions into memory; instructions steer it | Synthesises memory across chats; rewrites stale memories | Merge duplicates, supersede contradictions (kept as history), synthesise "pattern" memories |
| **Non-destructive?** | No: revises in place with revision history; the new-namespace mode is rejected | **Yes**: output is a new store; input untouched | No (summary page to review and steer) | Partial (superseded kept) |
| **Measured benefit** | **None** (SC-12) | None published | **Internal** 41.5% → 82.8% factual recall | None published |
| **Auditability** | HMAC audit plus revision history, both with defects (SR-4, SEC-7, SC-10) | Observable session event stream; per-write versions | Opaque | Source tracing |
| **LLM required** | Yes, for every phase (SC-24, unverified; spot-checked), although most phases are SQL | Yes (Opus/Sonnet 5.5, Fable 5.1) | Yes | Yes |
| **Self-host / sovereignty** | **Yes** | No; not ZDR- or HIPAA-eligible | No | No (Platform) |
| **Cost control** | One global token budget | Token rates; minutes to hours | Bundled ("~5x less compute", claimed) | Plan-gated |

**Takeaway.** On paper, MemForge's cycle is the richest: more phases, explicit
epistemic transitions, SQL-only phases and self-hosting. In practice, three of its
signature phases are inert or self-disabling, it is the only one of the four that cannot
run without an LLM despite being mostly SQL, and it has no review gate. **The two features
the platforms ship and MemForge lacks are a non-destructive review step (Anthropic) and
a measured benefit (OpenAI).** Both are cheap relative to the rest of the cycle, and both
are prerequisites for claiming the thesis.

### 6.2 What first-party memory now covers (November 2026)

- **Personal continuity, per user and per project, on one vendor.** Claude app memory has
  editable topics and project isolation; ChatGPT memory has memory sources, a summary page
  and per-role admin toggles. On by default, free to the user.
- **Coding-agent memory on one machine.** Claude Code auto memory loads the first 200
  lines / 25 KB each session; managed CLAUDE.md is org-wide. Codex memory v2 is the
  default.
- **Developer primitives.**
  - Anthropic memory tool: GA, client-side storage, ZDR-eligible.
  - Memory Stores: hosted and versioned, shareable read-only or read-write across sessions
    in one workspace.
  - Server-side compaction on both vendors.
  - OpenAI Agents SDK Sessions.
- **Basic team sharing** (narrow): ChatGPT shared projects with project-only memory; one
  Anthropic Memory Store attached to many sessions; Microsoft Work IQ's read-only,
  single-user memory exit from December 2026.
- **Portability, starting:** Claude memory transfer between AI services (experimental);
  Work IQ `coreMemories` read path.

**Implication for G1.** For a single Claude user, "good enough" memory now ships free.
The skill's main job is **routing**:

- Native memory handles personal preferences and session continuity.
- MemForge handles knowledge that must be shared, cross-vendor, auditable, long-horizon,
  or governed (decisions, procedures, institutional facts).

Without explicit coexistence rules, Claude will double-write or ignore MemForge
(Anthropic research card).

### 6.3 Where an external, self-hostable, cross-platform memory still wins

1. **Cross-vendor memory.** No first-party memory is readable by another vendor's
   assistant except through experimental export. A team using Claude, ChatGPT, Copilot
   and Gemini has no shared memory today. *MemForge needs:* remote MCP with OAuth
   (MX-1/SR-2 first, then a Streamable HTTP endpoint).
2. **Team and institutional scope with ACLs.** None of OpenAI, Anthropic or Microsoft
   offers team memory with roles. ChatGPT Space explicitly does not share memory; Copilot
   memory is per-user. *MemForge needs:* a principal model, authorization and enforced
   RLS (SEC-1, ARCH-2, SEC-2, SEC-5).
3. **Sovereignty and regulated use.**
   - Anthropic Memory Stores and Dreams are not ZDR- or HIPAA-eligible.
   - OpenAI's Agents API is US-only with no ZDR.
   - Copilot memory is outside Purview retention and audit.
   - No first-party memory self-hosts.

   *MemForge has:* MIT, Postgres-only and air-gappable, once install paths work (MX-2,
   PERF-1).
4. **A real retrieval engine.** Memory Stores are grep-and-read with caps (100 kB per
   memory, 10k memories per store). MemForge has hybrid FTS + vector RRF with 46 ms p50 at
   benchmark scale, though the scale envelope is unmeasured (PERF-20, unverified) and the
   HNSW index is not created by default (PERF-2).
5. **Governance and measurability.** Per-memory epistemic status, provenance-weighted
   trust, tamper-evident audit and open benchmarks. No platform exposes these, and no
   platform publishes memory benchmarks (Anthropic) or publishes only closed ones
   (OpenAI).

### 6.4 Frenemy plays (integrate, don't fight)

- **Backend for Anthropic's memory tool** (`memory_20250818`): map
  view/create/str_replace/rename under `/memories/` to MemForge. Supermemory already does
  this. *Effort M (3–5 sessions).*
- **Remove the Memory Store bridge and the Dreams delegation from core; rebuild only on
  demand.** Both were built against an assumed format (SC-3) and rewrite content without
  revision, audit or re-embedding (SC-10). NEXT-ITERATION-PLAN removes them in RT-1 (or
  moves them to an unsupported contrib package) instead of maintaining them as
  "experimental", and renames the remaining layers "Anthropic Dreams-compatible". A rebuild
  on the documented API is a portability item (§6.5). *Effort S to remove, M to rebuild.*
- **ChatGPT reach before remote MCP:** document OpenAI's Secure MCP Tunnel against a
  self-hosted MemForge once the stdio framing is fixed (SR-2). *Effort S.*
- **Import the per-user exits** (Work IQ `coreMemories`, Claude memory export) into
  governed per-user scopes: MemForge as the portability hub (G2). *Effort M each.*

### 6.5 If a first-party platform ships team memory

This is threat T12. The direction is visible even though no platform ships org-shared
memory today.

- **Leading indicators.**
  - OpenAI has "teams of Dots" planned, alongside ChatGPT Space (openai card, DevDay
    2026-09-29).
  - Anthropic Memory Stores can be attached read-write to many sessions and agents in a
    workspace, and to self-hosted sandboxes since 2026-08-19 (anthropic card,
    fact-checked).
  - Claude memory transfer between AI services exists (experimental).
  - Work IQ opens a memory read path to agents from December 2026.
- **Tripwires** (reviewed at every release-train exit):
  - org-shared memory appears in Claude or ChatGPT business plans;
  - Memory Stores gain user ACLs, self-hosting, or ZDR/HIPAA eligibility;
  - a cross-vendor memory import/export standard appears.
- **Pre-agreed response.**
  - Drop any planned work that a single-vendor team memory already covers.
  - Target the enterprise edition only at multi-vendor, sovereign and regulated buyers.
  - Promote the portability items (the memory-tool backend, Claude memory-export and Work
    IQ imports, a Memory Store bridge rebuilt on the documented API) to the next release.
  - Position MemForge as the governed, cross-vendor system of record behind first-party
    memory, not as its rival.

---

## 7. Threats

| # | Threat | Evidence | Likelihood / impact | Mitigation (audit IDs) |
|---|---|---|---|---|
| T1 | **"Sleep cycle" reads as me-too.** Dreaming is now a platform default. | OpenAI (2026-06-04), Anthropic Dreams (2026-05-06), Mem0 Dream, Supermemory, Letta, Honcho, MIRIX AutoDream | High / High | Stop leading with the feature; lead with measured deltas (D1). Fix SC-1/SR-3, RA-10/SC-2 and SC-24 so the cycle does what the docs say. |
| T2 | **Zep closes the G2 white space** before the fork exists. | Context MCP GA on all plans (2026-08-19); v4 GA (2026-10-14); Agent Skills (2026-11-05); "company brain" (2026-11-12); SOC 2 and HIPAA | High / High | Compete where Zep structurally cannot: full self-host with SSO, SCIM and ABAC on-prem, plus open source (D3). Ship the principal model upstream first (ARCH-2, ARCH-3, ARCH-5, ARCH-16; i.e. AR-1, AR-2, AR-4, AR-8). |
| T3 | **Hindsight becomes "the MIT Postgres memory server."** | v1.0 stability promise; ~56K stars; Cloud OAuth MCP; 18-agent installer; benchmark site | High / High | Out-govern rather than out-feature (D2, D4); match its release discipline (SR-7, SR-17, MX-2). |
| T4 | **Credibility gap between the docs and the code.** In a field where MemPalace collapsed over benchmark claims, the gap is a reputational risk. | Features documented but absent (RA-9); security docs contradict the code (SEC-12); RLS "secure by default" claim not true on the app path (SEC-2); install channels fail, and the documented Python package name belongs to an unrelated project (MX-2); version strings disagree (SR-17, MX-15, unverified) | High / High | The "Truth & Trust" release: remove or implement every advertised feature (RA-9), correct the security docs (SEC-12), fix install paths (MX-2, PERF-1, SEC-3). Do this **before** any outreach. |
| T5 | **The accuracy gap becomes public.** | 15.8–18.9 points behind same-reader peers; the default config is unbenchmarked (RA-14, RA-1) | Medium / High | Chunk-level indexing and a facts lane (RA-1, RA-14); a reader-facing context format (RA-20); benchmark the shipped defaults; publish on neutral harnesses. |
| T6 | **Distribution asymmetry.** | 28 npm downloads a month vs Mem0's 2.46M PyPI; competitors in every plugin marketplace | Certain / Medium | Plugin plus skill (G1); MIT framework adapters (§3.15: Strands, ADK and the Anthropic memory tool first). |
| T7 | **Memory becomes a checkbox** in clouds and frameworks. | AgentCore, Memory Bank, Foundry; framework memory contracts in 2026 | High / Medium | Be a backend behind the contracts; position as the cross-cloud system of record. |
| T8 | **Building on moving first-party APIs.** | Memory Store headers changed 2026-07-02; MemForge's bridge targets an assumed shape (SC-3); MCP spec moved to stateless (2026-07-28) | Medium / Medium | Contract tests against the documented APIs; mark compatibility layers experimental; adapters live behind stable seams. |
| T9 | **Memory poisoning and leakage become buyer questions.** | >30 arXiv papers Aug–Nov 2026; write-time screening rejected 0 of 360 poisons (2026-08-21); Hindsight Memory Defense; Zep poisoning principles | Medium / High (G2) | Provenance and scope labels, memory zoning, quarantine to provisional status; prompt fencing that does not mutate content (SC-20, unverified); role-gated dream instructions (SC-21, SEC-11); classification on every ingest path (SEC-10, ARCH-14). |
| T10 | **Maintainer bandwidth and cadence.** | Last commit 2026-07-29; competitors ship weekly | Certain / High | Sequence ruthlessly (§9): truth first, then G1, then the G2 fork; no new feature surface until existing features work. |
| T11 | **Supply-chain and release integrity scrutiny.** | MemTensor npm/PyPI compromise (2026-09-23); MemForge's documented Python install name resolves to an unrelated package (MX-2) | Medium / High | Trusted publishing with provenance, signed images, and a renamed Python package (MX-2). |
| T12 | **First-party platforms ship team memory.** §3.4 and §3.5 describe today's gap; this is its direction. | OpenAI "teams of Dots" planned (DevDay 2026-09-29); Anthropic Memory Stores attachable read-write across sessions and agents, and to self-hosted sandboxes since 2026-08-19 (fact-checked); Claude memory transfer between services (experimental); Work IQ agent read path from December 2026 | Medium / High | Compete only on cross-vendor, self-hosted, governed memory; build the portability hub early (§8 item 8); be a backend for first-party memory (§6.4). Tripwires and response playbook in §6.5. |
| T13 | **Governance moves to MCP gateways.** §2 lists the category; buyers may get identity, policy and audit there. | Mem0 Gateway (agent identity, fail-closed per-tool policy, kill switch, audit; Start, Ship $99/mo and Scale tiers); Agent 365 ($15/user); IBM ContextForge 1.1.1 (2026-11-10); Cloudflare MCP portals | Medium / Medium | Run behind gateways and trust gateway-asserted identity; keep in MemForge only the governance that needs memory-level data (per-row ACLs, epistemic status, erasure, content audit); do not rebuild client approval or kill switches. |

---

## 8. Opportunities and white space

Ordered by fit with MemForge's existing assets and the owner's goals.

1. **Open, self-hosted, vendor-neutral team memory with epistemic governance (G2).** The
   2026-11-16 research names this slice and shows each nearby player missing a piece:
   - Zep: managed, BYOK or BYOC only;
   - Mem0: OSS lacks orgs, SSO and Dream;
   - Cognee: governance "optional" or "limited";
   - Sentra: closed;
   - Supermemory: closed engine, exited the team market.

   MemForge has the self-host, epistemic and audit assets and lacks every table-stakes
   element: remote MCP, OIDC identity, users and groups, ABAC, retention and hold, admin
   analytics (SEC-1, SEC-2, SEC-5, SEC-9, MX-1).
2. **Consolidation that respects permissions (G2).** Memories derived from interactions
   have no source ACL, so summarisation, revision and reflection can carry restricted
   facts into team-visible summaries. Nobody publishes a guarantee. Propagate maximum
   sensitivity and the intersection of ACLs through every derived memory. Publish a
   no-leakage result on CrossLearnBench/MixUA (2026-11-07), the first multi-user memory
   benchmark. Builds on SEC-5 and the classification fixes (SEC-10).
3. **A compliance plane where the incumbents are weak (G2).**
   - Copilot memory is outside Purview retention and audit (2026-11-03).
   - Anthropic Memory Stores are not ZDR- or HIPAA-eligible.
   - Supermemory's logs are "not a complete audit trail."

   Build per-space retention, legal hold, eDiscovery export and right-to-erasure (SEC-9)
   on an audit chain that verifies (SR-4, SEC-7, SEC-8).
4. **Own the longitudinal benchmark (G3).**
   - No vendor publishes consolidation deltas on standard benchmarks.
   - Benchmark ownership is now a competitive lever: Mem0 has DolphinBench; Hindsight runs
     agentmemorybenchmark.ai.
   - An open "improves over time" harness could be adopted by others. It should use
     MemoryAgentBench's test-time-learning and selective-forgetting splits, LongMemEval
     knowledge-update, and the Supersede environment, run with sleep on and off, with
     per-phase attribution.
   - The field's worst competencies are exactly the ones a sleep cycle claims to help:
     selective forgetting is ≤28% on multi-hop, and knowledge-update drops from 92% to 77%
     with bounded memory.
5. **Coexistence routing with first-party memory, usable without hooks on claude.ai Chat
   (G1).** Skills that teach *when* to use memory exist: Cognee ships a repo-level
   skill.md with "when to use which API" rules plus a Claude Code plugin (cognee-memos
   card), and Zep's plugin bundles a skill (enterprise-knowledge card). What none of them
   has is routing between the vendor's memory and the platform's own memory (§6.2), in a
   skill that works without hooks, which claude.ai Chat ignores and OpenAI's public
   directory strips (skills-distribution research, 2026-10-30).
6. **A backend for framework contracts and first-party tools (G1/G2).** Candidates: Strands
   `MemoryStore`, ADK `BaseMemoryService`, an AI SDK provider, a Microsoft Agent Framework
   `ContextProvider`, the Anthropic memory tool, and the Claude Agent SDK `SessionStore`.
   Each is S–M; distribution is measured in tens of millions of monthly downloads.
7. **A verified-procedure → SKILL.md compiler (G1/G2).** MemForge already has procedure
   evolution and epistemic states. Map them onto skill maturity and gate them on confirmed
   outcomes, as Zep Agent Skills does (+4.5 to +18.8 points task success, self-reported).
   This depends on fixing evidence drift in procedure evolution (SC-17, unverified) and
   on closing the feedback loop (RA-11).
8. **A portability hub (G2).**
   - Import Work IQ `coreMemories`, Claude memory export, Letta `.af`, and Mem0 and Zep
     exports.
   - Define a signed, versioned bundle that carries memories, graph, provenance, ACL
     grants and the audit chain. Cognee's COGX drops ACLs and audit.

   Requires a lossless export first (SR-9, ARCH-8).
9. **The sovereign and regulated segment (G2).** Hyperscaler and first-party memory cannot
   self-host. Certify MemForge on Aurora/RDS, AlloyDB/Cloud SQL, Azure Flexible Server and
   Lakebase. Fix the pgvector minimum documentation: halfvec needs pgvector 0.7.0+, not
   0.5+ (hyperscaler fact-check). Add per-tenant metering.
10. **Human-reviewable institutional knowledge (G2/G3).** Teams want memory as documents
    they can review: Hindsight Knowledge Pages, OpenAI's memory summary page, Guru's
    verification workflows. Emit reviewable pages and a curator queue (contested, stale,
    newly promoted) from the sleep cycle. An MCP Apps review UI renders inside Claude,
    M365 Copilot and VS Code.

---

## 9. Differentiation thesis

**Stop claiming:**

- "has a sleep cycle" (commodity, T1);
- "hybrid retrieval" or "knowledge graph" (table stakes);
- "46 MCP tools" (a liability: MX-6, and directories require tool annotations);
- "secure by default" (SEC-2);
- conflict detection, hints and preference extraction until they exist (RA-9, RA-10).

**Claim instead**, once the evidence below exists, four durable differentiators plus one
enabler. Each lists what is true today, what evidence is still needed (with effort), and
what would falsify it.

### D1. Memory that measurably improves, with open, reproducible proof

- **Why durable.** It is cheap for a solo maintainer to *measure* and expensive for
  closed platforms to *open*.
  - OpenAI's figure is internal and compares versions.
  - Anthropic, Mem0 and Supermemory publish nothing.
  - Letta's paper covers math tasks.
  - A null result is also publishable, and would still lead the field on method.
- **True today.** The cycle exists; nothing measures it (SC-12, confirmed).
- **Evidence still needed.**
  0. Own the open method: pre-register the protocol and release the harness with adapters
     for two or more other systems (for example Mem0 OSS and the Anthropic memory tool) by
     RT-3. Benchmark ownership is already contested: Mem0 owns DolphinBench, and Hindsight
     launched a benchmark site on 2026-11-03.
  1. Make the cycle run what it claims:
     - phase skips re-arm (SC-1, SR-3): S, 1 session;
     - a conflict producer (RA-10, SC-2): M, 3–5 sessions;
     - feedback closable via `retrieval_id` (RA-11, MX-3, PERF-22): S, 1–2 sessions;
     - SQL phases run without an LLM (SC-24, unverified; spot-checked): S, 1 session.
  2. A probe set plus before/after deltas per cycle and per phase (WB-05): M.
  3. A longitudinal harness with sleep on and off on third-party data: MemoryAgentBench
     test-time-learning and selective-forgetting splits, LongMemEval knowledge-update, and
     the Supersede environment, in the OpenAI three-axis format (factual recall,
     preference adherence, time-sensitive accuracy) and Letta's Pareto framing. **L**,
     ~18–27 sessions across L1a, L1b/c, L2 v0, L2 v1 and L3. The L2 v1 grid costs ≤ ~$500,
     inside the ~$1,500 benchmark budget through RT-6 (NEXT-ITERATION-PLAN decision 10).
  4. First public endpoint: the P1 stale-answer rate on knowledge-update streams, driven by
     RA-8 and RA-10, at RT-4/RT-5. The full ΔAUC claim follows at RT-6.
- **Falsified if** sleep-on does not beat sleep-off beyond run-to-run variance on any
  axis, or a competitor publishes an open sleep-on/off delta first. In the second case D1
  becomes a method claim (the open harness), not a product claim. If sleep does not help,
  publish that, and narrow the cycle to the phases that do help (WB-05's per-phase
  attribution).
- **Exposure.** D1 is the most exposed differentiator: no proof before RT-6, and the plan
  itself expects a delta near 0 on today's code (L1a).

### D2. Epistemic governance: every memory carries status, evidence, provenance and a reviewable history

- **Why durable.** No competitor exposes per-memory status
  (established/provisional/contested/deprecated/inferred) with evidence counts,
  hearsay-discounted provenance and explainable operations (enterprise-knowledge research,
  2026-11-16). It is a data-model property that is hard to retrofit onto add-only stores
  (Mem0) or file stores (Anthropic, Letta).
  - Nearby, but not the same: Hindsight 1.1 keeps per-document change history; Anthropic
    Memory Stores keep attributed, immutable versions with `redact`; Zep has bi-temporal
    invalidation and protected properties.
  - What remains unique to MemForge: an explicit five-state status with evidence counts,
    and hearsay-discounted provenance.
  - **Copyability risk.** Hindsight (MIT, weekly releases) could add per-memory status
    quickly. D2 holds only if MemForge ships it working and measured first.
- **True today.** The schema and filters exist. Status rarely moves because feedback
  cannot be closed (RA-11) and implicit evidence is not derived (SC-15, unverified).
  Superseded and expired memories are not demoted at query time (RA-8). Revision is in
  place, without a review gate.
- **Evidence still needed.**
  - Query-time demotion and `include_expired` (RA-8): M.
  - Implicit corroboration (SC-15): M. Scheduled in RT-5 (NEXT-ITERATION-PLAN §5).
  - Revision guards and a shadow-mode arm (SC-5, SC-8; RT-5). A non-destructive candidate
    namespace with diff and approve, like Anthropic Dreams (makes `new_namespace` real;
    SC-10), is **not scheduled**: it is part of the enterprise curation queue (E2-8), so
    the OSS claim does not depend on it.
  - Protected properties the LLM may not rewrite (from Zep v4): **not scheduled in core**;
    EE protects verified items (E1-7). Drop it from the OSS claim until scheduled.
  - Return status, `occurred_at` and provenance to the reader (RA-20, unverified): S.
  - Proof: a public test suite that walks provisional → contested → resolved, and a
    measured knowledge-update QA lift on LongMemEval-S **with an ablation**: status-aware
    context (A1 status fields plus RA-8 demotion) on versus off, on the knowledge-update
    dev subset. Without it, gains from A2 chunking would be credited to D2.
- **Falsified if** status-aware ranking produces no QA or knowledge-update lift and users
  ignore it. It would then be a governance feature for G2 rather than an accuracy feature.

### D3. Sovereign, vendor-neutral team memory: one self-hosted Postgres server that every AI platform reaches under the customer's identity

- **Why durable, and how narrow.** Self-hosting with SSO is already sold:
  - Hindsight Enterprise: single-tenant private cloud, BYOC or on-prem, with SSO and audit
    logs. Its OSS edition's team features are reportedly paid (issue #2235, unverified),
    and its self-hosted MCP is bearer-only.
  - Cognee Enterprise: BYOC, on-prem or air-gapped, with SSO. Cognee's Apache-2.0 core
    runs on-by-default tenant/role/user dataset ACLs on Postgres/pgvector (fact-checked);
    its production Postgres graph store is licensed.
  - Supermemory Enterprise: air-gapped deployment and SSO.
  - Zep BYOC (Enterprise).
  - Redis Agent Memory Server: self-hostable REST plus MCP (§3.14).
  - Mem0's OSS lacks orgs; first-party and hyperscaler memory are vendor- or cloud-locked.

  Self-hosting with SSO is a paid tier at four competitors. MemForge's position is
  narrower: team features that are free to self-host, with inspectable source, plus D2 and
  D4 on the same instance. It holds only if the team features ship under a licence that
  keeps that true (owner decision D-EE-2).
- **True today.** MIT and Postgres-only, but:
  - no working install path (MX-2, PERF-1, SEC-3);
  - stdio MCP that does not speak MCP framing (SR-2, MX-1);
  - no principal (SEC-1, ARCH-2);
  - RLS not enforced (SEC-2, ARCH-6);
  - shared pools unusable in secured deployments (MX-5).
- **Evidence still needed.**
  1. Working install channels and stdio framing: S–M, 3–4 sessions.
  2. Auth that fails closed in every deployment path (ARCH-1, MX-4): S.
  3. Upstream seams for the fork: injectable auth, injectable pool, `MemoryContext`
     (ARCH-3, ARCH-5, ARCH-4): M.
  4. Principal, authorization middleware and enforced RLS (SEC-1, SEC-2): **L**.
  5. A remote Streamable HTTP MCP endpoint on the 2026-07-28 spec acting as an OAuth 2.1
     resource server (protected-resource metadata, CIMD/DCR, Enterprise Managed Auth):
     **L**, ~8–12 sessions.
  6. Spaces with roles, generalising pools (SEC-5): **L**.
  7. A multi-replica-safe runtime (SC-4, ARCH-10, PERF-10): M.
  8. Proof: a recorded, reproducible connection test from claude.ai, ChatGPT (developer
     mode or Secure MCP Tunnel), M365 Copilot and Gemini or Antigravity against one
     self-hosted instance; plus an HTTP tenant-isolation test matrix in CI (ARCH-19,
     unverified).
- **Falsified if** the host platforms will not connect to a self-hosted OAuth MCP server
  without vendor-specific registration a department cannot do. Mitigation: Enterprise
  Managed Auth, and OpenAI's Secure MCP Tunnel.

### D4. Tamper-evident, compliance-ready memory

- **Why durable.**
  - Competitors offer conventional logs (Zep, Hindsight, Mem0) or "not a complete audit
    trail" (Supermemory).
  - Microsoft does not audit Copilot memory at all.
  - Anthropic's per-write versions are close but not self-hostable.

  A cryptographically chained audit with content snapshots, covering revisions made by
  the sleep-cycle LLM, answers the enterprise buyer's main question: *what changed,
  who or what changed it, and can you prove it?*
- **Nearby offers.**
  - Mem0 Gateway: per-call audit with agent identity, with history retention by tier
    (7, 30 or 90 days) and plans from $0 through $99 to $499 a month.
  - Anthropic Memory Stores: attributed, immutable versions with `redact` (hosted).
- **True today.** An HMAC chain with content snapshots and point-in-time reconstruction
  exists. Verification flags healthy data (SR-4), concurrent writers fork chains (SEC-8),
  several event types are dropped and there is no actor (SEC-7), and there is no erasure
  path (SEC-9).
  - An HMAC chain whose key sits with the same operator detects tampering only by parties
    who do not hold the key. To be tamper-evident against an administrator it needs
    checkpoints anchored outside the database: ENTERPRISE-EDITION E2-3's hourly
    chain-head anchoring, which lands in RT-6.
- **Evidence still needed.**
  - Serialised appends plus archive checkpoints (SR-4, SEC-8): M.
  - Widen the covered event types and add actor, request and platform columns (SEC-7): M.
  - Erasure and crypto-shredding across all stores (SEC-9): **L**.
  - Per-space retention and legal hold: M.
  - A lossless, signed export (SR-9, ARCH-8): M.
  - Proof: a published verification tool, plus a fault-injection test showing that
    verify() passes on healthy concurrent data and fails on a single altered byte, run
    against an externally anchored checkpoint.
- **Falsified if** buyers are satisfied by Purview, SIEM ingestion of conventional logs,
  or a gateway's call audit. The chain then becomes a supporting feature of D3, not a
  headline.
- **Weakest of the four as a reason to buy; present it as D3's compliance plane.**

### D5 (enabler). Honest, reproducible measurement as a product property

- **Why it matters.** After MemPalace, ByteRover, Memori and the Zep–Mem0 LoCoMo dispute,
  transparent methodology is a selling point. MemForge's July relabelling already proved
  it will publish unfavourable numbers.
- **Evidence still needed.**
  - Benchmark the **shipped defaults**, or change the defaults to the benchmarked
    configuration (RA-14, RA-1): M.
  - Run on neutral harnesses where competitors already have numbers: OmniMemEval
    (gpt-4.1-mini reader), Supermemory memorybench, a Redis-style gpt-4o run, BEAM-1M and
    10M, and a LongMemEval-V2 Small entry: M each.
  - Report QA, recall, p50/p95 latency and context tokens together, with dataset version
    and judge mode.
  - Invite one independent reproduction.

  This enabler is what makes D1 and D2 believable.

**Sequencing implication.**

1. **D3's first steps and D5's default fix** come first, alongside the G3 "Truth & Trust"
   work. A product that cannot be installed or connected cannot be evaluated.
2. **G1** follows: the skill and plugin on a working transport, with coexistence routing.
3. **D1's measurement and D2's governance** proceed in parallel; together they are the
   story.
4. **The rest of D3 plus D4** are the core of the G2 fork. Land the seams upstream
   (ARCH-2, ARCH-3, ARCH-5, ARCH-16; i.e. AR-1, AR-2, AR-4, AR-8) before forking, so both
   editions share one core.
5. **Validate G2 demand before building it.** Run customer discovery from week 1
   (questions, not claims, so T4 still holds), and start E1 only with a signed design
   partner (NEXT-ITERATION-PLAN decision 7).

**Making the thesis decisive.** D2 is the strongest differentiator if status actually
moves; D4 is the weakest reason to buy and is folded into D3 as its compliance plane; D1
is the most exposed. The decisive artifact is D2 and D3 together: scenario S1 with status
and provenance on a self-hosted instance, a published stale-answer rate, and a published
leakage suite.

---

## 10. Sources

Dates are the source's publication or last-modified date where shown, otherwise the date
it was read. "Read" dates are 2026-10-30 or 2026-11-16. Vendor benchmark figures are
self-reported unless marked independent.

**MemForge (repository, read-only, 2026-11-16)**

- `benchmarks/OFFICIAL-RESULTS.md`: LongMemEval-S QA 67.6% and retrieval metrics, 2026-07-29
- `NEXTGEN-RECOMMENDATIONS.md`: July analysis, 2026-07-27
- Code spot-checks for this document: `src/mcp.ts:1006` (Content-Length framing),
  `src/memory-manager.ts:2494` (sleep requires an LLM), `:3710` (`new_namespace`
  rejected), `:1826` (only the `consolidated` webhook is emitted), `src/dreams-anthropic.ts:70,210`
  (assumed wire format), `schema/schema.sql:760` (RLS not forced), and no
  `INSERT INTO memory_conflicts` anywhere in `src/`
- October 2026 audit: IDs as cited (RA, SC, PERF, SR, SEC, MX, ARCH)

**First-party platforms**

- OpenAI, "Dreaming: Better memory for a more helpful ChatGPT": https://openai.com/index/chatgpt-memory-dreaming/ (2026-06-04)
- OpenAI Help: ChatGPT release notes (memory sources, 2026-05-05): https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- OpenAI Help: Enterprise/Edu release notes (improved memory, 2026-06-25): https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes
- OpenAI Help: ChatGPT Space sharing and controls: https://help.openai.com/en/articles/20001544-chatgpt-space-sharing-data-and-controls (2026-09-29 launch)
- OpenAI developer docs: Secure MCP Tunnels: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels (read 2026-10-30)
- Anthropic: Managed Agents Dreams: https://platform.claude.com/docs/en/managed-agents/dreams (read 2026-10-30)
- Anthropic: Managed Agents memory stores: https://platform.claude.com/docs/en/managed-agents/memory (read 2026-10-30)
- Anthropic: memory tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool (GA 2026-02-17; read 2026-10-30)
- Anthropic: API release notes: https://platform.claude.com/docs/en/release-notes/overview (read 2026-10-30)
- Anthropic: Claude chat search and memory: https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context (read 2026-10-30)
- Anthropic: Claude Code memory: https://code.claude.com/docs/en/memory (read 2026-10-30)
- Anthropic: Connectors Directory submission: https://claude.com/docs/connectors/building/submission (read 2026-10-30)
- Anthropic: donating Agent Skills to the AAIF: https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation (2026-10-22)
- Agent Skills specification: https://agentskills.io/specification (read 2026-10-30)

**Memory vendors**

- Mem0 changelog highlights: https://docs.mem0.ai/changelog/highlights (v2.0.0, 2026-04-14/16)
- Mem0 Dream: https://docs.mem0.ai/platform/features/dream; https://mem0.ai/blog/dream-background-memory-consolidation-for-ai-agents (Aug/Sep 2026)
- Mem0 DolphinBench: https://arxiv.org/abs/2609.24971 (2026-09-21/22)
- Mem0 hosted MCP: https://docs.mem0.ai/platform/mem0-mcp; Claude Code plugin: https://docs.mem0.ai/integrations/claude-code
- MemTensor OmniMemEval results (independent Mem0 figures): https://github.com/MemTensor/OmniMemEval/blob/main/docs/user_memory/results.md (2026)
- Zep paper (LongMemEval-S 71.2% gpt-4o, 63.8% gpt-4o-mini): https://arxiv.org/abs/2501.13956 (2025-01-20)
- Zep research page (90.2% LongMemEval, gpt-5.4): https://www.getzep.com/research/ (modified 2026-09-29)
- Zep, unified agent memory over MCP: https://www.getzep.com/blog/agent-memory-mcp/ (2026-08-19)
- Zep Agent Skills: https://help.getzep.com/agent-skills (2026-11-05; arXiv 2611.01386)
- Zep pricing: https://www.getzep.com/pricing (read 2026-10-30)
- Graphiti: https://github.com/getzep/graphiti (32.4K stars, 2026-10-30)
- Hindsight releases: https://github.com/vectorize-io/hindsight/releases/tag/v1.0.0 (2026-10-13); https://github.com/vectorize-io/hindsight/releases/tag/v1.1.0 (2026-10-21)
- Hindsight MCP OAuth: https://hindsight.vectorize.io/blog/2026/03/30/mcp-oauth-native (2026-03-30)
- Hindsight BEAM claims: https://hindsight.vectorize.io/blog/2026/04/02/beam-sota (2026-04-02)
- Hindsight 50K stars: https://hindsight.vectorize.io/blog/2026/10/15/hindsight-50k-stars (2026-10-15)
- Hindsight OSS team-features issue: https://github.com/vectorize-io/hindsight/issues/2235 (~2026-06; possibly stale)
- Letta, "Our Next Phase": https://www.letta.com/blog/our-next-phase/ (2026-03-16)
- Letta, sleep-time compute: https://www.letta.com/blog/sleep-time-compute (2025-04-21); arXiv 2504.13171
- Letta, LoCoMo filesystem benchmark: https://www.letta.com/blog/benchmarking-ai-agent-memory (2025-08-12)
- Supermemory research: https://supermemory.ai/research (2026-05); blog: https://supermemory.ai/blog (2026-09-10 update; 2026-10-28 teardown)
- Supermemory analytics ("not a complete audit trail"): https://supermemory.ai/docs/overview/analytics.md (read 2026-10-30)
- Supermemory Company Brain (Apache-2.0): https://github.com/supermemoryai/company-brain (2026-09-25)
- Cognee 1.0 announcement: https://www.cognee.ai/cognee-1-0-announcement (2026-06-26; 1.0.0 released 2026-04-11)
- Cognee seed round: https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed (2026-02-19)
- Cognee multi-user mode: https://docs.cognee.ai/core-concepts/multi-user-mode/multi-user-mode-overview (read 2026-10-30)
- Redis Agent Memory Server: https://github.com/redis/agent-memory-server (read 2026-10-30)

**Benchmarks and research**

- LongMemEval: https://arxiv.org/abs/2410.10813 (ICLR 2025); https://github.com/xiaowu0162/LongMemEval (cleaned haystacks 2025-09)
- LongMemEval-V2: https://arxiv.org/abs/2605.12493; https://xiaowu0162.github.io/longmemeval-v2/ (2026-05-12)
- Mastra Observational Memory: https://mastra.ai/research/observational-memory (2026-02-09); BEAM: https://mastra.ai/research/observational-memory-beam (2026-10-29)
- Emergence, LongMemEval with RAG: https://www.emergence.ai/blog/sota-on-longmemeval-with-rag
- Hindsight benchmark site: https://benchmarks.hindsight.vectorize.io/ (2026-11-03)
- Supermemory memorybench (MIT harness): https://github.com/supermemoryai/memorybench
- Redis Agent Memory Benchmark report (gpt-4o reproductions): 2026-09-21. Summarised in the 2026-11-16 research refresh; URL not captured, so locate it before citing publicly.
- Exabase M-1 (LongMemEval 96.4%, BEAM-10M 68.0%): 2026-05 and 2026-07-28. Vendor pages, per the 2026-11-16 refresh.
- Papr (LongMemEval-S 96.0%): 2026-11-13. Vendor page, per the 2026-11-16 refresh.
- CrossLearnBench/MixUA: arXiv 2611.10439 (2026-11-07)
- MAPE: arXiv 2611.17068 (2026-11-12); raw-history RAG studies: arXiv 2610.24671, 2610.30755 (2026-10)
- "Relevance Is Not Sufficiency" (BFR): arXiv 2610.09348 (2026-10-07)
- Memory in the Age of AI Agents (taxonomy): arXiv 2512.13564

**Hyperscalers and frameworks**

- AWS AgentCore pricing: https://aws.amazon.com/bedrock/agentcore/pricing/ (per-GB short-term pricing from 2026-10-06)
- AWS AgentCore long-term memory deep dive (benchmarks): https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/ (2025-10-15)
- Google Memory Bank: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/overview (now "Gemini Enterprise Agent Platform")
- Microsoft Foundry memory: https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-memory
- Microsoft Agent Framework context providers: https://learn.microsoft.com/en-us/agent-framework/concepts/agents/conversations/context-providers (2026-10/11)
- LangGraph stores: https://docs.langchain.com/oss/python/langgraph/stores (read 2026-11-16)
- ADK memory: https://adk.dev/sessions/memory/ (read 2026-11-16)
- CrewAI memory: https://docs.crewai.com/en/concepts/memory (read 2026-11-16)
- Mastra memory: https://mastra.ai/docs/memory/overview (read 2026-11-16)

**Enterprise knowledge**

- Microsoft Copilot memory: https://learn.microsoft.com/en-us/copilot/microsoft-365/copilot-personalization-memory (updated 2026-11-03)
- Microsoft Work IQ MCP: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/overview (2026-11-10)
- Message Center MC1539004, "Work IQ expands memory capabilities to agents": https://mc.merill.net/message/MC1539004 (2026-11-05)
- Microsoft Purview for AI: https://learn.microsoft.com/en-us/purview/ai-microsoft-purview (2026-05-27)
- Glean MCP: https://docs.glean.com/administration/platform/mcp/about (updated 2026-11-03); Agentic Engine 2: https://www.glean.com/blog/live-fall-25-agentic-engine2-performance (2025-09-25); press: https://www.glean.com/press ($300M ARR, 2026-05-28)
- Notion releases: https://www.notion.com/releases/2026-10-13; https://www.notion.com/releases/2026-10-19
- Atlassian Rovo MCP: https://www.atlassian.com/platform/rovo-mcp (read 2026-11-16)

**Confidence notes**

- The Letta card was rebuilt from primary pages after a first draft from model knowledge.
  Its 2026 timeline is confirmed at month level.
- The hyperscaler card was drafted from model knowledge. Only the items listed in §3.11
  were corrected against primary pages; 2026 changes to Memory Bank and Foundry memory may
  be missing.
- The DolphinBench top score (70.67%) comes from a secondary summary; the repository
  README shows no leaderboard.
- Hindsight's OSS team-feature gap (issue #2235) may be stale.
- Microsoft pricing pages returned 503 on 2026-11-16, so the $30 enterprise Copilot
  add-on price is unconfirmed.
