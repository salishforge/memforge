# MemForge next-iteration plan (November 2026)

- **Status:** integrated plan for owner review. It replaces the milestone schemes in the track documents with **one release train** (RT-1…RT-7) and supersedes their calendars. The track documents remain the detailed specifications.
- **Date:** 2026-11-16. **Code baseline:** `main` at `16e2f15` (2026-07-29). Nothing has changed since the October 2026 audit, so audit line numbers still apply.
- **Release facts:** npm `latest` is **3.0.0-beta.4** (MX-2, live registry check 2026-10-30). `package.json` says 3.7.0, and `main` carries unreleased work labelled v3.8–v3.13.
- **Inputs:** [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) · [ENTERPRISE-EDITION.md](ENTERPRISE-EDITION.md) · [g3-accuracy-speed.md](g3-accuracy-speed.md) · [g3-stability-ops.md](g3-stability-ops.md) · [plugins/memforge/PACKAGING.md](../plugins/memforge/PACKAGING.md) and [plugins/memforge/skills/memforge/SKILL.md](../plugins/memforge/skills/memforge/SKILL.md) · `g2-architect-governance.md` and `g2-architect-reach.md` (losing proposals; kept off `main`, held by the maintainer) · the October 2026 audit (151 findings: 38 confirmed, 41 partially confirmed, 71 unverified, 1 refuted) · `ROADMAP.md`, `PHASE_5_PLAN.md`, `NEXTGEN-RECOMMENDATIONS.md` · open issues #13, #21, #22, #23, #48, #49, #54, #115.
- **Conventions, ID families and the milestone crosswalk** are in Appendix B. Retrieval recall is never compared with QA accuracy. Security problems appear as work to do, by audit ID; this document contains no exploit steps.

---

## 1. Executive summary

**The plan in seven lines.**
1. **Truth first:** v3.13.0 "Truth & Trust" (RT-1) makes MemForge install, authenticate, speak MCP, upgrade and tell the truth; skill 0.1 ships with it.
2. **Then measure and connect:** v3.14.0 (RT-2) fixes silent accuracy bugs, ships skill 1.0 on MCP, opens a remote transport and tests the platforms; v3.15.0 (RT-3) builds the seams and makes conflict detection real.
3. **Capacity is the binding constraint:** 5 coding sessions a week is the plan of record (RT-3 exit ~2027-07-25); 9 is the upside (~2027-04-18). RT-4 onward is horizon, and ~95–150 sessions are uncommitted.
4. **G2 is demand-gated:** Team Starter (MIT, RT-4) pilots first; `ee/` is created only when a design partner signs. The licence is an open owner decision.
5. **Differentiate on proof:** epistemic governance (D2) and sovereign team memory with a compliance plane (D3+D4); own the open longitudinal benchmark (D1).
6. **Hedge platform risk early:** MIT adapters and a memory-tool backend in RT-2; tripwires for first-party team memory (risk 15).
7. **Owner decisions:** §9, with 1, 2, 4, 7 and 17 most urgent.

**Positioning.**

> **Target positioning:** MemForge is the open-source memory server you can host yourself and check for yourself. Every memory carries its status, evidence and history. Every change lands on a verifiable audit trail. Every accuracy claim ships with the means to reproduce it. One Postgres instance serves every AI tool that a person, or a whole team, uses.

**Target positioning, not published** until the claim-gate rows (§3.3) for remote MCP (RT-4) and team isolation (RT-5) open. **Public statement from RT-1:** *MemForge is an MIT-licensed memory server you can host yourself and check for yourself; every memory carries its status, evidence and history; every accuracy claim ships with the means to reproduce it.* Until U-2 puts the actor inside the audit hash (RT-4), no audit claim may say who made a change.

**Differentiators, the evidence that will prove each, and who contests them.** No competitor combines these, but today MemForge has each one only partially (COMPETITIVE-ANALYSIS §4, §9).

| # | Differentiator | Evidence that proves it | Earliest | Contested by (Nov 2026) |
|---|---|---|---|---|
| D1 | **Memory that measurably improves, proven in the open** | RT-3: L2 protocol pre-registered and the harness released with adapters for at least two other systems (for example Mem0 OSS and the Anthropic memory tool), so benchmark ownership is the asset whatever MemForge's own delta is. RT-4/RT-5: first endpoint, the P1 stale-answer rate on knowledge-update streams (RA-8, RA-10). RT-6: L2 v1, sleep-on beats sleep-off by ΔAUC ≥ +3 QA points (95% CI excludes 0) with no regression on stable facts (P8); a null result is published too. | RT-3 (method) → RT-6 (claim) | OpenAI Dreaming V3 reports 41.5% → 82.8% internally (closed). Mem0 owns DolphinBench, and Hindsight launched a benchmark site on 2026-11-03: either could publish a consolidation delta first |
| D2 | **Epistemic governance:** status, evidence, provenance, history | P1 stale-answer rate −30% (RT-5); knowledge-update QA 76.9% → ≥ 84% (R1, RT-4; legacy judge → official judge, re-baselined by N-1) with a status-aware on/off ablation; a public provisional → contested → resolved test (RA-10, RT-3) | RT-3/5 | Hindsight 1.1 per-document change history; Anthropic Memory Stores' attributed, immutable versions with `redact`; Zep's bi-temporal invalidation and protected properties |
| D3 | **Sovereign, vendor-neutral team memory** on the customer's Postgres and identity, with D4 as its compliance plane | Team Starter pilot (RT-4); recorded scenario S1 (contribute in Claude Code, approve in ChatGPT, recall in Cursor within 5 s); zero unauthorized reads in the isolation matrix on every PR (E1-6, E1-10) | RT-4 → RT-5 | Hindsight Enterprise (on-prem, SSO, audit logs); Cognee Enterprise (BYOC, on-prem or air-gapped), and Cognee's Apache core already runs on-by-default multi-user ACLs on Postgres/pgvector (fact-checked); Supermemory Enterprise (air-gapped); Zep BYOC |
| D4 | **Tamper-evident, compliance-ready memory** | `verify()` passes after archiving and 20 concurrent writers, and a single altered byte makes it fail (TT-5, RT-1); actor inside the hash (U-2, RT-4); externally anchored checkpoints (E2-3, RT-6); erasure leaves 0 hits with chains intact (E2-6) | RT-1 → RT-6 | Mem0 Gateway per-call audit (7/30/90-day tiers); Anthropic versions and `redact`; Microsoft Purview |
| D5 | *Enabler:* **honest, reproducible measurement** | Official judge (N-1); shipped default reported beside every headline; raw answers published; independent reproduction invited | RT-1 → RT-6 | — |

**D4 is the weakest reason to buy; fold it into D3 as the compliance plane. D1 is the most exposed:** no proof before RT-6, and the plan expects a delta near 0 at L1a. **D2 is the strongest if status actually moves.** The decisive artifact is D2 and D3 together: scenario S1 with status and provenance on a self-hosted instance, a published stale-answer rate, and a published leakage suite.

**The release train at a glance.** Week 1 is the week of Monday 2026-11-16. **The plan of record is 5 coding sessions a week**, after reserving about 30% of owner time for non-session load; **9 a week is the upside case.** RT-4 onward is horizon.

| RT | Version | Sessions | Plan of record (5/week) | Upside (9/week) | Headline |
|---|---|---:|---|---|---|
| RT-1 | **v3.13.0 "Truth & Trust"** | 43–61 | wk 1–12 → ~2027-02-07 | wk 1–7 → ~2027-01-03 | It installs, authenticates, speaks MCP, upgrades, and the docs tell the truth. Skill 0.1 ships (REST transport; the plugin declares stdio MCP in skill 1.0, RT-2). |
| RT-2 | **v3.14.0 "Measured & Connected"** | 58–82 | wk 13–26 → ~2027-05-16 | wk 8–16 → ~2027-03-07 | Accuracy bugs fixed; reader-facing context; skill 1.0 on stdio MCP; remote MCP transport on loopback; platform spikes; MIT adapters; first scale numbers. |
| RT-3 | **v3.15.0 "Seams"** | 38–58 | wk 27–36 → ~2027-07-25 | wk 17–22 → ~2027-04-18 | Config, readiness, principal/context/authorize seams, routers split; OAuth resource server; conflict producer. **★ Branch-ready.** |
| RT-4 | v3.16.0 (horizon) | 69–102 | ~wk 37–54 → ~2027-11-28 | wk 23–32 → ~2027-06-27 | Team Starter and its pilot; team seams in MIT core; chunk-level indexing and time-aware retrieval; per-user OAuth for the skill. |
| RT-5 | v3.17.0 + EE preview (E1) (horizon) | 99–148 | ~mid-2028 | wk 33–49 → ~2027-10-24 | Behind the demand gate: `ee/` created; one-department pilot on three platforms. Truth maintenance (sleep safety, confidence). |
| RT-6 | v3.18.0 + EE 1.0 (E2) (horizon) | 110–164 | ~end of 2028 | wk 50–67 → ~2028-02-27 | Department GA, ready for a security review; L2 v1; M3 accuracy only on measured need. |
| RT-7 | v4.0 + EE 1.x (E3) (uncommitted) | 58–92 | — | wk 68–83 → ~2028-06-18 | Scale, HA, ecosystem. |

**Capacity, honestly.**
- **Before this revision,** RT-1…RT-7 totalled 445–657 sessions (about 900–2,000 hours of session time) over 80 weeks. At 9 a week the high estimate used ~91% of capacity and left nothing for non-coding work. The repository had no commits from 2026-07-29 to 2026-11-16.
- **After this revision** the train totals ~475–705 sessions, because it adds Team Starter, the sleep-safety rows (SC-5/7/8/15/20) and MIT adapters. The §10 cut list marks ~95–150 of them uncommitted, leaving ~380–560 committed or planned.
- **Non-session load.** Reserve about 30% of owner time for: security response (decision 14), design-partner and pilot support (10–30 users for 4 weeks in E1, 8 weeks in E2), releases, issue and PR triage, counsel, and benchmark runs.
- **Checkpoints** at the end of week 2 and at every RT exit, from the weekly session log. If measured sessions per week stay below 6 for three consecutive weeks, stay on the 5/week calendar and apply the §10 cut list. If they stay at 9 or more, move to the upside calendar.

**Commitment level.** RT-1 to RT-3 (139–201 sessions) are committed. RT-4 onward is horizon, re-planned at every RT exit. The §10 cut list (about 95–150 sessions) is uncommitted until there is revenue or a signed design partner.

**The first two weeks** (2026-11-16 → 2026-11-29; about 10 sessions at 5/week, 18 at 9/week):

1. **Day 1, session 1: CLAUDE.md truth patch** (first slice of TT-12). Remove phantom routes, variables and counts, and replace `pip install memforge` everywhere (MX-2: the name belongs to an unrelated project). It goes first because every AI session reads CLAUDE.md before changing code.
2. **TT-15a (1 session):** run all 35 test files once, record the red count per file, and add them to CI as a non-blocking job. The TT changes below alter failure paths, auth, audit and schema; this gives them a safety net (SR-8 P).
3. **TT-1** (background writes cannot end the process), **TT-10** (MCP stdio speaks MCP; unblocks G1), **TT-11** (auth on everywhere), **TT-8** (images and compose boot), **TT-3** and **TT-6** (phases re-arm; input guards; pool deletes off; 4xx codes), **TT-13** (one version, release gate).
4. **N-1:** re-judge the saved 2026-07-29 answers with the official LongMemEval prompts; publish both numbers, and report the share of wrong answers whose complete evidence was in the reader context.
5. **Owner, same weeks:**
   - confirm whether the 3.7.0 npm publish failed; decide decisions 1–2 in §9;
   - create GHCR and the renamed PyPI project with trusted publishing and 2FA **before the first publish** (risk 13, T11, the MemTensor compromise of 2026-09-23);
   - prepare `npm deprecate` on 3.0.0-beta.x, to run the day `rc.1` publishes, pointing to it (MX-2: npm `latest` is still beta.4);
   - start the weekly session log;
   - book 5–10 customer-discovery conversations with prospective team buyers. These are questions only, with no product claims, so T4 still holds.
6. **End of week 2: capacity checkpoint.**

**Week 3: cut `3.13.0-rc.1`** to npm `next` and GHCR **by 2026-12-06 if at least 12 sessions are done by 2026-11-29, otherwise by 2026-12-13.** The window includes holiday weeks.

**Operating rhythm (§0).** The owner steers from a one-page **Now / Next / Later** board and **one GitHub milestone per RT**; these documents are reference material, not the steering tool. A weekly session log feeds the capacity checkpoints. The losing G2 proposals (`g2-architect-governance.md`, `g2-architect-reach.md`) stay off `main` (the maintainer holds them), so the public repository does not carry three G2 designs.

---

## 2. Where MemForge stands

### 2.1 Scorecard against competitors (2026-11-16)

Verdicts are planner judgments. The evidence is in COMPETITIVE-ANALYSIS §3–§5.

| Dimension | MemForge today | Best competitor evidence | Verdict |
|---|---|---|---|
| **QA accuracy**, LongMemEval-S, gpt-4o-class reader (the only like-for-like cohort) | 67.6% (gpt-4o-2024-08-06, self, 2026-07-29), custom judge (N-1) | Redis Remis+Instruct 86.5% (vendor); Mastra OM 84.23% (Redis repro 84.2%); Redis Remis 83.4% (no LLM at ingest, MemForge's class); Zep 71.2% | **Behind by 15.8–18.9 points**; last of the 2026 gpt-4o results |
| **Where QA errors arise** (QA-only diagnostic) | Not yet measured. N-1 reports, for the 2026-07-29 run, the share of wrong answers whose complete evidence was in the reader context | n/a | Measure in RT-1 before choosing between retrieval and reading work |
| **Retrieval recall** (MemForge only; never set beside QA) | Complete-evidence recall 91.8%, R@5 95.4% (hybrid, self), at one session per row, not the shipped default (RA-14 C, RA-1 P) | n/a | Strong where measured |
| **Latency and scale** | Hybrid p50 46 ms at ~50 rows/agent; nothing measured above ~500 rows (PERF-20); HNSW unusable as written (PERF-2 P) | Zep retrieval p50 104 / p95 162 ms (corpus unstated) | **Unknown at scale** |
| **Distribution** | ~28 npm downloads/month; no working install channel (MX-2 C); no plugin | Mem0 2.46M PyPI downloads/month; plugins everywhere | **Far behind** (T6) |
| **Remote MCP** | stdio only, non-compliant framing (MX-1 C, SR-2 C) | Zep, Hindsight Cloud, Supermemory: remote MCP with OAuth | **Absent** |
| **Full-featured self-host** (MIT, plain Postgres) | Yes in principle; every install path fails (MX-2, SEC-3 C, PERF-1 P) | Hindsight MIT/Postgres with team features reportedly paid (issue #2235, mid-2026, possibly stale) and a v1.0 API promise; self-hosting with SSO is a paid tier at Hindsight, Cognee, Supermemory and Zep (BYOC) | **Potential lead, narrow** |
| **Background consolidation** | 8 of 15 phases switch themselves off (SC-1 P, SR-3 C); no run without an LLM (SC-24) | Commodity: Letta, Anthropic Dreams, OpenAI Dreaming V3, Mem0 Dream, Supermemory | **Me-too** (T1) |
| **Measured consolidation benefit** | None (SC-12 C) | No open result; OpenAI internal 41.5% → 82.8% compares versions | **Open lane** (D1) |
| **Epistemic status per memory** | Exists but rarely moves (RA-11 C, RA-8 C) | Nobody has it | **Unique once working** (D2) |
| **Tamper-evident audit** | False tamper reports (SR-4 C), forks (SEC-8 C), no actor (SEC-7 P) | Conventional logs; Anthropic per-write versions (hosted) | **Unique once working** (D4) |
| **Team identity and isolation** | None (SEC-1 C, ARCH-2 C); RLS not enforced on the app path (SEC-2 C) | Zep UserGroup ABAC, SSO, SCIM beta; Mem0 paid orgs; Cognee | **Behind** (T2) |
| **Release discipline** | No migration runner (SR-7 C); version drift; CI runs 6 of 35 files (SR-8 P) | Hindsight v1.0 API promise; Mem0 Alembic | **Behind** (T3) |
| **Benchmark honesty** | QA and recall separated; reader named; bad numbers published | Field credibility disputes (MemPalace's recall-as-accuracy headline; the Zep–Mem0 LoCoMo dispute) | **Ahead** (D5) |

**Bottom line:** MemForge has no row where it is uniquely "Yes" today. It has four rows where no competitor has a "Yes" and an audit fix would give MemForge one: epistemic status, tamper-evident audit, full-featured self-hosting, and measured consolidation benefit. Those four rows are the strategy.

### 2.2 Headline audit themes

1. **The docs promise more than the code delivers:** phantom routes and flags (RA-9 P, SEC-12 C); RLS described as "secure by default" but not enforced on the app path (SEC-2 C, ARCH-6 C); a conflict feature with no producer (RA-10 C). `ROADMAP.md` also overstates: "Phases 1–4 complete", "CI fully green", "npm live".
2. **Nobody can install or connect to it:** MX-2 (C), MX-1/SR-2 (C, critical), SEC-3 (C), PERF-1 (P); default deployments do not require authentication (ARCH-1, C, critical).
3. **Failure paths end the process:** SR-1, SR-10, SR-5 (C); PERF-7 (P).
4. **The differentiators are dormant:** RA-10, RA-11, SC-1, SC-12, RA-8.
5. **The benchmark does not describe the product:** shipped default unmeasured (RA-14, RA-1); custom judge (N-1); harness-supplied dates (RA-20).
6. **Single-tenant by construction:** SEC-1 (C, critical), ARCH-2, SEC-5, SEC-9 (C).
7. **Release hygiene:** SR-7 (C), MX-9 (P), SR-8 (P), SR-17.
8. **Scale is unmeasured:** PERF-20, PERF-2, PERF-3, PERF-6.

**Strengths to keep:** the deterministic passage extractor (`snippet.ts`); honest benchmark labelling; streaming consolidation with SKIP LOCKED; embedding-model migration; prompts that wrap stored content as data; conflict resolution that declines to pick a winner on thin evidence.

---

## 3. Guiding decisions

### 3.1 What this iteration will do

What it will *not* do, with reasons, is in §11.

1. **Truth before features.** RT-1 removes or implements every advertised-but-missing feature (TT-12), and removes rather than maintains the layers built on an assumed API (SC-3, SC-10). No outreach before v3.13.0 (T4); customer discovery asks questions only.
2. **Make the four dormant assets work before claiming them:** RA-10, RA-11, RA-8, TT-3, SC-24, TT-5, AR-9.
3. **Measure the product path:** official judge (N-1), shipped default beside every headline, harness consumes `format=context` (A1), dev split with paired statistics. Accuracy work after the RT-4 minimum competitive path continues only on a measured need (§7.1).
4. **Ship G1 early and cheaply:** skill 0.1 over REST with v3.13.0, skill 1.0 on stdio MCP in RT-2, hosted surfaces via remote MCP: single-user in RT-3 (U-5a, Skill-C1), per-user OAuth in RT-4 (U-5b, Skill-C2). MIT adapters for the cheapest distribution channels (Strands, ADK, the Anthropic memory tool) in RT-2.
5. **Validate G2 demand before building it, and fork as an edition.** Team Starter (MIT, RT-4) pilots first; `ee/` is created only at E1 kickoff, behind a demand gate. The edition structure and its documented alternative are decision 3 (§9).
6. **Shrink the surface:** 46 → 10 default MCP tools (AP-1), complete OpenAPI (AP-2), an error and stability contract (AP-4).
7. **One stream at a time.** After E1 kickoff, alternate EE and core work in 2–3-week blocks rather than splitting every week; one release in flight. For a solo maintainer, switching between identity, retrieval and benchmark code within one week is the most expensive cost.

### 3.2 Reconciling July's "do not" list

| July 2026 "do not" (NEXTGEN-RECOMMENDATIONS) | This plan |
|---|---|
| Do not chase LoCoMo | **Kept.** LoCoMo stays out. Credibility comes from BEAM, the independent gpt-4o reproduction and the longitudinal benchmark. |
| Do not build a hosted SaaS | **Kept.** EE is software that customers run on their own Postgres. A managed offering is out of scope for E0–E3 (ENTERPRISE-EDITION §13.4). What changed is that remote MCP with OAuth *on the self-hosted server* is now mandatory, because per-user identity on hosted assistants and directory listings require remote MCP. OpenAI's Secure MCP Tunnel can reach a stdio server, but only with one shared token (COMPETITIVE-ANALYSIS §3.5; openai fact-check). That is a transport, not a service. |
| Do not add user modelling to compete with Honcho | **Kept.** |
| Do not compare numbers until like-for-like | **Updated.** Comparison is now allowed in exactly one cohort: LongMemEval-S QA with a gpt-4o-class reader, after N-1 moves MemForge to the official judge. Recall is never set beside QA. |
| **Do not expand the feature surface: "the gap is evidence, not features"** | **Kept for core, and reconciled with G2** as follows. |

**How the enterprise edition fits "no feature expansion":**
1. Core *shrinks* in this iteration: TT-12 removes phantom claims and two speculative layers, AP-1 cuts the default tools from 46 to 10, and RT-1 to RT-3 add only fixes, seams and benchmark-gated accuracy levers.
2. EE is a separately licensed edition built mostly on primitives that already exist: a space *is* an `agent_id` partition (D-EE-3), curation reuses epistemic status, compliance reuses the audit chain.
3. EE starts only after the truth and seam work and a demand gate, so it never adds surface to a core that does not work.
4. Every new core seam (fail-closed auth, principals, enforced RLS, remote MCP) and Team Starter also improve the OSS edition.
5. A new accuracy lever (A1–A9) enters the default path only with a measured dev-split gain.

### 3.3 The truth-pass principle: stop claiming what is not true

**Rule.** No README, CLAUDE.md, ROADMAP, directory listing, skill or release note may state a capability until a CI test or a published benchmark demonstrates it. TT-12's `scripts/check-docs.ts` enforces the mechanical part: versions, counts, routes, environment variables, and a denylist of phantom names. Release review enforces the rest, using this claim gate:

| Claim | Status at HEAD | Unlocked by |
|---|---|---|
| Hints API, preference extraction, `ENABLE_LLM_INGEST`, a conflicts route | False (RA-9 P) | **Removed in RT-1.** Hints become real only if A4 is built (conditional, RT-6). |
| "Conflicts are detected and resolved" | False (RA-10 C) | RA-10 plus the A-then-not-A test (RT-3) |
| "Secure by default" / RLS isolation | False on the application path (SEC-2 C) | AR-9 (RT-4). Until then, document "single trust domain; one token opens every agent" (SEC-1). |
| "Tamper-evident audit" | Partly false (SR-4 C, SEC-8 C) | TT-5 (RT-1) for verification. **Until U-2 ships (RT-4), it must say "records what changed, not who".** Tamper evidence against an administrator needs external anchoring (E2-3, RT-6). |
| "Memory improves over time" | Unproven (SC-12 C) | L2 v1 primary endpoint (RT-6), or a published null result |
| "Phases 1–4 complete", "CI fully green", "full test coverage" (ROADMAP) | Overstated (SR-8, RA-10, RA-11, SC-1) | Rewrite as "built; being made to work end to end" in RT-1 |
| "Claude Dreaming" Layers 3–4 (Dreams delegation, Memory Store bridge) | Target an assumed API (SC-3 P) | **Removed from core in RT-1** (decision 13); remaining layers renamed "Anthropic Dreams-compatible" |
| Any accuracy lead over a named competitor | Not supported | Same reader and official judge, with paired statistics |
| "Every AI tool reads the same memory" | False (MX-1, no remote MCP) | Single-user reach from RT-3 (U-5a, Skill-C1); the claim needs per-user OAuth: U-5b, the E0-8 recipes and Skill-C2 (RT-4) |
| "Per-user isolation" | False (SEC-1, ARCH-2) | E1-3 plus the isolation matrix (RT-5). Team Starter (RT-4) may claim "personal and team namespaces bound to your IdP identity", tested by CI-2. |
| "SOC 2 certified" | Never, for self-hosted software | Ship a control mapping instead (E3-7) |

---

## 4. Release train

### 4.1 Milestone table

Full scope by work-item ID is in each subsection (§4.3–§4.9) and in the register (§5).

| RT | Version (EE) | Plan of record / upside end | Goal | Key items | Sessions | Depends on |
|---|---|---|---|---|---:|---|
| **RT-1** | v3.13.0 "Truth & Trust" | ~2027-02-07 / ~2027-01-03 (rc.1 2026-12-06 or 12-13) | G3, G1 | TT-1…15, N-1, Skill-A, removals | 43–61 | — |
| **RT-2** | v3.14.0 "Measured & Connected" | ~2027-05-16 / ~2027-03-07 | G3, G1, G2 de-risking | RA-2/3/8/11, A1, S1, L1a, AP-1, Skill-B, U-5a, E0-8, adapters | 58–82 | TT-1, TT-2, TT-3, TT-10, TT-11, TT-14 |
| **RT-3** | v3.15.0 "Seams" | ~2027-07-25 / ~2027-04-18 | G2 seams, G3 ops, G1 | OP-1/2, AR-1…5, AR-8, U-5b, Skill-C1, RA-10, CI-2, PERF-3, E0-9 | 38–58 | TT-15 (before any AR item); dev split |
| **RT-4** (horizon) | v3.16.0 | ~2027-11-28 / ~2027-06-27 | G2 team seams (MIT core), G3 accuracy, G1 hosted | Team Starter, U-1/2/3/7, AR-9, OP-7 ∥ A2+S6, A3; Skill-C2 | 69–102 (team seams 45–65 ∥ accuracy 24–37) | RT-3; TT-14; TT-2 |
| ★ | **Branch = E0-7 at E1 kickoff** | — | G2 | `ee/` created | — | AR-4, AR-8 and the demand gate |
| **RT-5** (horizon) | v3.17.0 + EE preview (E1) | ~mid-2028 / ~2027-10-24 (pilot in the last 4 weeks) | G2 pilot, G3 truth maintenance | E0-7, E0-10, E1-1…11 ∥ SC-5/6/7/8/15/20, A5, OP-3/4/8, L2 v0 | 99–148 (EE 56–85 ∥ core 43–63) | Gate B; demand gate; E0-8 decisions; A2 merged with a paired dev-split gain |
| **RT-6** (horizon) | v3.18.0 + EE 1.0 (E2) | ~end of 2028 / ~2028-02-27 | G2 GA, G3 M3 (conditional) | E2-1…11, U-4, OP-6 ∥ S7, L2 v1, OP-5, AP-2; A4/A6/A7 on need | 110–164 (EE 69–103 ∥ core 41–61) | Gate C |
| **RT-7** (uncommitted) | v4.0 + EE 1.x (E3) | — / ~2028-06-18 | G2 scale, G3 M4 | E3-1…8 ∥ S9, BEAM-10M | 58–92 | RT-6 |

Effort ranges come from the track documents. RT-1 includes two weeks of holiday slack. Plan-of-record windows use mid-range effort.

**Capacity note.** At upper-bound effort, every RT overruns its upside window by 1–3 weeks; the plan-of-record windows absorb that only through the §10 cut list. RT-4's ≥ 78% QA exit slips first. The E2 second-department run (8 weeks) must start on the E1 preview during the E2 build, or RT-6 extends by about 8 weeks.

### 4.2 Critical path and the branch point

```text
RT-1  TT-15a ─→ TT-1, TT-2, TT-5, TT-11, TT-14 ─→ TT-15b (all 35 files, blocking)
      TT-8 → TT-11 ;  TT-10 ─────────────────────────────────→ Skill-A (0.1, REST)
RT-2  N-1 → dev split → RA-2/RA-3/RA-8/RA-11 → A1 (QA ≥ 72%, R1)
      AP-1 → Skill-B (1.0, stdio MCP) ;  AP-1 + TT-11 → U-5a (loopback) ;  E0-8 spikes (stub server)
RT-3  OP-1 → AR-2 → U-5b ∥ AR-3 → AR-4 → ★ branch-ready ;  AR-2 → AR-8
      AR-4 → U-5a beyond loopback → Skill-C1 ;  RA-8 → RA-10
RT-4  Team Starter (U-7, U-2, groups map, connect; OP-7 before the pilot) → team pilot
      U-1, U-3, AR-9 → Gate B ;  TT-2 → S6 → A2 → A3 (QA ≥ 78%, R1) ;  U-5b → Skill-C2
RT-5  demand gate → E0-7 (`ee/` branch) → E1-1 … E1-10 → 4-week pilot
      SC-5/6/7/8/20 + OP-3 → L2 v0 ──→ RT-6: L2 v1 (D1 claim) ; E2 (Gate C) ──→ RT-7: E3 (uncommitted)
```

- **Branch point.** The core is **branch-ready at the RT-3 exit**, once AR-4 and AR-8 have merged (the stability rule "do not fork before AR-4 and AR-8"). The branch itself, creating `ee/` (E0-7), happens **at E1 kickoff, behind the demand gate** (decision 7). With the same-repository layout, later core fixes land once and ship in both editions. Until then, everything built is MIT core, and the licence decision (decision 4) waits for a buyer.
- **Critical path to a team pilot:** TT-* → OP-1 → AR-2 → U-5b ∥ AR-3 → AR-4 → Team Starter (U-7, U-2, OP-7) → pilot. U-5 no longer waits for the branch: U-5a needs only AP-1 and TT-11, and U-5b only AR-2.
- **Critical path to the E1 pilot:** the above, plus the demand gate → E0-7 → AR-9 and U-1 → E1-3 → E1-4 → E1-6 → E1-10 → pilot.
- **Critical path to G3's headline claims:** accuracy N-1 → A1 → TT-2 → S6 → A2 → A3 (RT-4); D1 TT-3 + SC-24 + RA-11 → L1a (RT-2, pre-repair baseline) → L2 protocol and harness (RT-3) → RA-10 (RT-3) + SC-6/7/8 (RT-5) → L2 v0 (RT-5) → L2 v1 (RT-6).
- **Versus ENTERPRISE-EDITION's original calendar** (pilot mid-July 2027, GA early October 2027): this train puts the E1 pilot around 2027-10 at the upside and mid-2028 at the plan of record. ENTERPRISE-EDITION §12.3 says EE "wins only … if it ships the pilot by mid-2027". The route to that date is **Team Starter**, which pilots around 2027-05 at the upside (around 2027-09 at the plan of record). Accept the E1 date explicitly as risk 9's main exposure; decision 5's alternative pulls both pilots about 9 weeks earlier at the upside.

### 4.3 RT-1: v3.13.0 "Truth & Trust"

- **Goal.** Everything a user touches works as documented, and every claim is true.
- **Scope.**
  - **Stability:** TT-1…TT-15 (TT-15a in week 1; TT-15b in weeks 4–6), plus CI-6 (release gate). TT-1, TT-2, TT-5, TT-11 and TT-14 land after TT-15a. TT-5 changes no hash inputs; U-2 is the single change to what the audit hash covers.
  - **Remove, don't maintain** (inside TT-12):
    - delete the Anthropic Dreams delegation and the Memory Store bridge from core, or move them to an unsupported contrib package (SC-3 P, SC-10 P; decision 13);
    - remove the M365 plugin manifest that makes `agent_id` model-supplied (MX-12; ENTERPRISE-EDITION Appendix B #8).
  - **Interim documentation** (TT-7, TT-12): shared pools have no owner or roles and form one trust domain (SEC-5); `clear()` archives rather than deletes, with an operator erasure runbook (SEC-9); rate limits are per IP (PERF-10).
  - **Measurement truth:**
    - N-1: official judge; re-judge the 2026-07-29 answers and publish both judges, the disagreement count, and the share of wrong answers whose complete evidence was in the reader context;
    - RA-20: label the dates the harness adds;
    - a LongMemEval-S run with the shipped default ingest (RA-14), published beside the headline;
    - an R2 (pinned Claude) baseline run.
  - **G1:** Skill-A, meaning `plugins/memforge` with the marketplace, release zips, static checks (test step 1) and the 12 script contract tests in CI (step 2); plus NEW-1. Before the GA announcement:
    - apply the PACKAGING §6 release-time edits for every fix that lands in RT-1: MX-1/SR-2 (MCP handshake text), MX-2 (published package names; drop "built from main"), ARCH-1/MX-4 (the 503 troubleshooting row), NEW-1 (namespace warning), TT-6/NEW-6 (413/400 rows), the bridge removal;
    - run the 20 trigger queries (PACKAGING step 4) and the 4 behaviour cases with skill-creator (step 5, Phase A mode) once, with results in the release notes.
  - **Docs:** #22, with ADRs for this plan's decisions 1, 2, 3, 8 and 9.
- **Rule.** `3.13.0-rc.1` goes out by 2026-12-06 (if at least 12 sessions are done by 2026-11-29; otherwise by 2026-12-13) once TT-1, TT-3, TT-6, TT-8, TT-10, TT-11 and TT-13 are done. Skill-A is announced only with the GA.
- **Exit criteria** (all automated in CI unless marked):
  1. Every documented install channel (npm `latest`, both GHCR images, compose, PyPI under the new name) passes `install-smoke` and `channel-check` from a clean clone. The npm, GHCR and PyPI versions all equal `package.json`.
  2. A default deployment rejects unauthenticated requests. Unauthenticated mode works only on loopback, or with an explicit override that is logged.
  3. An MCP Inspector handshake and tool calls pass, including a non-ASCII payload and `ping`.
  4. Databases at 3.0.0-beta.4 and at v3.7.0 upgrade to 3.13.0 with a zero schema diff. A rerun applies nothing.
  5. All 35 test files run in CI and pass, and the count is asserted.
  6. The fault suite (provider hang or throw; a DB statement timeout) causes zero unplanned exits. A hybrid query with a hung embedder returns 200 with `degraded` within the timeout plus 1 s.
  7. `verify()` reports valid on an archived fixture older than 90 days and after 20 concurrent writers, and fails on a single altered byte.
  8. The docs-consistency job passes with an empty phantom-name denylist. CLAUDE.md, README, INTEGRATION.md and ROADMAP.md pass the claim gate in §3.3.
  9. `OFFICIAL-RESULTS.md` reports the official-judge and legacy-judge QA (R1) with the disagreement count, the shipped-default run, and an R2 (pinned Claude) baseline.
  10. `claude plugin validate --strict` and `skills-ref validate` pass. The plugin installs from the marketplace, and `/memforge:status` works against a v3.13.0 compose install (manual smoke, step 6).
  11. The released SKILL.md compatibility field reads "MemForge 3.13.0 or later", and no PACKAGING §6 row for an RT-1 fix still carries its pre-fix text (drift check, test step 1).
  12. Compose from a clean clone reaches `/ready` within 60 s (§7.4).
- **Effort.** 43–61 sessions.
- **Depends on:** nothing. The owner sets up the registry accounts, with trusted publishing and 2FA, by week 3.

### 4.4 RT-2: v3.14.0 "Measured & Connected"

- **Goal.** Stop losing accuracy points to silent bugs. Give readers dated, status-aware context. Put the skill on working MCP and open the first remote transport. Test the platforms before building seams for them. Publish the first scale numbers.
- **Scope.**
  - **Measurement:** a 100-question stratified dev split with paired bootstrap and McNemar tests; S1 scale harness v0 (= CI-5), with F-S and F-100K nightly and F-1M weekly; S8 (context tokens, end-to-end latency and $/question in every table).
  - **Retrieval fixes:** RA-2, RA-3 (with `as_of`/`tz`), RA-4, RA-5, RA-6/RA-13, RA-7, RA-12 with NEW-4, RA-21.
  - **Indexing stopgaps (RA-1, RA-14):** keep the `CONSOLIDATION_INNER_BATCH_SIZE` default at 50 and document batch size 1 (which the standalone image already uses) as the benchmarked, recommended setting; the default changes with S6 batching in RT-4. Keep raw content when summarizing; truncate explicitly; make embedding failures visible. NEW-5 is solved for new rows when the documented setting is used.
  - **Truth signals:** RA-8 (exclude expired rows; surface status, `superseded_by` and `valid_until`; break ties on `occurred_at`), RA-11 (`retrieval_id`, which also closes PERF-22 and MX-3), SC-22, SC-24.
  - **Reader:** A1 (`format=context`, with the harness consuming it), plus a 1-session WB-08 recall-fencing test.
  - **Speed:** PERF-2 (S2, part 1: the tie-break fix, `setup:vector`, `ef_search`/iterative scan), PERF-4, PERF-9, and the PERF-1 COALESCE expression index (A3 in RT-4 needs it).
  - **Longitudinal:** L1a (streamed LongMemEval-S with sleep on and off), protocol pre-registered.
  - **G1:** AP-1 (10 core tools with annotations, generated from one spec), NEW-2, NEW-3, NEW-7, and Skill-B: stdio `.mcp.json`, behaviour evals in CI, the live REST test (step 3) and trigger evals (step 4). Each fix edits the skill in the same PR (PACKAGING §6).
  - **Remote MCP transport (U-5a):** stateless Streamable HTTP, an MCP conformance suite for 2026-07-28 and 2025-11-25, tool annotations, bearer auth bound to loopback by default (PACKAGING §5 P2 stage 1). It is enabled beyond loopback only once AR-4 lands (SEC-1).
  - **Distribution and hedges (MIT, CI-tested):** an Anthropic memory-tool backend (`memory_20250818`) in the TS and Python SDKs (COMPETITIVE-ANALYSIS §6.4; Supermemory ships one; a ZDR-eligible path); a Strands `MemoryStore` adapter and an ADK `BaseMemoryService` adapter (§3.15: adapters are MemForge's cheapest distribution). Funded by dropping the second external harness (§10).
  - **G2 de-risking:** the E0-8 platform, IdP and gateway spikes (Claude, ChatGPT, Gemini Enterprise, M365; MCP gateways) against a stub remote server. They test D3's stated falsifier (COMPETITIVE-ANALYSIS §9 D3), cost 3–4 sessions, and decide whether RT-3's seams are aimed correctly.
- **Exit criteria:**
  1. LongMemEval-S QA with reader R1 (gpt-4o-2024-08-06) and the official judge is **≥ 72%**, or ≥ the RT-1 official-judge baseline + 4 points if the re-judge moved the baseline by more than 2. The paired test against RT-1 must give p < 0.05. The shipped-default run is reported beside it.
  2. Per-category QA (R1): temporal ≥ 65, multi-session ≥ 64, knowledge-update ≥ 80, single-session-user ≥ 80, preference ≥ 60, assistant ≥ 95.
  3. QA with R2 (pinned Claude) is +4 to +8 points over its RT-1 baseline, and the cost per question is published.
  4. Scale (server-side): F-S hybrid p50 ≤ 50 ms and p95 ≤ 120 ms. F-100K is measured, with hybrid p95 ≤ 300 ms. EXPLAIN shows the HNSW index in use, and filtered recall@10 is ≥ 0.98 of exact search (a recall check against exact search, not a QA figure).
  5. Regression tests:
     - a query containing "today" returns rows;
     - a compound query outranks its fragments for the row that matches both;
     - query → feedback over HTTP gives `updated > 0`;
     - an expired row is excluded by default.
  6. The default `tools/list` returns exactly 10 tools, each with a `title` and annotations, at ≤ 30% of today's serialized size.
  7. Skill trigger evals: should-trigger queries fire in ≥ 90% of runs and near misses in ≤ 10%, on Haiku, Sonnet and Opus. Behaviour evals score ≥ 0.8 in CI, with a positive delta against the no-plugin baseline on every case.
  8. L1a protocol pre-registered; results published as a labelled pre-repair baseline that does not count toward D1.
  9. Each platform has a written E0-8 decision: the customer's own IdP works, the reference Keycloak broker is required, or the platform is deferred; plus a written gateway decision.
  10. U-5a passes the MCP conformance suite for both protocol revisions on loopback.
  11. The memory-tool backend and the Strands and ADK adapters pass their contract tests in CI.
- **Effort.** 58–82 sessions.
- **Depends on:** TT-1, TT-2 (embedding outside the transaction), TT-3, TT-10, TT-11, TT-14. U-5a after AP-1 and TT-11.

### 4.5 RT-3: v3.15.0 "Seams" → branch-ready

- **Goal.** Make the core operable, and build the seams that Team Starter and the enterprise edition plug into, without changing OSS behaviour. Give G1 its first hosted reach. Make conflict detection real.
- **Scope.**
  - **Operations:** OP-1 (one Zod config schema; startup validation), OP-2 (`/health`, `/ready`, `memforge doctor`).
  - **Seams:** AR-1, AR-2, AR-3 (request context only; no new audit columns), AR-5, AR-4 (`MemoryContext` plus `authorize()`; the OSS default stays allow-all, plus an optional token → agent-prefix map, the short-term SEC-1 fix), AR-8.
  - **OAuth resource server (U-5b):** Protected Resource Metadata, JWKS, audience, challenges. It starts straight after AR-2, in parallel with AR-3 and AR-4.
  - **G1 hosted reach (Skill-C1):** once AR-4 lets U-5a leave loopback: the Claude Code HTTP transport; the Messages API MCP connector; a claude.ai custom connector via beta static headers (single-user only; ENTERPRISE-EDITION §7.3 and Appendix C); ChatGPT via Secure MCP Tunnel.
  - **Truth maintenance:** RA-10/SC-2 (conflict producer), which depends only on RA-8 and gates D1, D2, Gate C and the "conflicts are detected" claim. Funded by merging RA-15 into U-1 (E0-4 already makes pool search a rank-based arm) and moving OP-8 to RT-5.
  - **D1 method:** pre-register the L2 protocol and release the harness with adapters for at least two other systems (for example Mem0 OSS and the Anthropic memory tool).
  - **Contracts and tests:** AP-4, CI-2 (TS SDK, OAuth stub, HTTP isolation matrix, behavioural security tests).
  - **Retrieval:** PERF-3 (S3: AND-first lexical search, normalised rank, `btree_gin (agent_id, content_tsv)`).
  - **G2:** E0-9 threat model v2.
- **Exit criteria:**
  1. AR-4 and AR-8 have merged. `src/index.ts` exports the auth factory, `DreamRunsWorker` and the cache API. An import-boundary lint rule exists for `ee/`.
  2. The isolation matrix (CI-2) is green. In prefix mode, a token bound to one agent prefix is refused on every route and tool for other prefixes. In default mode, the matrix asserts the documented single-trust-domain behaviour.
  3. An invalid config exits with code 78 and names the variable. `process.env` is read only in `config.ts` and the exempt client files.
  4. With the DB stopped, `/ready` returns 503 within 2 s while `/health` returns 200. `memforge doctor` exits non-zero on each seeded fault.
  5. The lexical arm runs at ≤ 50 ms p50 on F-100K, with no loss in session-level R@10 retrieval recall on LongMemEval-S.
  6. QA with R1 shows no paired-significant regression against RT-2.
  7. U-5b: no token → 401 with `resource_metadata`; wrong audience → 401; missing scope → 403 `insufficient_scope`.
  8. Skill-C1 smoke (manual): Claude Code over HTTP, the API MCP connector, a single-user claude.ai connector and ChatGPT through the tunnel each list and call tools.
  9. Ingesting A and then not-A produces a contested pair or a resolution within one cycle (RA-10).
  10. The L2 protocol is pre-registered, and the harness is released with at least two third-party adapters. Threat model v2 is committed.
- **Effort.** 38–58 sessions.
- **Depends on:** TT-15 (no AR item starts before the whole suite runs in CI), OP-1 before AR-2, AR-2 plus AR-3 before AR-4, RA-8 before RA-10.

### 4.6 RT-4: v3.16.0 (horizon)

- **Goal.** Pilot a team on MIT core. Index the right unit (chunks) and reason about time properly. Give the skill per-user OAuth on hosted surfaces.
- **Scope.**
  - **Team seams (MIT core):**
    - **Team Starter first** (ENTERPRISE-EDITION §11.0; about 20–30 sessions including U-7 and `memforge connect`): the principal from the customer IdP's JWT (U-5b); personal plus shared team namespaces through AR-4's map extended to a `groups` claim; read-only or read-write per connection; attribution on every write (U-7); U-2 as the single audit-format migration (actor inside the hash, key ring, `redact`); contributions stored as `provisional` with author and platform; `memforge connect` wiring one shared namespace per repository into Claude Code, Codex, Cursor and Gemini CLI; CI-2's isolation matrix extended to group-mapped namespaces; OP-7 (`TRUST_PROXY`, per-principal rate limits) before the pilot.
    - **Team pilot** with one engineering team or the design partner as soon as Team Starter passes: weekly contributors, cross-platform recalls (scenario S1), stale or wrong recalls, and requests for curation are measured. Its users are the natural base for the demand gate.
    - Then U-1 (multi-partition query, absorbing RA-15), U-3, an E0-6 check (U-6 was delivered by S2 and S3), OP-7 with CI-4, and AR-9 (RLS enforced under a non-owner role).
  - **Accuracy core:**
    - A2 with S6 (`warm_tier_chunks`; neighbour restore; batched embedding outside transactions; write-behind; threshold-triggered consolidation, which also resolves RA-18/SR-14); the batch-size default changes here;
    - A3, A9;
    - AR-11 slice 1 (`RetrievalService`, extracted as A2 rewrites retrieval);
    - BEAM-100K and BEAM-1M baselines.
  - **G1 (Skill-C2):** per-user OAuth. OSS users bring their own OIDC IdP, using the E0-8 recipes (or the reference Keycloak compose, if decision 18 puts it in core). Submit the plugin to the Anthropic directory and list the npm server package in the MCP Registry. A directory connector listing and OpenAI public submission need a public HTTPS endpoint, which a self-hosted product does not have (decision 19).
- **Exit criteria:**
  1. The E0 acceptance criteria for U-1, U-2, U-3 and U-7 in ENTERPRISE-EDITION §11.2 are green. A claude.ai custom connector and a ChatGPT developer-mode app each authenticate a test user as themselves through a customer IdP and list and call tools against a staging URL.
  2. The full HTTP suite passes under the non-owner app role with RLS forced on all 30 tables (AR-9). The OP-7 multi-instance suite passes its five assertions.
  3. QA with R1 is **≥ 78%**. Turn-level evidence recall@10 (retrieval) is ≥ 90%. The lean profile (≤ 4K tokens) scores ≥ 74% QA with R1. Median reader context is ≤ 12K tokens.
  4. Speed:
     - F-100K hybrid p50/p95 ≤ 60/150 ms; F-1M ≤ 150/400 ms;
     - freshness p95 ≤ 2 s (lexical) and ≤ 15 s (semantic);
     - full LongMemEval-S ingest ≤ 45 min while embedding every chunk.
  5. BEAM baselines (one pinned reader) are published.
  6. The plugin is submitted to the Anthropic directory, and the server package is listed in the MCP Registry.
  7. The Team Starter pilot has run for at least 4 weeks, and its four measures are published to the owner.
- **Effort.** 69–102 sessions (team seams 45–65 ∥ accuracy 24–37).
- **Depends on:** RT-3; TT-14 (the chunk tables need the runner).

### 4.7 RT-5: v3.17.0 + EE preview (E1) (horizon)

- **Goal.** Run one department on three platforms with zero leaks, and make truth maintenance safe.
- **Scope.**
  - **EE share** (only once the demand gate passes, decision 7): E0-7 (`ee/` scaffold, licence files, a second migration track, `Dockerfile.ee`, the core suite under both servers) and E0-10 (isolation matrix v1, EE scale fixture) at kickoff; then E1-1…E1-11 and AR-10. The pilot uses data up to `internal`.
  - **Core share:**
    - SC-6 (separate verification from confidence); SC-5 (transactional revision with an optimistic guard); SC-7 (deprecated-namespace decay folded into Phase 1); SC-8 (a real merge, compress guards, a shadow-mode arm); SC-20 (random-delimiter fencing; reject escaped revisions); SC-15 (implicit corroboration; COMPETITIVE-ANALYSIS D2 depends on it);
    - A5 (resident preference block);
    - OP-3 (memory metrics, real token accounting with SC-26's structured counters and pre-call budget check, Grafana and alerts: #54), OP-4 (admin API and agent-level hard delete: SEC-9), OP-8;
    - L1b/c and L2 v0, after the SC items above have landed;
    - S4 (one-statement hybrid);
    - AR-6 (outbox webhooks) and AR-7 (phase registry);
    - CI-3 (failure-injection harness).
- **Exit criteria:**
  1. The E1 exit in ENTERPRISE-EDITION §11.3 is met:
     - 10–30 users on at least 3 platforms for 4 weeks;
     - at least 50 items contributed and reviewed;
     - zero security incidents;
     - zero unauthorized reads or writes across at least 5 principals × 6 spaces × every route and tool on every PR;
     - zero leaks across 200+ adversarial cases;
     - scenario S1 within 5 s;
     - a client capped at `internal` receives no `confidential` row across 1,000 seeded queries.
  2. QA with R1 is in the **78–83%** band, and preference QA is ≥ 70.
  3. L2 v0 does no harm: the SQL-only-sleep and full-sleep arms score ≥ the no-maintenance arm on every probe family within the CI, and the P1 stale-answer rate falls 30% relative to the no-maintenance arm.
  4. A revision whose source row changed underneath it is rejected (SC-5), and the shadow-mode arm records revisions without adopting them (SC-8).
  5. `promtool check rules` passes, and every metric name is in the snapshot test.
  6. A hard delete leaves zero rows for the agent in every table, and `verify()` still passes.
  7. The failure-injection tier (CI-3) is green.
- **Effort.** 99–148 sessions (EE 56–85 ∥ core 43–63). If the demand gate has not passed, only the core share runs.
- **Depends on:** Gate B (AR-9, AR-10, OP-7, U-1, U-5a/U-5b, U-6, RA-8, RA-11); the demand gate; the E0-8 decisions; A2 merged with a paired dev-split gain (RT-4 exit 3).

### 4.8 RT-6: v3.18.0 + EE 1.0 (E2) (horizon)

- **Goal.** Department GA, ready for a security review. Accuracy work only where a measured need remains.
- **Scope.**
  - **EE share:** E2-1…E2-11, with U-4 (hard delete and `redact` primitives) and OP-6 (backup, restore and export v2) as Gate C. E2-1 (SCIM), E2-2 (native broker) and E2-9 (metering) are uncommitted until a partner needs them. The second-department run starts on the E1 preview during the E2 build.
  - **Core share:**
    - the S5 remainder, S7 (sleep cost; fixes PERF-6);
    - L2 v1 and L3;
    - OP-5, AP-2 (AP-3, with CI-run framework guides for #21, is uncommitted);
    - a gated #13 two-pass triage experiment;
    - **conditional on a measured need after RT-4:** A4 (facts lane; makes `_hint_*` real), A6, A7, LongMemEval-M QA.
- **Exit criteria:**
  1. The E2 exit in ENTERPRISE-EDITION §11.4 is met:
     - the external identity review is closed with no open high findings;
     - the erasure suite finds 0 hits, and every chain verifies, including after restore and replay;
     - the legal-hold suite passes on every destructive path;
     - a second department or design partner runs it for 8 weeks.
  2. QA: R2 (the product number) ≥ 92%; R1 (the cohort number) holds the RT-5 band, or reaches 84–88% if M3 accuracy work ran. BEAM-1M QA is ≥ 70%.
  3. L2 v1 is published. Either the primary endpoint passes (ΔAUC ≥ +3 with a CI that excludes 0, and P8 non-inferior), or the null result is published and the D1 claim narrowed.
  4. F-1M p50/p95 ≤ 100/250 ms; median context ≤ 8K tokens.
  5. An independent, Redis-style gpt-4o reproduction has been requested.
  6. The nightly restore drill meets the stated RPO/RTO (OP-6); the rolling-upgrade smoke passes (OP-5); OpenAPI covers 100% of routes, each with an `operationId` (AP-2). If AP-3 was built, the TS and Python SDK parity tests pass.
- **Effort.** 110–164 sessions (EE 69–103 ∥ core 41–61), of which the cut list marks about 37–55 uncommitted.
- **Depends on:** Gate C (U-4, OP-6, AR-6, AR-7, RA-10, SC-5, SC-8, SC-20, SC-24, SC-22/26).

### 4.9 RT-7: v4.0 + EE 1.x (E3) (uncommitted)

- **Scope.**
  - E3-1…E3-8: HA reference, scale, ID-JAG, agent governance, curator UI, portability (including WB-14 procedures → SKILL.md), assurance and the published leakage benchmark, analytics;
  - S9 (department instance: partitioning, worker tier);
  - BEAM-10M; a LongMemEval-V2 Small entry;
  - the A8 graph-arm spike, gated on a measured gain;
  - the remaining AR-11 slices.
  - v4.0 removes the tools and APIs deprecated under AP-4's policy.
- **Exit criteria:**
  1. The kill-a-replica drill passes: no client-visible errors beyond one retry.
  2. The pen test has no open high or critical findings.
  3. The leakage benchmark is public and reproducible.
  4. BEAM-10M QA is ≥ 62% (pinned reader).
  5. F-Dept read p95 is ≤ 300 ms, and small-tenant p95 stays ≤ 1.2× its isolated figure.
- **Effort.** 58–92 sessions. Uncommitted until revenue or a signed design partner; E3-6 portability is promoted earlier if a risk-15 tripwire fires.

---

## 5. Work-item register

Goal = G1/G2/G3. Impact = H/M/L (reason where not obvious). Effort in sessions, from the track documents. RT = milestone. "Unc." = uncommitted (§10 cut list).

| ID | Title | Goal | Evidence | Effort | Impact | RT | Depends on |
|---|---|---|---|---|---|---|---|
| TT-1 | Background writes cannot end the process | G3 | SR-1 C, PERF-5 C, SC-11 C | S 1–2 | H | 1 | TT-15a |
| TT-2 | Outages degrade, not fail; no network calls in transactions | G3 | SR-10 C, PERF-7 P | M 3–5 | H | 1 | TT-1 |
| TT-3 | Sleep phases re-arm | G3 | SR-3 C, SC-1 P | S 1 | H (D1 prerequisite) | 1 | — |
| TT-4 | Dream-run lease; per-agent lock; 409 | G3/G2 | SR-5 C, ARCH-10 C | M 3–4 | H | 1 | TT-14 |
| TT-5 | Audit chain verifies on healthy data (no hash-input change) | G3/G2 | SR-4 C, SEC-8 C | M 3–4 | H (D4) | 1 | TT-14, TT-15a |
| TT-6 | Input guards; pool deletes off; 4xx codes | G3 | ARCH-11 C, SR-13, NEW-6 | S 1–2 | M | 1 | — |
| TT-7 | Export/import stop over-promising | G3 | SR-9 C, ARCH-8 C | S 1–2 | M | 1 | — |
| TT-8 | Images and compose build and boot | G3 | SEC-3 C, PERF-1 P | M 2–4 | H | 1 | — |
| TT-9 | Every install channel works | G1/G3 | MX-2 C | M 2–3 | H | 1 | TT-8, TT-13 |
| TT-10 | MCP stdio speaks MCP | G1 | MX-1 C, SR-2 C | S 1–2 | H (unblocks G1) | 1 | — |
| TT-11 | Auth on in every path | G3/G2 | ARCH-1 C, SEC-3 C, MX-5 C | S–M 2–3 | H | 1 | TT-8, TT-15a |
| TT-12 | Truth pass; `check-docs` in CI; removals (Dreams delegation, bridge, M365 manifest) | all | RA-9 P, SEC-12 C, SEC-2 C, SC-3 P, SC-10 P, MX-12 | M 4–5 | H (T4) | 1 | — |
| TT-13 | One version; release gate | G3 | SR-17 | S 1 | M | 1 | — |
| TT-14 | Migration runner, schema version | G3/G2 | SR-7 C, MX-9 P | M 4–6 | H | 1 | TT-15a |
| TT-15a | All 35 test files in CI, non-blocking; red count per file | G3 | SR-8 P | S 1 | H (safety net) | 1 (wk 1) | — |
| TT-15b | Red files pass; job blocking | G3 | SR-8 P | M 1–3 | H | 1 (wk 4–6) | TT-8, TT-15a |
| CI-6 | Release gate across channels | G3 | SR-8 P | S 1 | M | 1 | TT-9, TT-15b |
| N-1 | Official judge; re-judge, publish both; wrong-answer evidence share | G3 | N-1 | S 1–2 | H (D5) | 1 | — |
| RA-20 | Label harness-added dates | G3 | RA-20 | S 1 | M | 1 | — |
| RA-14 run | Shipped-default LongMemEval-S run | G3 | RA-14 C | S 1 (~$40) | H (D5) | 1 | N-1 |
| Skill-A | Plugin, marketplace, zips, static CI; skill 0.1; release-time edits; one manual eval run | G1 | T6 | M 4–6 | H | 1 | TT-9 (npm and GHCR only), TT-11, TT-12 |
| NEW-1 | Reads honour namespace header | G1 | NEW-1 | S 1 | M | 1 | — |
| #22 | ADRs | G3 | #22 | S 1 | L | 1+ | — |
| Dev split | 100-question dev set; paired statistics | G3 | accuracy §1.0 | S–M 2–3 | H | 2 | N-1 |
| S1 / CI-5 | Scale harness v0 | G3/G2 | PERF-20 | M 3–4 | H | 2 | TT-15b |
| S8 | Reader-side cost: context tokens, end-to-end latency and $/question in every table | G3 | Zep 2.58 s vs 28.9 s; Redis cost model | S 1–2 | M | 2 | A1 |
| RA-2 | Full query always searched; RRF fusion | G3 | RA-2 C (92/500 questions) | S 1–2 | H | 2 | Dev split |
| RA-3 | Soft time words; `as_of`, `tz` | G3/G1 | RA-3 C | S 2 | H | 2 | — |
| RA-1/14 stopgap | Batch size 1 documented as the benchmarked setting (default unchanged until S6); raw content kept; visible embed failures | G3 | RA-1 P, RA-14 C, NEW-5 | S 2 | H | 2 | TT-2 |
| RA-8 | Expired excluded; status surfaced | G3/G2 | RA-8 C | M 3–4 | H (D2) | 2 | — |
| RA-11 | `retrieval_id`; feedback closable | all | RA-11 C, PERF-22 C, MX-3 P | S 1–2 | H (D2) | 2 | TT-1 |
| RA-4 | `occurred_at` everywhere | G3 | RA-4 P | S 1–2 | M | 2 | — |
| RA-5/6/7/13/21 | Scoring defects | G3 | RA-5 P, RA-6, RA-7, RA-13, RA-21 | S 4–6 | M | 2 | Dev split |
| RA-12 + NEW-4 | Snippet segmenter fallback | G1/G3 | RA-12, NEW-4 | S 1 | M | 2 | — |
| SC-24 | SQL sleep without an LLM | G3/G1 | SC-24 (re-checked) | S 1–2 | H | 2 | TT-3 |
| SC-22 | Write `last_sleep_cycle`, cost | G3 | SC-22; #54 | S 1 | L | 2 | — |
| A1 | `format=context` reader protocol | G3/G1 | RA-20; Chain-of-Note | M 3–4 | H (+2–6 QA) | 2 | RA-4, RA-8 |
| PERF-2 / S2 | HNSW usable; vector setup | G3/G2 | PERF-2 P | M 3–4 | H | 2 | TT-14 |
| PERF-4, PERF-9, PERF-1 index | Bounded fallback; versioned cache keys; COALESCE expression index | G3 | PERF-4 P, PERF-9 P, PERF-1 P | S 2–3 | M (A3 needs the index) | 2 | TT-14 |
| WB-08 | Recall-fencing test | G3 | WB-08 | S 1 | M | 2 | A1 |
| L1a | Streamed LongMemEval-S, sleep on/off; pre-registered; pre-repair baseline | G3 | SC-12 C | M 2–3 | H (D1 method) | 2 | TT-3, SC-24 |
| AP-1 | 10 core MCP tools; one spec | G1/G3 | MX-6 P | M 4–5 | H | 2 | TT-10 |
| NEW-2/3/7 | Active-recall namespace; timeline order; resume tie-break | G1 | NEW-2, 3, 7 | S 1–2 | M | 2 | — |
| Skill-B | stdio MCP, evals in CI; skill 1.0 | G1 | PACKAGING §7 | M 6–9 | H | 2 | TT-10, AP-1, RA-11 |
| U-5a (E0-5, part 1) | Remote MCP transport: stateless Streamable HTTP, conformance, annotations, loopback bearer | G1/G2 | MX-1 C, MX-6 P | M 4–6 | H | 2 | AP-1, TT-11 |
| E0-8 | Platform, IdP and gateway spikes (stub server) | G2/G1 | EE R6; D3 falsifier | S 3–4 | H (decides RT-3 seams) | 2 | — |
| Memory-tool backend | Anthropic `memory_20250818` backend in TS and Python SDKs (MIT) | G1 | COMPETITIVE-ANALYSIS §6.4; Supermemory | M 3–5 | M (T6, T12 hedge) | 2 | — |
| Strands, ADK adapters | `MemoryStore` and `BaseMemoryService` adapters (MIT) | G1 | COMPETITIVE-ANALYSIS §3.15 | S–M 2–3 | M (T6) | 2 | — |
| OP-1 | Config validated at startup | G3 | MX-11, SEC-12 C | M 4–6 | M | 3 | TT-12 |
| OP-2 | `/health`, `/ready`, `doctor` | G3 | MX-8 P | S–M 2–3 | M | 3 | TT-14 |
| AR-1 | Injectable pool; `withTenantTx` | G2/G3 | ARCH-5 P | S 1–2 | M | 3 | TT-15b |
| AR-2 | `createAuth()`, `Principal` | G2 | ARCH-2 C, ARCH-3 P, SEC-14 C | S 1–2 | H | 3 | OP-1 |
| AR-3 | Request context only (no audit columns) | G2 | SEC-7 P | S–M 2–3 | H | 3 | AR-2 |
| AR-5 | Ingest/egress hooks | G2 | SEC-10 C, SEC-6 P | S 1–2 | M | 3 | AR-1 |
| AR-4 | `MemoryContext`, `authorize()`; OSS prefix map | G2/G3 | SEC-1 C, ARCH-2 C | M 4–6 | H (branch-ready) | 3 | AR-2, AR-3 |
| AR-8 | Split routers; exports; import lint | G2 | ARCH-16 | M 3–4 | H (branch-ready) | 3 | AR-2 |
| U-5b (E0-5, part 2) | OAuth resource server: PRM, JWKS, audience, challenges | G1/G2 | SEC-14 C | M 4–6 | H | 3 | AR-2 |
| Skill-C1 | Claude Code HTTP, API connector, single-user claude.ai connector, ChatGPT tunnel | G1 | PACKAGING §3, §9 | S 1–2 | H | 3 | U-5a, AR-4 |
| RA-10 / SC-2 | Conflict producer | G3/G2 | RA-10 C, SC-2 P | M 4–6 | H (D1, D2, Gate C) | 3 | RA-8 |
| L2 protocol + harness | Pre-registered protocol; harness released with ≥ 2 third-party adapters | G3 | SC-12 C | S–M 2–4 | H (D1 method) | 3 | L1a |
| AP-4 | Error and stability contract | G3/G1 | SR-13, NEW-6 | S 1–2 | M | 3 | TT-6 |
| CI-2 | Conformance and isolation suites | G2/G3 | ARCH-19, SR-8 P | M 3–4 | H | 3 | AR-4 |
| PERF-3 / S3 | Lexical arm AND-first; tenant GIN | G3/G2 | PERF-3 P | M 3–4 | H | 3 | Dev split |
| E0-9 | Threat model v2 | G2 | SEC-12 C | S 2 | M | 3 | — |
| Team Starter | IdP identity, personal and team namespaces, attribution, `memforge connect`, pilot kit (MIT) | G2/G1 | SEC-1 C; Hindsight 18-agent installer; ENTERPRISE-EDITION §11.0 | M–L 20–30 (incl. U-7, connect) | H (demand evidence, D3) | 4 | AR-4, U-5b, U-2, OP-7 |
| U-7 (E0-3) | Attribution columns | G2 | SEC-7 P, SEC-9 C | S 2–3 | M | 4 | AR-3 |
| `memforge connect` | One shared namespace per repository across coding agents (MIT) | G1/G2 | emerging-specialists card | S–M 2–4 | M | 4 | U-5b |
| U-2 (E0-1) | Audit v2: actor in hash; key ring; `redact` (the single audit-format migration) | G2 | SEC-7 P, SEC-8 C, SR-4 C | M 4–6 | H (D4) | 4 | TT-5, AR-3 |
| U-1 (E0-4) | Multi-partition query; absorbs RA-15 (pool search as a rank arm) | G2/G3 | RA-15 P, PERF-14 | M 6–9 | H | 4 | AR-4 |
| U-3 (E0-2) | Server-owned labels; egress hook | G2 | SEC-10 C, SEC-6 P, SEC-17 U+R | S–M 3–4 | H | 4 | AR-5 |
| OP-7 (+CI-4) | Multi-replica safety; per-principal rate limits | G3/G2 | ARCH-10 C, PERF-10 C, SEC-13 C | M 5–6 | H (Gate B; Team Starter pilot) | 4 | TT-4 |
| AR-9 | RLS enforced on the app path | G2/G3 | SEC-2 C, ARCH-6 C | M–L 5–8 | H (Gate B) | 4 | AR-1, AR-4, TT-14 |
| A2 + S6 | Chunk indexing; ingest pipeline; batch-size default change | G3/G2 | RA-1 P, RA-14 C, PERF-8 P | L 14–21 | H (+4–12 QA) | 4 | TT-2, TT-14 |
| A3 | Time-aware retrieval | G3 | RA-3, RA-4 | M 4–6 | H | 4 | A2, PERF-1 index |
| A9 | Token-budget recall (covers WB-10) | G3/G1 | accuracy §2 | S–M 2–3 | M | 4 | A1 |
| AR-11 slice 1 | `RetrievalService` | G3/G2 | ARCH-4 P | M 3–4 | M | 4 | AR-4 |
| BEAM | 100K and 1M baselines | G3 | WB-06 | S–M 1–3 | M (D5) | 4 | S6 |
| Skill-C2 | Per-user OAuth; directory and registry submissions | G1 | PACKAGING §3, §9 | S 1 | H | 4 | U-5b, E0-8 |
| E0-7 | `ee/` scaffold, licences, EE migrations (the branch) | G2 | ARCH-16 | S 2–3 | H | 5 | AR-8, demand gate |
| E0-10 | Isolation matrix v1; EE fixture | G2 | ARCH-19, SEC-1 C | M 4–8 | H | 5 | CI-2, S1, E0-7 |
| E1-1…11 | EE pilot build | G2 | SEC-1 C, SEC-5 C, SEC-2 C | L 47–70 | H (D3) | 5 | Gate B, demand gate |
| AR-10 | Shared-pool safety | G2/G3 | ARCH-11 C, SC-9 P | M 3–4 | M | 5 | AR-3, AR-6 |
| SC-6 | Verification separate from confidence | G3 | SC-6 P | M 3–4 | M | 5 | — |
| SC-5 | Transactional revision with optimistic guard | G3/G2 | SC-5 P | S 1–2 | M | 5 | TT-14 |
| SC-7 | Deprecated-namespace decay folded into Phase 1 | G3 | SC-7 P | S 1 | L | 5 | TT-3 |
| SC-8 | Real merge, compress guards, shadow-mode arm | G3 | SC-8 P | M 3–4 | H (D1, Gate C) | 5 | SC-5 |
| SC-20 | Random-delimiter fencing; reject escaped revisions | G3/G2 | SC-20 U | S 1–2 | M (Gate C) | 5 | — |
| SC-15 | Implicit corroboration | G3 | SC-15 U | M 3–4 | M (D2) | 5 | RA-11 |
| A5 | Resident preference block (#48) | G3/G1 | SSP QA 56.7% | M 3–4 | M | 5 | A2 |
| OP-3 | Memory metrics; token accounting (#54); SC-26 counters and pre-call budget check | G3 | MX-8 P, SC-22, SC-26 U | M 4–6 | M | 5 | TT-1 |
| OP-4 | Admin API; agent-level hard delete | G3/G2 | SEC-9 C | M 4–6 | M | 5 | U-2 |
| OP-8 | Bounded DB growth | G3 | PERF-17, SEC-9 C | S 1–2 | L | 5 | TT-14 |
| L1b/c, L2 v0 | Third-party and synthetic longitudinal runs | G3 | SC-12 C | M–L 7–10 | H (D1) | 5 | RA-10, SC-6, SC-7, SC-8, OP-3 |
| S4 | One-statement hybrid | G3/G2 | PERF-19 | M 3–4 | M | 5 | S2, S3 |
| AR-6 | Outbox event sink | G3/G2 | ARCH-9 P | S–M 2–3 | M | 5 | AR-1 |
| AR-7 | Phase registry; per-phase budgets (WB-11) | G3/G2 | SR-3 C | M 3–5 | M | 5 | TT-3, OP-3 |
| CI-3 | Failure-injection harness | G3 | SR-8 P | M 4–6 | M | 5 | TT-2 |
| E2-1…11 | Department GA (E2-1, E2-2, E2-9 unc.) | G2 | SEC-9 C, SEC-5 C | L 60–91 | H (D3, D4) | 6 | Gate C |
| U-4 | Hard delete, `redact`, tombstones | G2 | SEC-9 C | S–M 3–4 | H | 6 | U-2 |
| OP-6 | Backup, restore, export v2 | G3/G2 | SR-9 C, ARCH-8 C | M 6–8 | H | 6 | TT-14 |
| A4 | Facts lane; real `_hint_*` (conditional on measured need) | G3/G1 | RA-9 P, RA-14 C | L 6–10 | H (+2–6 QA) | 6 (unc.) | A2 |
| A6, A7 | Cross-encoder; decomposition | G3 | accuracy §2 | M 7–9 | M | 6 (unc.) | A2 |
| LongMemEval-M | QA run | G3 | accuracy §4.2 | S 2–3 | L | 6 (unc.) | A2 |
| S5 rest, S7 | Housekeeping; sleep cost | G3/G2 | PERF-6 P | M–L 7–11 | M | 6 | AR-7 |
| L2 v1, L3 | Primary endpoint; telemetry | G3 | SC-12 C | L 9–14 | H (D1) | 6 | L2 v0 |
| OP-5, AP-2 | Upgrades; OpenAPI | G3/G1 | MX-12, MX-13 | M 6–8 | M | 6 | AP-4 |
| AP-3 | SDK parity (#21) | G3/G1 | MX-13 | M 3–4 | L | 6 (unc.) | AP-2 |
| E3-1…8 | Scale, HA, ecosystem | G2 | ENTERPRISE-EDITION §11.5 | L 37–57 | M–H | 7 (unc.) | E2 |
| S9, A8, BEAM-10M | Department scale; gated graph arm | G3/G2 | PERF-2/3/6 | L 22–30 | M | 7 (unc.) | S7 |

---

## 6. Track documents

Each track document is the detailed specification for its items; this plan owns sequencing, calendar and decisions.

| Goal | Document | What it holds | Where this plan places it |
|---|---|---|---|
| G1 skill | [plugins/memforge/PACKAGING.md](../plugins/memforge/PACKAGING.md), [plugins/memforge/skills/memforge/SKILL.md](../plugins/memforge/skills/memforge/SKILL.md) | The skill, its channels, code prerequisites, traceability and test plan. Why it matters: the cheapest answer to T6, and the only skill with explicit coexistence routing against first-party memory, usable without hooks on claude.ai Chat (COMPETITIVE-ANALYSIS §8 item 5) | Skill-A RT-1, Skill-B RT-2, Skill-C1 RT-3, Skill-C2 RT-4 |
| G2 enterprise | [ENTERPRISE-EDITION.md](ENTERPRISE-EDITION.md) | Edition model, identity, spaces, curation, compliance, Team Starter, E0–E3 | Team Starter and E0 RT-4; E1 RT-5 behind the demand gate; E2 RT-6; E3 RT-7 (unc.). Edition structure: decision 3 |
| G3 accuracy and speed | [g3-accuracy-speed.md](g3-accuracy-speed.md) | Measurement milestone M0, levers A1–A9, speed items S1–S9, longitudinal L1–L3 | M0 RT-1/2; M1 RT-2/3; M2 RT-4/5; M3 RT-6 (conditional); M4 RT-7 (unc.). Minimum competitive path completes at the RT-4 exit |
| G3 stability and ops | [g3-stability-ops.md](g3-stability-ops.md) | TT-1…15, OP-1…8, AP-1…4, AR-1…11, CI-2…6 | v3.13.0 = RT-1 unchanged; the rest per the Appendix B crosswalk. Deliberate deviation: G1 and accuracy (RT-2) come before the seams |

---

## 7. Benchmarks and targets per milestone

**Readers.**
- **R1:** `gpt-4o-2024-08-06`. Comparability with the gpt-4o cohort. If the snapshot is retired from the API, R1 is frozen as historical (risk 16).
- **R2:** one pinned current Claude model; the owner picks the exact ID (decision 10). It is the production reader for G1, and its number is the **product number**; R1 is the **cohort number**.
- **R3:** `gpt-oss-120b`. Cheap dev-split runs on every retrieval PR.

**Judge.** `gpt-4o-2024-08-06` with the official per-type prompts, with the legacy judge reported until it is retired.

**Rules** (accuracy plan §4.1):
- the shipped default is reported beside every headline; until S6 changes the batch-size default (RT-4), the documented benchmarked setting and the shipped default are both reported, with neither hidden;
- tune only on the dev split;
- report paired CIs;
- publish raw answers;
- report cost and context tokens with every accuracy number;
- never put recall beside QA;
- never mix readers in one column.

### 7.1 QA and retrieval

M3 accuracy work (A4, A6, A7, LongMemEval-M; about 20–30 sessions) runs only on a measured need once the RT-4 minimum competitive path is done. 84–88% with R1 in 2028 would only match gpt-4o-reader results others published in 2026 (Mastra OM 84.23%, 2026-02-09; Redis Remis+Instruct 86.5%, 2026-09-21): parity, not differentiation.

| Benchmark (metric · reader) | RT-1 | RT-2 | RT-3 | RT-4 | RT-5 | RT-6 | RT-7 |
|---|---|---|---|---|---|---|---|
| LongMemEval-S **QA** · R1 · official judge | Re-baseline with both judges; shipped-default run; wrong-answer evidence share | ≥ 72% | hold (no paired regression) | ≥ 78% | 78–83% | hold; 84–88% only if M3 runs | hold |
| LongMemEval-S **QA** · R2 (pinned Claude), product number | baseline | +4 to +8 vs RT-1 | — | — | ≥ 88% | ≥ 92% | hold |
| LongMemEval-S **QA**, lean profile (≤ 4K tokens) · R1 | — | — | — | ≥ 74% | — | ≥ 80% if M3 runs | hold |
| LongMemEval-S turn-level evidence **recall**@10 (retrieval) | — | baseline | — | ≥ 90% | — | ≥ 93% | hold |
| LongMemEval-M (unc.) | — | — | — | — | — | **QA** ≥ 72% (R1) if run | — |
| BEAM **QA** (one pinned reader) | — | — | — | 100K and 1M baselines | — | 1M ≥ 70% | 10M ≥ 62% |
| Independent reproduction | — | — | — | — | — | requested (Redis-style gpt-4o run) | — |

memorybench is uncommitted: the plan keeps one second harness, the Redis-style gpt-4o run.

### 7.2 Longitudinal "improves over time" benchmark (SC-12; D1)

| RT | Deliverable | Target |
|---|---|---|
| RT-2 | **L1a**: streamed LongMemEval-S in 5 epochs; sleep on vs off | L1a protocol pre-registered; results published as a labelled pre-repair baseline that does not count toward D1. A delta near 0 or negative is expected on today's code. |
| RT-3 | **L2 protocol and harness** | Protocol pre-registered; harness released with adapters for at least two other systems (for example Mem0 OSS and the Anthropic memory tool), so MemForge owns the open method whatever its own delta. |
| RT-4/RT-5 | **First endpoint** | P1 stale-answer rate on knowledge-update streams (L1c, L2 v0), driven by RA-8 and RA-10; published by the RT-5 exit at the latest. |
| RT-5 | **L1b/c** (MemoryAgentBench test-time learning and selective forgetting; Supersede environment), plus **L2 v0** (10 personas, 6 months) | Do no harm: SQL-only and full-sleep arms ≥ the no-maintenance arm on every family within the CI. P1 stale-answer rate −30% vs no maintenance. |
| RT-6 | **L2 v1** (20–30 personas, 12 months, 5 arms, 3 seeds; full grid on R3, R1 on final checkpoints, ≤ ~$500), plus **L3** in-product probes | Primary endpoint: ΔAUC (full sleep − no maintenance) ≥ +3 QA points, 95% CI excluding 0. P8 stable facts non-inferior (≥ no maintenance − 1.0). P4 leak rate ≤ 2%. **Publish a null result too.** |

**Prerequisites before any result counts toward D1:** TT-3, SC-24, RA-11, RA-10, SC-6, SC-7, SC-8 (shadow mode), real token accounting (OP-3), and RA-8. All are scheduled by RT-5 (§5).

### 7.3 Latency, scale and cost

These are server-side figures on pinned hardware (accuracy plan §4.5). They are planner targets until S1 measures them.

| Metric | Today | RT-2 | RT-4 | RT-5 | RT-6 | RT-7 |
|---|---|---|---|---|---|---|
| Hybrid p50/p95, F-S (~50 rows per agent) | 43–46 / 99 ms | ≤ 50 / 120 | hold | hold | hold | hold |
| Hybrid p50/p95, F-100K | unmeasured (est. 0.5–1 s) | measured; p95 ≤ 300 | ≤ 60 / 150 | ≤ 60 / 150 | ≤ 50 / 120 | hold |
| Hybrid p50/p95, F-1M | unmeasured (est. 5–10 s) | measured | ≤ 150 / 400 | ≤ 150 / 400 | ≤ 100 / 250 | hold |
| EE recall p95, 1M rows, 10–20-space read set | — | — | — | ≤ 300 ms; RLS overhead ≤ 10% | hold | F-Dept p95 ≤ 300 ms |
| Freshness (add → searchable) | never without a manual consolidate | — | lexical ≤ 2 s, semantic ≤ 15 s p95 | hold | hold | ≤ 5 s / 30 s under load |
| Median reader context, default profile | 32,396 tokens | hold | ≤ 12K | ≤ 12K | ≤ 8K | hold |
| Connections per hybrid query | 4–6 | ≤ 3 | ≤ 3 | ≤ 2 | 1–2 | 1–2 |
| Cost reporting | ~$35–40 per R1 run | $/question (S8) | + $/session (Redis model) | + sleep $/agent-month | same | same |

Nightly gate: fail on a p95 regression of more than 25% (S1/CI-5).

### 7.4 Stability and manageability targets

| Target | Threshold | From (item) |
|---|---|---|
| Unplanned process exits under the fault suite | 0 | RT-1 → every RT (TT-1, TT-2) |
| Test files run in CI | 35/35, count asserted | RT-1 (TT-15) |
| Clean-clone compose to `/ready` | ≤ 60 s | RT-1 (TT-8) |
| Upgrade from 3.0.0-beta.4 and 3.7.0 | zero schema diff; a rerun applies nothing | RT-1 (TT-14) |
| Phantom names in the docs | 0 | RT-1 (TT-12) |
| Invalid configuration | exits with code 78 and names the variable | RT-3 (OP-1) |
| `/ready` with the database down | 503 within 2 s; `/health` 200 | RT-3 (OP-2) |
| Multi-replica suite | 5/5 assertions | RT-4 (OP-7) |
| Metric snapshot and `promtool check rules` | pass | RT-5 (OP-3) |
| Failure-injection tier | green | RT-5 (CI-3) |
| Nightly restore drill | within the stated RPO/RTO | RT-6 (OP-6) |
| Rolling-upgrade smoke | passes | RT-6 (OP-5) |
| OpenAPI route coverage | 100%, every route with an `operationId` | RT-6 (AP-2) |
| SDK parity (if AP-3 is built) | TS and Python parity tests pass | RT-6 (AP-3, unc.) |

---

## 8. Reconciliation

### 8.1 July work blocks (NEXTGEN-RECOMMENDATIONS.md)

| WB | Title | Status | Decision and reason |
|---|---|---|---|
| WB-01 | Relabel benchmark claims | **Done** (2026-07-27) | Keep the discipline. TT-12 extends it to all docs. |
| WB-02 | QA accuracy harness | **Done** (67.6%) | **Carried** follow-ups: N-1 (RT-1); dev split, cost per question (RT-2). |
| WB-03 | Fix single-session preference | Open | **Carried, re-targeted** to QA: preference 60 (RT-2) → 70 (RT-5) via RA-6, A2, A5; A4 only if M3 runs. Merged with #48. |
| WB-04 | Longitudinal benchmark ★ | Open | **Carried** as L1/L2/L3 (RT-2 → RT-6). This is D1. |
| WB-05 | Sleep before/after deltas | Open | **Carried** as L3 (RT-6) plus OP-3 phase metrics (RT-5). |
| WB-06 | BEAM 1M/10M | Open | **Carried:** baseline in RT-4, 1M ≥ 70% in RT-6, 10M in RT-7 (unc., after S9). |
| WB-07 | Bi-temporal validity | **Partly done** (`occurred_at`, `valid_until`) | **Carried** as RA-8, RA-4 (RT-2) and A3 (RT-4): the data exists, ranking ignores it. |
| WB-08 | Context fencing | Open; not in the audit | **Carried** as a 1-session test with A1 (RT-2); if amplification shows up, ingest strips marked recall blocks. |
| WB-09 | Pre-compression hook | Open | **Superseded** by the plugin's PreCompact/SessionEnd hooks (Skill-A); no server route needed. |
| WB-10 | Tiered context loading | **Partly done** (`snippet_tokens`, `max_tokens`) | **Superseded** by A1 (RT-2) and A9 (RT-4). |
| WB-11 | Cost cadence controls | Open | **Carried** as OP-3 token accounting (RT-5) and AR-7 per-phase budgets and cadence (RT-5). Merged with #54. |
| WB-12 | Opt-in scheduler | Open | **Cut from core** (ADR). S6 threshold consolidation fixes the real pain (RA-18); EE adds a space scheduler (D-EE-9). |
| WB-13 | Hermes provider plugin | Open | **Deferred.** Hermes now bundles only RetainDB and ByteRover; effort goes to the Claude plugin and the MIT framework adapters. |
| WB-14 | Procedures as skill files | Open | **Deferred to RT-7** (E3-6, unc.); needs RA-11 and SC-17 first. |
| WB-15 | Reposition docs | Open | **Carried:** truth pass in RT-1; repositioning on D1–D5 as each claim gate opens. |

### 8.2 Open GitHub issues

| Issue | Decision | Milestone and reason |
|---|---|---|
| #13 Multi-model revision strategy | **Keep, defer** | `REVISION_LLM_PROVIDER` already splits cheap and capable models. Two-pass triage becomes an RT-6 experiment measured on L2 (cost per point gained). |
| #21 Framework integration guides | **Keep, reshape** | Guides only for integrations tested in CI: MCP and Claude Code with Skill-A/B (RT-1/2); RT-2 (Strands, ADK, memory tool); others on demand. SDK guides with CI-run snippets come with AP-3 (unc.). |
| #22 ADRs | **Keep, do now** | RT-1. Record decisions 1, 2, 3, 8 and 9 from §9, then one ADR per decision as it is made. Still a good first issue for later ADRs. |
| #23 BM25 via pg_textsearch | **Keep, defer** | Its PostgreSQL version, preload, licence and managed-Postgres requirements are unchecked (S3). Fix the lexical arm first (PERF-3/RA-13, RT-3; chunk tsvectors in A2, RT-4); revisit only if the dev split shows the lexical arm is the bottleneck. |
| #48 Single-session preference underperforms | **Keep, update** | Its April keyword-mode R@5 premise is superseded: today preference QA is 56.7% (R1). Work: RA-6 (RT-2), A2 (RT-4), A5 (RT-5), A4 if M3 runs; targets as WB-03. |
| #49 Semantic and hybrid benchmark runs | **Close as done** | Both modes are in `benchmarks/RESULTS.md`, and the hybrid run is the official configuration (`OFFICIAL-RESULTS.md`). |
| #54 Scheduled consolidation, change budgets, cost tracking | **Keep, split** | SC-22 `last_sleep_cycle` (RT-2); token and cost tracking in OP-3 (RT-5); `max_revisions_per_cycle` as an AR-7 per-phase budget (RT-5). Scheduling stays external in core (WB-12). |
| #115 Phase 5 funding brief | **Keep, rewrite** | Re-scope the ask to the open longitudinal benchmark (D1); Phase 5 §5.C's $300–1,500 harness budget fits. Pause 5.3–5.6 (§8.3); drop the "Phases 1–4 complete" framing. Decision 11. |

### 8.3 Phase 5 items (PHASE_5_PLAN.md)

| Item | Decision | Reason |
|---|---|---|
| 5.1 Self-assessment API | **Defer to RT-6, folded into L3** | `memforge_epistemic_profile` and revision history already cover part of it. A calibration claim ("confidence matches accuracy") needs the L2/L3 harness and SC-6 first. |
| 5.2 Epistemic humility | **Superseded** | Delivered by RA-8 plus A1: status, confidence and validity rendered for the reader. That is D2. No separate API. |
| 5.3 Hierarchical abstraction | **Defer; gate on L2** | Principles and abstractions routes exist, but schema detection and causal inference are effectively dead on real data (SC-16 U). Redesign or cut only after L2 probe family P5 (aggregation) shows whether abstraction helps. |
| 5.4 Knowledge-graph schema evolution | **Cut this iteration** | The riskiest write path (red on all three risk axes in Phase 5 §4). The graph evidence on LongMemEval is weak or negative, so A8 is gated to RT-7. |
| 5.5 Learning-strategy selection | **Defer to after L2 v1** | It changes which phases run. It needs the AR-7 phase registry and an A/B harness (L2). The one adaptive policy that exists today was itself a bug (SC-1). |
| 5.6 Emergent namespaces | **Cut** | It reassigns rows across partitions, which conflicts with EE's space = partition model (D-EE-3) and with ACLs. Highest destabilization risk. |

### 8.4 NEW-1…NEW-7 (found while writing the skill)

| ID | Finding | Decision | RT |
|---|---|---|---|
| NEW-1 | Read routes ignore the `X-Memforge-Namespace` header that writes honour | **Keep** (skill P0) | RT-1 |
| NEW-2 | Active-recall takes no namespace and always searches `default` | **Keep** | RT-2 |
| NEW-3 | Timeline returns the *oldest* rows by default | **Keep** | RT-2 |
| NEW-4 | Snippet extraction needs turn markers; falls back to the row head | **Keep**, merged with RA-12 (the same segmenter later feeds A2) | RT-2 |
| NEW-5 | A consolidated row keeps only the earliest `occurred_at` of its batch | **Keep**: solved for new rows when the documented batch-size-1 setting is used (RT-2); by default with S6 and A2 (RT-4) | RT-2 / RT-4 |
| NEW-6 | Contention and bad input surface as 500 | **Keep**, merged into TT-6 (413/400) and AP-4 (409 and the error contract) | RT-1 / RT-3 |
| NEW-7 | `resume` orders by importance alone, which is flat until a sleep cycle runs | **Keep** (S); recency tie-break | RT-2 |

None of these is cut. Each is small and removes a workaround from the skill.

---

## 9. Owner decisions needed

Items marked **open** have no settled answer; the rest have a firm recommendation you can accept as-is.

1. **Release number and auth (stability D1, D2).** *Recommend:* ship `main` as **v3.13.0** so the version matches the migrations and docs, with fail-closed auth in that minor release (loopback-only opt-out, UPGRADING.md entry). *Alternative:* 4.0.0 if you treat fail-closed auth as breaking. If 4.0.0 is chosen, renumber RT-2…RT-7 as 4.1…4.6 and 5.0.
2. **Registry housekeeping (MX-2).** *Recommend:* confirm why 3.7.0 never reached npm `latest`; publish to GHCR (Docker Hub only if you will maintain it); rename the Python distribution (for example `salishforge-memforge`) and fix every `pip install memforge` line on day 1; use `npx -p @salishforge/memforge memforge-mcp` rather than a shim package; set up trusted publishing and 2FA before the first publish; run `npm deprecate` on 3.0.0-beta.x the day `rc.1` publishes.
3. **Edition structure (D-EE-1). The owner said fork; this is how.** *Recommend:* the fork is an edition, `ee/`, in the public repository, composing core only through `src/index.ts`, one CI and one release train; extract to a separate package after 2–3 releases. `ee/` is created at E1 kickoff (E0-7), behind the demand gate. *Documented alternative:* a separate private repository consuming the published core at an exact pin, with automated bump PRs and a 24-hour security-sync target. It gives a cleaner boundary and allows closed source, at the cost of a second CI, slower security fixes and edition drift (EE risk R15). A hard copy of `src/` is not recommended: the three highest-churn files would need hand merges and every security fix would be applied twice.
4. **`ee/` licence (D-EE-2) — open.** Not needed before E0-7. Three options (ENTERPRISE-EDITION §3.7):
   - **(a) ELv2 for all of `ee/`, with no licence keys.** Free internal use means it restricts only managed-service resale, which has little value at 28 npm downloads a month (ENTERPRISE-EDITION §12.3). It loses the "open source" label and needs a CLA and counsel review.
   - **(b) Buyer-based open core.** E1 team features (spaces, OIDC resource server, contribution, attribution) are MIT. The compliance plane (retention, legal hold, DSAR and erasure orchestration, the DLP egress matrix, SCIM, the SIEM feed, analytics) is under ELv2 or a commercial licence with keys. This matches the research's opening against Hindsight, whose OSS edition reportedly lacks team features (#2235), and COMPETITIVE-ANALYSIS D3.
   - **(c) AGPL-3.0 plus a commercial licence.** OSI-approved; needs a CLA.
   - *Plan-review preference:* (b). In every case: a written promise that no security fix is ever EE-only; a DCO for core; counsel review before the first EE release. **Counsel question:** how enforceable are licence terms over code produced mostly in AI coding sessions?
5. **Sequencing.** *Recommend:* this plan's order (RT-2 before RT-3), with Team Starter first in RT-4. *Alternative:* swap RT-2 and RT-3; branch-ready and both pilots move about 9 weeks earlier at the upside (about 14 at the plan of record), but skill 1.0 and the M1 fixes slip by the same amount, and the pilot still needs RA-8 and RA-11. Only the alternative, or Team Starter at the 9/week upside, meets ENTERPRISE-EDITION §12.3's condition of a pilot by mid-2027; at the plan of record the recommended order delivers the Team Starter pilot around 2027-09 and the E1 pilot in 2028. Revisit at the RT-1 exit.
6. **Capacity split after E1 kickoff.** *Recommend:* about two-thirds EE and one-third core (6/3 at 9 a week, about 3/2 at 5 a week), run as alternating 2–3-week blocks (§3.1 item 7), with EE's share funding the core gate items (AR-9, U-*, OP-6). *Alternative:* an even split, which lands core accuracy work sooner and E1 later.
7. **Design partner and the demand gate — open.** *Recommend:* start customer discovery in week 1 (questions only; T4 forbids product claims, not questions). **E1-1…E1-11 (47–70 sessions) start only when a design partner has signed a pilot agreement or LOI naming a department, three platforms and a start date, or the Team Starter pilot shows demand** (ENTERPRISE-EDITION D-EE-14). Until then, after RT-3 build only MIT seams and Team Starter (ENTERPRISE-EDITION §11.0), and re-test the gate at each RT exit. If a partner withdraws mid-E1, label the preview "unvalidated": E1-10's isolation and adversarial suites must still pass on a synthetic ≥ 5-principal × 6-space fixture, and E2 is held until a partner exists.
8. **MCP and OAuth libraries (stability D3, D-EE-4).** *Recommend:* keep the hand-rolled stdio transport; allow a hand-rolled stateless remote transport only with an MCP conformance suite in CI for both protocol revisions; validate tokens with a widely used JOSE library; build any authorization server on a certified OIDC library. Record it as an ADR amending CLAUDE.md.
9. **Scheduler (WB-12, D-EE-9).** *Recommend:* core stays scheduler-free (`sleepAdvisory` plus documented cron); S6 adds threshold-triggered consolidation; EE gets a space scheduler.
10. **Benchmark readers and budget.** *Recommend:* pin R2 to one current Claude model ID now, and approve about $1,500 of API spend through RT-6 (R1 milestone runs at ~$40 each, R2 runs, the ~$500 L2 grid, R3 dev runs). Publish raw answers. This covers API spend only; reviews are decision 17.
11. **#115 and Phase 5 — partly open.** *Recommend:* re-scope the funding brief to the open longitudinal benchmark (D1) and pause 5.3–5.6 (§8.3). Whether to seek grants before v3.13.0 ships is your call.
12. **Shared pools in OSS (EE open question 5).** *Recommend:* keep them, documented as one trust domain (TT-12), with destructive dedup off (TT-6) until AR-10 and no new features; retire them only inside EE, where spaces replace them.
13. **Anthropic Dreams delegation and Memory Store bridge (SC-3, SC-10).** *Recommend:* **remove from core in RT-1**, or move to an unsupported contrib package, rather than maintain them as "experimental". Rebuild on the documented API only on user demand or a risk-15 tripwire; off in EE (D-EE-8).
14. **Security support policy (D-EE-10).** *Recommend*, until a second maintainer or paid security contact exists, publish in SECURITY.md at v3.13.0: acknowledge within 72 h; a fix or published mitigation within 7 days for critical and 30 days for high; supported versions: the latest minor only; a named backup contact. No EE LTS line until a paying customer funds it.
15. **Plugin defaults (PACKAGING open questions 4 and 6).** *Recommend:* auto-recall off by default; no auto-approve hook for the script, so users see the permission rule.
16. **EE decisions that can wait until E1 kickoff (RT-5):** D-EE-3, 5, 6, 7, 11, 12, 13. ENTERPRISE-EDITION §13.2's recommendations stand.
17. **Second maintainer and assurance budget — open.** *Recommend:* recruit a co-maintainer or a paid security reviewer before E1 kickoff (EE risks R2 and R19: identity code owned by one person; procurement asks about vendor continuity). Price the external identity review (needed at the E2 exit) and the E3-7 pen test now. Decision 10 covers API spend only, so Gates E2 and E3 cannot close as currently budgeted.
18. **Reference Keycloak compose in core.** Ship the reference Keycloak compose under MIT in core, so G1 users can reach hosted surfaces with per-user OAuth in RT-4 without their own IdP? *Recommend:* yes.
19. **Directory listing and a demo endpoint — open.** A directory connector listing and OpenAI public submission need a public HTTPS endpoint, which a self-hosted product does not have. Run a demo endpoint (with its own security and cost) or skip connector listings and list only the plugin and the npm server package. Either way, the plugin listing needs privacy-policy and terms URLs.
20. **EE commercial model — open** (ENTERPRISE-EDITION §3.7): support and SLA contracts, a commercial licence where the chosen licence restricts use, managed BYOC later; pricing per instance or per space. Decide with decision 4, at E1 kickoff.

**Adopted as recommended without further decision:** stability D4 (in-process migration runner), D5 (Postgres-native disaster recovery), D6 (no `agent_id` metric labels), D7 (10 core tools), D10 (branch after AR-4 and AR-8).

---

## 10. Risks and mitigations

**Capacity assumption.** The plan of record is 5 coding sessions a week, after reserving about 30% of owner time for non-session load (§1); 9 a week is the upside. At 5 a week, RT-1 to RT-3 take about 30–42 weeks (midpoint 36, ending about 2027-07-25); at 9 a week about 22. The repository had no commits from 2026-07-29 to 2026-11-16, and T10 (maintainer bandwidth) is rated Certain/High (COMPETITIVE-ANALYSIS §7; EE risk R1). Re-plan at the week-2 checkpoint and at each RT exit from measured sessions per week.

| # | Risk | L / I | Mitigation |
|---|---|---|---|
| 1 | **Capacity falls short** | H / H | Commit only to RT-1…RT-3. **Uncommitted until revenue or a signed design partner (about 95–150 sessions):** all of RT-7 (E3-1…8, S9, A8, BEAM-10M, LongMemEval-V2, the remaining AR-11 slices: 58–92); E2-2 native broker (10–16; D-EE-5 already makes the customer IdP or Keycloak the E1 mode); E2-1 SCIM (5–7; build it when a partner's IdP requires it); E2-9 metering (4–6); A4 (6–10) and A6/A7 (7–9) unless a measured need remains; LongMemEval-M (2–3); a second neutral harness (memorybench, 1–2; the Redis-style gpt-4o run stays); AP-3 (3–4); the EE 12-month LTS line. **Remove, don't maintain:** the Anthropic Dreams delegation and the Memory Store bridge (RT-1; SC-3 P, SC-10 P) and the M365 manifest that makes `agent_id` model-supplied (ENTERPRISE-EDITION Appendix B #8). **Cut next inside RT-1…RT-3:** OP-8 → RA-5/6/7/21 polish → E0-9 → the ADK adapter → S1 limited to F-100K. **Never cut:** TT-1, TT-10, TT-11, TT-12, TT-14, TT-15, N-1, RA-2, RA-3, RA-11, A1, AR-4. After E1 kickoff, cut E3-5, E3-8, E3-6 and the M365 kit first (EE §11.1). |
| 2 | **Full CI turns red** (29 dormant files) | H / M | TT-15a counts red files in week 1 behind a non-blocking job; stabilisation pass (TT-15b) in weeks 4–6. |
| 3 | **Fail-closed auth breaks open deployments** | M / M | Explicit opt-out, a startup error naming the fix, UPGRADING.md. |
| 4 | **The N-1 re-judge moves the baseline** | M / M | Targets become "baseline + Δ" if it moves > 2 points; report both judges. |
| 5 | **A2's gains depend on the reader** | M / H | Per-reader profiles (A9); dev-split gates before defaults change; R2 is the production reader. |
| 6 | **The longitudinal result is null or negative** | M / H | Pre-registration; shadow-mode arm; publish anyway; narrow D1 ("bounded and current at lower query cost"); the open harness keeps D1 as a method claim. |
| 7 | **Platform churn** (MCP revisions, connector OAuth rules) | H / M | E0-8 spikes in RT-2; two protocol versions; conformance in CI; Keycloak fallback. |
| 8 | **Security-critical identity code, one owner** | M / Critical | Resource server only through E1; certified libraries; external identity review before E2 exit; pen test before E3; adversarial review of identity PRs; decision 17. |
| 9 | **The window closes** (Zep governed MCP, Hindsight v1.0, Work IQ) | H / H | Compete where they structurally cannot: on-prem identity, epistemic governance, verifiable audit, open measurement. Team Starter pilot first; design partner from customer discovery. The E1 pilot lands around 2027-10 at the upside (2028 at the plan of record), after the window ENTERPRISE-EDITION §12.3 names; Team Starter is the mid-2027 route. Revisit decision 5 at the RT-1 exit. |
| 10 | **Claims run ahead of reality again**, and AI sessions inherit doc drift via CLAUDE.md | H / H | Claim gate (§3.3); `check-docs` in CI; CLAUDE.md fixed on day 1 and treated as code; target positioning held back until its claim gates open. |
| 11 | **Team retrieval quality disappoints in the pilot** | H / H | E1 only after A2 merges with a paired dev-split gain (RT-5 depends on it) and A3; small structured team items; RA-8 demotion. |
| 12 | **Licence confusion** (two licences in one repository, if decision 4 picks one) | M / M | Decision deferred to E1 kickoff; per-directory LICENSE; `files` whitelist; CLA for `ee/` where needed; counsel review. |
| 13 | **Supply-chain compromise** (MemTensor, 2026-09-23) | M / H | Trusted publishing with provenance and 2FA before the first publish, signed images, SBOM, pinned Actions, renamed PyPI package, `npm deprecate` on the old betas. |
| 14 | **Benchmark spend grows** | L / M | R3 for development; R1/R2 only at milestones; L2 grid on R3; budget per decision 10. |
| 15 | **First-party team memory ships** (Anthropic or OpenAI) | M / H | **Leading indicators:** OpenAI has "teams of Dots" planned alongside ChatGPT Space (openai card, DevDay 2026-09-29); Anthropic Memory Stores can be attached read-write to many sessions and agents in a workspace, and to self-hosted sandboxes since 2026-08-19 (anthropic card, fact-checked); Claude memory transfer between AI services exists (experimental); Work IQ opens a memory read path to agents from December 2026. **Tripwires:** org-shared memory in Claude or ChatGPT business plans; Memory Stores gain user ACLs, self-hosting, or ZDR/HIPAA eligibility; a cross-vendor memory import/export standard appears. **Pre-agreed response:** drop any work a single-vendor team memory covers; target EE only at multi-vendor, sovereign and regulated buyers; promote the portability items (the memory-tool backend, Claude memory-export and Work IQ imports, a Memory Store bridge rebuilt on the documented API) from E3-6 to the next RT; position MemForge as the governed, cross-vendor system of record behind first-party memory. Review the tripwires at every RT exit (COMPETITIVE-ANALYSIS §6.5, T12). |
| 16 | **The R1 snapshot is retired from the API** | M / M | Freeze R1 as historical, keep comparisons to runs already made, and continue with R2 (product number) and R3. |

---

## 11. Deferred / not doing

| Item | Status | Reason |
|---|---|---|
| Hosted SaaS or managed cloud | Not doing | Cannot out-distribute Mem0 or Zep; needs its own SOC 2, on-call and key management. EE is customer-run. |
| LoCoMo | Not doing | Saturated. |
| Graph database; graph-first retrieval | Not doing | Pure-Postgres rule; negative LongMemEval evidence (Zep 71.2% vs Remis 83.4% QA, gpt-4o). A8 spike gated to RT-7. |
| LLM extraction or rerank in the default path | Not doing | Rerank costs ~11.5 s per query for +1.1 QA points at generous budgets; raw turns were non-inferior at 3,061× lower write cost. A4 and A6 stay opt-in. |
| Comparisons across readers or metrics | Not doing | One cohort only (§3.2); recall never beside QA. |
| New default embedding model | Deferred past A2 | Whole-row embedding is the defect; bge-small is adequate at turn level. |
| Built-in scheduler in core (WB-12) | Not doing | Rule kept; S6 and the EE space scheduler cover the need. |
| Admin UI in core | Not doing | API and CLI first (stability D8); curator UI is E3-5. |
| Phase 5.4, 5.6 | Cut | Highest risk; conflict with the space model. |
| Phase 5.1, 5.3, 5.5 | Deferred (RT-6+) | Need L2/L3 to evaluate. |
| Hermes plugin (WB-13) | Deferred | The bundle slot is gone. |
| BM25 extension (#23) | Deferred | Its PostgreSQL version, preload, licence and managed-Postgres requirements are unchecked; PERF-3 first. |
| Two-pass revision triage (#13) | RT-6 experiment | Needs L2 to measure quality per dollar. |
| Anthropic Dreams delegation and Memory Store bridge (SC-3, SC-10) | Removed from core in RT-1 | Built on an assumed API; rebuild on the documented API only on demand or a risk-15 tripwire. |
| memorybench, LongMemEval-M, AP-3, A4/A6/A7 | Uncommitted | §10 cut list; capacity. |
| EE 12-month LTS line | Not until funded | Decision 14. |
| ACL-mirroring connectors | Not in E0–E3 | Attack surface; competes with Glean and Work IQ; Slack API terms. |
| SOC 2, FedRAMP, HIPAA attestations | Not doing | Self-hosted; ship a control mapping (E3-7). |
| User modelling | Not doing | Honcho's category; integrate instead. |
| Official MCP SDK in core | Not doing | CLAUDE.md rule kept, guarded by conformance tests (decision 8). |
| Subject-level erasure in OSS | Deferred to E2-6 (RT-6) | Needs principals and provenance (U-7, U-4). OSS gets agent-level hard delete (OP-4, RT-5) and an operator erasure runbook (RT-1). |
| Sleep Phase 1 cost at 1M rows (PERF-6) | Deferred to S7 (RT-6) | Matters only at a scale nobody runs today; S1 measures it first. |

---

## Appendix A: coverage of every confirmed critical/high audit finding

C = confirmed; P = partially confirmed (severity as adjusted by the verifier). No critical or high finding is left without an owner.

| Finding | Sev / status | Work item(s) → RT |
|---|---|---|
| SR-2, MX-1 | critical C | TT-10 → RT-1 |
| MX-2 | critical C | TT-9, CI-6 → RT-1 |
| ARCH-1 | critical C | TT-11 → RT-1 |
| SEC-1 | critical C | **RT-1:** documented as a single trust domain (TT-12). **RT-3:** AR-4 OSS token → agent-prefix map. **RT-4:** Team Starter (IdP identity, personal and team namespaces, one instance per team). **RT-5:** full principal model, E1-3. **Interim reason:** no multi-user deployment is supported before Team Starter, and full per-user isolation waits for E1. |
| RA-1 | high P | Documented stopgap → RT-2; A2 → RT-4 |
| RA-2, RA-3, RA-11, PERF-22, MX-3 | high C/P | RT-2 |
| RA-8 | high C | RT-2 (surface and exclude); confidence-weighted ranking after SC-6 → RT-5 |
| RA-9 | high P | TT-12 (docs) → RT-1; A4 (make hints real) → RT-6, only if M3 runs |
| RA-10, SC-2 | high C/P | RT-3. **Interim:** TT-12 removes the claim in RT-1. |
| RA-14 | high C | Shipped-default run → RT-1; documented batch-size-1 setting → RT-2; default changed with S6 and A2 → RT-4 |
| RA-15 | high P | Merged into U-1 → RT-4 |
| SC-1, SR-3 | high P/C | TT-3 → RT-1 |
| SC-11, PERF-5, SR-1 | high C | TT-1 → RT-1 |
| SC-12 | high C | L1a → RT-2 (pre-repair baseline); L2 protocol → RT-3; L2 v0 → RT-5; L2 v1 and L3 → RT-6 |
| PERF-1 | high P | TT-8 → RT-1; COALESCE expression index → RT-2 |
| PERF-2 | high P | S2 → RT-2; verified as U-6 → RT-4 |
| PERF-3 | high P | S3 → RT-3 |
| PERF-6 | high P | **Deferred** to S7 → RT-6. Reason: affects only very large agents; measure with S1 first. |
| PERF-7, SR-10 | high P/C | TT-2 → RT-1 |
| PERF-10 | high C | OP-7 (`TRUST_PROXY`, rate limits keyed by token or principal, Redis store) → RT-4, before the Team Starter pilot. **Interim:** documented as a known limitation in TT-12 (RT-1); it matters mainly for shared instances, which start with Team Starter. |
| SR-4 | high C | TT-5 → RT-1; U-2 → RT-4 |
| SR-5, ARCH-10 | high C | TT-4 → RT-1; OP-7 → RT-4 |
| SR-7, MX-9 | high C/P | TT-14 → RT-1; OP-5 → RT-6 |
| SR-8 | high P | TT-15a/b → RT-1; CI-2 → RT-3; CI-3 → RT-5 |
| SR-9, ARCH-8 | high C | TT-7 → RT-1; OP-6 → RT-6 |
| SEC-2, ARCH-6 | high C | Claim corrected (TT-12) → RT-1; AR-9 → RT-4 |
| SEC-3 | high C | TT-8, TT-11 → RT-1 |
| SEC-5 | high C | **Interim:** TT-12 (RT-1) documents that shared pools have no owner or roles and form one trust domain; AR-4 (RT-3) scopes pool reads by caller (with SEC-4); destructive pool dedup is off via TT-6 (ARCH-11). Knowledge spaces with roles → E1, RT-5. |
| SEC-9 | high C | Agent-level hard delete (OP-4) → RT-5; U-4 and E2-6 subject erasure → RT-6. **Reason:** agent-level hard delete must keep audit chains verifiable, which needs U-2's `redact` (RT-4); subject erasure also needs U-7 attribution. **Interim (RT-1, TT-7/TT-12):** document that `clear()` archives rather than deletes, and publish an operator erasure runbook. |
| MX-5 | high C | TT-11 → RT-1 |
| ARCH-2 | high C | AR-2, AR-4 → RT-3; E1-3 → RT-5 |
| ARCH-11 | high C | TT-6 (off by default) → RT-1; AR-10 → RT-5 |

---

## Appendix B: how to read this plan

**Milestones are RT-1 … RT-7** ("release train"). Each RT is one core release (v3.13 … v3.18, then v4.0) and, after E1 kickoff, an enterprise-edition (EE) phase on the same tag. **Every work item keeps its track ID:**

| Track | IDs | Detail document |
|---|---|---|
| G3 stability and ops | TT-1…15 (TT-15a/b), OP-1…8, AP-1…4, AR-1…11, CI-2…6 | g3-stability-ops.md |
| G3 accuracy and speed | M0–M4 (its milestones), A1–A9 (levers), S1–S9 (speed items), L1a–c/L2/L3 (longitudinal), N-1…N-3 (new findings) | g3-accuracy-speed.md |
| G1 skill | Skill phases A/B/C1/C2 (written **Skill-A/B/C1/C2** here), P0/P1/P2 code lists, test steps 1–7, NEW-1…NEW-7 (new findings) | plugins/memforge/PACKAGING.md |
| G2 enterprise | Team Starter; E0–E3 (phases), E0-1…E3-8 (deliverables), U-1…U-7 (core seams; U-5 is split into U-5a and U-5b), Gates A/B/C, D-EE-1…14 (decisions) | ENTERPRISE-EDITION.md |
| Strategy | D1–D5 (differentiators), T1–T13 (threats) | COMPETITIVE-ANALYSIS.md |

**Milestone crosswalk.** Superseded labels → RT:
- **Stability plan:** v3.13.0 → RT-1 (unchanged). Its v3.14 "Operable" items → RT-3 (OP-1, OP-2, AR-1/2/3/5), RT-4 (OP-7), RT-5 (OP-3, OP-4, OP-8, AR-6), RT-6 (OP-5, OP-6). Its v3.15 "Small surface" items → RT-2 (AP-1), RT-3 (AP-4, AR-4, AR-8), RT-5 (AR-7, CI-3), RT-6 (AP-2; AP-3 uncommitted). Its v3.16+ items → RT-4 (AR-9, AR-11 slice 1), RT-5 (AR-10), RT-7 (remaining AR-11 slices, uncommitted).
- **Accuracy plan:** M0 → RT-1/2, M1 → RT-2/3, M2 → RT-4/5, M3 → RT-6 (conditional), M4 → RT-7 (uncommitted).
- **Enterprise edition:** Pre-E0 → RT-1–RT-3 (with U-5a, U-5b, E0-8, E0-9); E0 (with Team Starter) → RT-4; E1 → RT-5; E2 → RT-6; E3 → RT-7.
- **Skill:** A → RT-1, B → RT-2, C1 → RT-3, C2 → RT-4.
- **From now on, v3.14.0 means "Measured & Connected" and v3.15.0 means "Seams".**

**Calendars superseded by this plan:** ENTERPRISE-EDITION's original §1.4 and §11.1 calendar (week 1 = 2026-11-23; branch mid-January 2027; GA early October 2027); the g3-stability-ops Summary table (v3.14 "Operable", v3.15 "Small surface", branch around week 14); g3-accuracy-speed's 7–9-month estimate. Each document carries a banner saying so.

**Name clashes to watch:** S1–S9 are speed items, while "S" alone is an effort size. R1/R2/R3 are benchmark readers. The stability plan's decisions D1–D10 are written "stability D1" here, and D1–D5 always means the differentiators. NEW-n (skill) and N-n (accuracy) are different finding series. The longitudinal benchmark's arms have names (no-maintenance, SQL-only sleep, full sleep, shadow, feedback), not letters, so they are not confused with levers A1–A9.

**Conventions.**
- **Audit status:** (C) confirmed, (P) partially confirmed, (U) unverified, (U+R) unverified but re-checked at HEAD by a track plan.
- **Effort:** S is under 1 day, M is 1–5 days, L is over 1 week. A **session** is one AI coding session of about 2–3 hours, including review.
- **Benchmarks:** every number carries its metric (QA accuracy, retrieval recall, latency) and reader. **Retrieval recall is never compared with QA accuracy.**
- **Public-repo rule:** security problems appear as work to do, by audit ID. This document contains no exploit steps.
