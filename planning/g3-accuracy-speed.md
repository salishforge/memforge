# MemForge G3 plan: accuracy and speed

- **Status:** detailed specification for the accuracy and speed track. **Calendar superseded by NEXT-ITERATION-PLAN.md §4:** M0 → RT-1/RT-2, M1 → RT-2/RT-3, M2 → RT-4/RT-5, M3 → RT-6 (conditional on measured need), M4 → RT-7 (uncommitted). Its 80-week horizon supersedes this plan's 7–9-month estimate.
- **Date:** 2026-11-16
- **Goal:** G3 (accuracy and speed). It also feeds G1, because the skill should teach the reader protocol in §2 A1, and G2, through the tenant-scoped retrieval and the scale work in §3.
- **Code baseline:** `main` at `16e2f15` (2026-07-29). Nothing has been committed since the October 2026 audit, so the audit's line numbers still apply.
- **Companion plan:** `g3-stability-ops.md` owns crash safety, install, MCP framing, migrations and CI. Some findings in the §1 tranche belong to that plan; they are marked "owner: stability TT-n" and appear here only for their effect on accuracy or speed. Do not build them twice.
- **Not covered here:** the content of the G1 skill, and the G2 identity, tenancy and knowledge-space design.

## How to read this

**Evidence labels.** Every item cites audit IDs and/or competitor evidence.
- **C**: confirmed by the second-model verifier.
- **P**: partially confirmed (the verifier changed the severity or scope).
- **U**: unverified (plausible, not proven).
- **U+R**: unverified in the audit, but this plan re-checked that claim at HEAD.
- **N**: new; found while preparing this plan and checked at HEAD.

Appendix B lists every re-check.

**Benchmark labels.** Every number carries its metric type, reader model, judge, who ran it, and date.
- **QA**: end-to-end question-answering accuracy, graded by an LLM judge.
- **R@k**: retrieval recall at k.
- **CER**: complete-evidence recall, meaning every gold session was retrieved.
- **Run by:**
  - *self*: the vendor or authors reporting on their own system;
  - *repro*: a third party reproduced the number (marked when that party is a competitor).

This plan never compares MemForge retrieval recall with anyone's QA accuracy.

**Effort.**
- **S:** under 1 day of focused work.
- **M:** 1–5 days.
- **L:** more than 1 week.
- **Session:** one AI coding session of about 2–3 hours, including review.

**Gains.** Each lever's gain is a range taken from its cited source and translated to MemForge's mix of question categories. The ranges overlap, so they do not add up. The milestone targets in §4.7 are the commitments. The per-lever ranges are planning inputs.

---

## Summary

**Three facts drive this plan.**

1. **The QA gap sits mostly after retrieval: in unit size and context assembly.**
   - MemForge answers **67.6%** of LongMemEval-S questions correctly (QA, reader `gpt-4o-2024-08-06`, self, 2026-07-29).
   - Redis Remis is in MemForge's own design class: hybrid dense + BM25, no LLM at ingest. It scores **83.4%** QA with a gpt-4o reader (run by Redis on its own system, 2026-09-21).
   - Retrieval itself measures well (see "MemForge retrieval figures" below, reported on its own). So the gap most likely comes from how memory is cut into units and how those units are handed to the reader, not from missing retrieval machinery. M0's N-1 run tests this with a QA-only diagnostic: the share of wrong answers whose complete evidence was in the reader context (same run).
2. **The published benchmark does not describe the shipped product.**
   - The benchmark stored one session per row. The shipped default packs 50 events into one row, and the default embedder reads only the first 512 tokens of a row (RA-1 P, RA-14 C).
   - The benchmark harness adds session dates to the reader's context. The product never shows dates to the reader (RA-20 U+R).
   - The judge uses a custom partial-credit prompt, not LongMemEval's question-type-specific prompts (N-1). So the 67.6% is not strictly like-for-like with the competitor rows in Table 1.
3. **Silent bugs cost accuracy today, and nothing has been measured beyond about 500 rows per agent.**
   - The compound-query split never searches the full question. That affects **92 of the 500** LongMemEval-S questions (RA-2 C; counted here, N-2).
   - Time words become hard filters against the server clock. **12 answerable questions** contain such a word, including every "most recently" question. On a rerun with the current ingest, those 12 retrieve zero rows (RA-3 C, N-2).
   - Stale facts are never demoted at query time (RA-8 C).
   - Conflict detection has nothing that feeds it (RA-10 C / SC-2 P).
   - The semantic query cannot use an HNSW index (PERF-2 P, re-checked).
   - The lexical arm ranks every OR match before applying its limit (PERF-3 P).

**The headline differentiator is unmeasured.** No benchmark has ever run a sleep cycle, so "memory improves over time" is unproven (SC-12 C). No competitor publishes such a delta on a standard benchmark either, not Anthropic Dreams, Mem0 Dream, Supermemory or MIRIX-2.0 (benchmarks-research card). The lane is still open. §4.4 designs the benchmark that would claim it.

**The plan has five milestones.**

| Milestone | Theme | Main items | LongMemEval-S QA target (gpt-4o-2024-08-06 reader, official judge) | Speed target | Sessions |
|---|---|---|---|---|---:|
| **M0** | Measure honestly | Re-judge with the official prompts (N-1); a dev split and paired statistics; a shipped-default run; scale harness v0 | Re-baseline; report both judges | First numbers at 100K rows | 8–11 |
| **M1** | Stop losing points | §1 tranche, plus A1 (reader-facing context) and longitudinal L1a (a labelled pre-repair baseline that does not count toward D1) | **72–76%** | Hybrid p95 ≤ 300 ms at 100K rows | 39–53 |
| **M2** | Right unit, right time | A2 (chunk indexing) with S6 (ingest pipeline), A3 (time-aware retrieval), A5 (preference block), A9, S2–S5; longitudinal L1b/c and L2 v0; BEAM-1M baseline | **78–83%** | p95 ≤ 150 ms at 100K rows and ≤ 400 ms at 1M; median context ≤ 12K tokens | 43–63 |
| **M3** | Facts and depth (A4, A6, A7 and LongMemEval-M only on a measured need) | A4 (facts lane), A6 (cross-encoder), A7 (sufficiency), S7; longitudinal L2 v1 and L3; LongMemEval-M QA | **84–88%**: parity with the best same-reader results (83.4–86.5%) | p95 ≤ 250 ms at 1M; median context ≤ 8K tokens | 29–45 |
| **M4** | Scale and new leaderboards | Department instance (S9), BEAM-10M, LongMemEval-V2, A8 spike | Hold M3 | Department fixture read p95 ≤ 300 ms | 20–28 |

**Minimum competitive path.** If capacity is tight, do these in order:
1. M0;
2. the five highest-value fixes from §1: RA-2, RA-3, the RA-1/RA-14 stopgaps, RA-8 and PERF-2;
3. A1;
4. A2 together with S6, which A2 needs for ingest throughput;
5. A3.

That is about 40–55 sessions, with an expected 78–83% on the gpt-4o reader. Once N-1 puts MemForge on the official judge, that would exceed Zep (71.2%, gpt-4o-2024-11-20) and Redis's reproduction of AgentCore (77.0%, gpt-4o).

**Capacity.**
- **This plan in full:** about 140–200 sessions.
- **The stability plan's v3.13.0:** about 33–47 sessions.
- **Superseded calendar:** in the integrated train (NEXT-ITERATION-PLAN §4), the minimum competitive path completes at the RT-4 exit (about 2027-06-27 at 9 sessions a week, about 2027-11-28 at the 5-a-week plan of record), and M3 at RT-6.
- **M3 is conditional.** After M2 (the minimum competitive path, expected 78–83% QA with the gpt-4o reader), M3 accuracy work (A4, A6, A7, LongMemEval-M; about 20–30 sessions) starts only on a measured need. 84–88% in 2028 would equal gpt-4o-reader results published in 2026 (Mastra OM 84.23%, Redis Remis+Instruct 86.5%): parity, not differentiation. R2 (pinned Claude) is the product number; R1 is the cohort number.

### Where MemForge stands

**Table 1: LongMemEval-S QA with a gpt-4o-class reader (like-for-like set).**

| System | QA | Reader | Judge | Run by | Date |
|---|---:|---|---|---|---|
| Redis Remis+Instruct | 86.5% | gpt-4o | official GPT-4o binary judge | Redis on its own system (vendor) | 2026-09-21 |
| Mastra Observational Memory | 84.23% (Redis repro 84.2%) | gpt-4o | gpt-4o | self; repro by a competitor | 2026-02-09 |
| Redis Remis (no LLM at ingest) | 83.4% | gpt-4o | official | Redis (vendor) | 2026-09-21 |
| Emergence Simple | 82.4% (Redis repro 81.3%) | gpt-4o-2024-08-06 | not stated | self; repro | — |
| Supermemory | 81.6% | gpt-4o | not stated | vendor; cited secondhand, unconfirmed (COMPETITIVE-ANALYSIS §5.2) | — |
| AWS AgentCore (semantic) | 73.6% self (reader not named); Redis repro 77.0% | not named (self); gpt-4o (repro) | official (repro) | self; repro by a competitor | 2026-09-21 (repro) |
| Zep | 71.2% | gpt-4o-2024-11-20 | GPT-4o with LongMemEval's question-specific prompts | self | 2025-01-20 |
| **MemForge** | **67.6%** | gpt-4o-2024-08-06 | gpt-4o-2024-08-06 with a **custom partial-credit prompt** (N-1) | self | 2026-07-29 |
| Full context (no memory system) | 60.2% / 60.6% | gpt-4o | — | Zep paper / LongMemEval paper | — |

How to read Table 1:
- Redis is a competing vendor. Its reproductions moved vendor claims by +3 to −28 points.
- The frameworks card notes that the Redis README does not name a reader for the 86.5% research configuration. The benchmarks card, refreshed from primary sources on 2026-11-16, attributes it to the 2026-09-21 report with a gpt-4o reader. Treat it as vendor-reported.

**Table 2: QA by category (gpt-4o reader).**

| Category | n | MemForge | Mastra OM | Zep | MemForge vs OM |
|---|---:|---:|---:|---:|---:|
| temporal-reasoning | 133 | 56.4 | 85.7 | 62.4 | −29.3 |
| multi-session | 133 | 59.4 | 79.7 | 57.9 | −20.3 |
| single-session-user | 70 | 75.7 | 98.6 | — | −22.9 |
| single-session-preference | 30 | 56.7 | 73.3 | 56.7 | −16.6 |
| knowledge-update | 78 | 76.9 | 85.9 | — | −9.0 |
| single-session-assistant | 56 | 96.4 | 82.1 | — | +14.3 |

**Stronger readers (not comparable to Table 1).** The top of LongMemEval-S is now 94–96% QA:
- Exabase M-1: 96.4% (Gemini 3 Flash as reader and judge, top-50).
- Papr: 96.0% (Claude Opus 4.6 reader; prompts tuned on half the questions).
- Mastra OM: 94.87% (gpt-5-mini).
- Mem0: 94.4% (reader not stated).

Exabase says label errors cap the benchmark near 96%. LongMemEval-S is saturated for strong readers. The gpt-4o comparison is where the real gap shows.

**MemForge retrieval figures.** These are recall, not QA, so do not set them beside Table 1. On LongMemEval-S (hybrid, 500 questions, self, 2026-07-29), at about 50 warm rows per agent:
- R@1 83.8%, R@5 95.4%, R@10 97.6%;
- CER 91.8%;
- query p50 46 ms.

### What this plan found beyond the audit

- **N-1: the judge is not LongMemEval's judge.**
  - **What the harness does.** `benchmarks/longmemeval-qa/evaluate.ts:52-91` asks gpt-4o-2024-08-06 for a 0.0–1.0 partial-credit score. A question counts as correct when the judge says so, or when the score is ≥ 0.5. There are no question-type prompts and no abstention prompt.
  - **What the benchmark specifies.** LongMemEval's own evaluation uses yes/no prompts per question type. Zep reports judging with these question-specific prompts, and Redis with the "official GPT-4o binary judge".
  - **Mismatch with the docs.** `OFFICIAL-RESULTS.md` calls the judge "LongMemEval's protocol judge". The judge *model* matches; the *prompt* does not.
  - **Effect.** The bias could go either way. Partial credit is more lenient. The missing type rules, such as off-by-one tolerance on day counts and accepting an updated answer that also mentions the old value, can make it stricter.
- **N-2: how many benchmark questions the two query bugs touch.** Counted by running MemForge's `parseQuery` regexes over the 500 questions in the cleaned LongMemEval release.
  - **Compound split (RA-2): 92 of 500 (18.4%)** take the path where the full question is never searched:
    - multi-session 29;
    - temporal 28;
    - single-session-assistant 33;
    - knowledge-update 1;
    - single-session-user 1.
  - **Time words (RA-3): 13 of 500.** 12 are answerable questions:
    - temporal 5;
    - multi-session 3;
    - knowledge-update 2;
    - single-session-user 2.

    The benchmark ingest stores `occurred_at` as each 2023 session date (commit `93233cf`, 2026-07-29 07:49 UTC). Any rerun therefore turns these phrases into a hard filter for "the last N days before today", and these questions retrieve **zero rows**. Whether the official run, committed about 70 minutes later, already used that corpus cannot be determined from the repository.
- **N-3: how much of a session the default embedder sees.**
  - **Size of an evidence session.** In the LongMemEval oracle file the median evidence session has 12 turns and 14.3K characters (about 3.5K tokens).
  - **What bge-small embeds.** bge-small-en-v1.5 embeds about the first 2K characters, so roughly **86%** of a typical evidence session is invisible to the semantic arm (sharpens RA-1).
  - **Turns.** The median turn is 549 characters, but 10% of turns are longer than 2,783 characters (about 700 tokens). Even turn-level chunks therefore need a split rule.
  - **Turn-level evidence labels.** 896 turns carry `has_answer` labels, so turn-level recall can be measured.

---

## 1. Correctness-first tranche (M0 + M1)

These are defects that lower accuracy or speed today without any visible error. Fix them before adding features, so that later gains are measured against a sound base. The expected effects are estimates, except where a count is given.

### 1.0 Measurement correctness (M0: do this first, or no later number can be trusted)

| ID | Problem | Fix | Expected effect | Effort |
|---|---|---|---|---|
| **N-1** | The judge prompt is a custom partial-credit rubric | Add the official LongMemEval per-type prompt set as `--judge=official` (the new default) and keep `--judge=legacy`. Re-judge the saved 2026-07-29 answers with both and publish both, plus the number of questions where they disagree. Also report the share of wrong answers whose complete evidence was in the reader context (same run), a QA-only diagnostic. | The baseline may move several points in either direction. The official judge is required before any row in Table 1 can be compared. | S (1–2) |
| **RA-20** (U+R) | The harness adds `[DATE:]` stamps and orders context by rank. The product does neither. | Until A1 lands, label harness-added context explicitly in every report. After A1, the harness consumes the product's `format=context` output instead of building its own. | The benchmark then measures what users actually get. | S (1) |
| **RA-14** (C) | The published number used `CONSOLIDATION_INNER_BATCH_SIZE=1`. The shipped default is 50. | Run LongMemEval-S once with the shipped default ingest. Publish it as "shipped default" beside the headline. | Documents the gap between the published and shipped configurations. It also becomes the regression baseline for the stopgap in §1.2. | S (1 session + ~$40 in API costs) |
| **Dev split and statistics** | Every change is judged on the full 500 questions, with no paired test | Fix a stratified 100-question dev subset (`benchmarks/lib/sample.ts` already stratifies). Add paired bootstrap CIs and McNemar tests to `report.ts`. Re-judge twice and count label flips. | Stops tuning on the test set. Separates real gains from noise: one run of 500 questions at 70% has a 95% CI of about ±4.0 points. | S–M (2–3) |
| **PERF-20** (U) | Nothing has been measured above about 500 rows | Scale harness v0: a synthetic generator plus the F-100K fixture, measuring p50/p95 per mode (§4.5). Shared with stability CI-5. | Replaces the audit's latency *estimates* with measurements. | M (3–4) |

### 1.1 Retrieval bugs

| ID | Problem | Fix | Expected effect | Effort |
|---|---|---|---|---|
| **RA-2** (C) | A query containing "and", "plus", "as well as" or "along with" is split, and only the fragments are searched. Merging keeps the max per row, so a row that matches every fragment gets no credit for it. | Always search the full cleaned query. Fuse the sub-query lists into it with RRF (sum of 1/(K+rank)). Skip the split when a fragment has fewer than two content terms, and never split inside a capitalised entity name. Run the sub-queries in parallel, not one after another. | Affects 92/500 LongMemEval-S questions (N-2), mostly multi-session and temporal. Estimated +0.5 to +2 points overall. Latency for compound queries drops from up to 3 serial hybrid queries to one parallel round. | S (1–2) |
| **RA-3** (C) | Time words become hard SQL filters against the server clock. "today" filters to the future. When the filtered search is empty, nothing retries, and the empty result is logged as a false knowledge gap. | Use parsed time words as a soft boost keyed on event time, never as a hard filter. Add an `as_of`/`now` parameter so relative words resolve against the caller's clock: the question date in benchmarks, the user's clock in products. Add `tz`. Treat "today" as start-of-day. Fall back to an unfiltered search when fewer than `limit` rows return. Do not log a knowledge gap for an empty result the filter caused. Explicit `after`/`before` stay hard filters. | Up to +2.4 points (12 answerable questions, N-2) on any rerun with `occurred_at` populated. In production, "today" currently returns nothing for every agent. | S (2) |
| **RA-8** (C) | Superseded, conflict-losing and expired memories rank like current ones. `QueryResult` has no `valid_until`, `confidence` or `superseded_by` (re-checked). | Exclude `valid_until < now()` by default (opt-in `include_expired`). Break ties on `occurred_at DESC`. Return `superseded_by`, `valid_until`, `confidence` and status, and render them in A1. **Do not** multiply rank by confidence until SC-6 is fixed: confidence currently swings from cycle to cycle and would add noise to ranking. | Knowledge-update (76.9): +2 to +5 points in that category in deployments that use supersession. LongMemEval gets little benefit until A4 and RA-10 create supersession links. Required for longitudinal family P1 (§4.4). | M (3–4) |
| **RA-15** (P) | In hybrid mode, shared-pool hits are scored on a different scale from private hits. Any pool hit above cosine ≈ 0.27 outranks every private result. With embeddings off, an explicit hybrid query errors on pool search. | Make pool search a third RRF arm weighted by trust. Guard the pool branch on `embeddingsEnabled`. Batch the reputation lookups. Scope the access-count update by agent (verifier note). | Restores the intended private-first, hearsay-discounted ranking. It is the core retrieval path for G2 team knowledge. No effect on LongMemEval, which uses no pools. | S (1–2) |
| **RA-4** (P) | The proximity boost, decay, timeline order and conflict recency all use ingestion time. | Use `COALESCE(occurred_at, time_start, consolidated_at)` everywhere. Add `occurred_at` to `TimelineEntry`. | Timeline and conflict recency become correct for imported corpora. Prerequisite for A3. | S (1–2) |
| **RA-5** (P) | The LLM reranker reads only the first 300 characters of each row. Rows it omits keep RRF-scale scores and are then dropped by the 10% quality cut. | Rerank on `extractRelevantPassages(content, q, ~400 tokens)`. Fix the score scale so non-reranked rows are not dropped. Replace the reranker in A6. | Rerank is opt-in. This makes its measured +6.2 points (gpt-oss reader, self) attributable to real evidence, and stops it from shrinking result sets. | S (1) |
| **RA-6** (U), **RA-13** (U+R) | The keyword-overlap boost matches substrings with no stopword list. `ts_rank_cd` runs with no length normalisation under OR semantics. Both favour long, chatty rows over short facts. | Reuse `snippet.ts termsOf` with word-boundary matching and an IDF weight, or delete the boost. Use `ts_rank_cd(..., 32)`. Re-measure R@1 per category. | Mostly helps R@1 on single-session-user and preference questions, where the evidence is one sentence: estimated 0 to +1 point. Becomes more important once A2 chunks make units short. | S (1–2) |
| **RA-7** (U) | The epistemic filter and the token-budget trim run after LIMIT. | Push the predicate into each arm's SQL. Reorder the post-processing to dedup, then filter, then budget. | `only_established` stops returning empty pages, and budgets fill properly. | S (1) |
| **RA-21** (U) | Relevance is multiplied by an importance score that decays with days since last access. | Remove importance from the relevance rank, or use it only as a bounded tie-breaker. Key any recency term on `occurred_at`. | No effect on LongMemEval, which runs no sleep. After sleep cycles it removes a ~20% rank penalty on old but valid memories (longitudinal families P2 and P8). | S (1) |
| **RA-12** (U) | `snippet_tokens` splits only on `[user]:`/`[assistant]:` markers. Any other format falls back to cutting off the head of the text. | Fall back to splitting on `---`, then on blank lines, then on 2-sentence windows. The same segmenter feeds A2 chunking. | Passage extraction then works for agents that do not use the benchmark's format. | S (1) |

### 1.2 Indexing stopgaps (the full fix is A2)

| ID | Problem | Stopgap | Expected effect | Effort |
|---|---|---|---|---|
| **RA-14** (C) | The indexed unit is a batch of 50 events. Summarize mode throws away raw content. `key_facts` are never indexed. | Keep the default at 50 in M1. Document `CONSOLIDATION_INNER_BATCH_SIZE=1` (which `Dockerfile.standalone` already sets) as the benchmarked, recommended configuration, and report the shipped-default run beside every headline. Change the default together with S6 batching in M2 (RT-4). Keep raw content when summarizing: put the summary in the `summary` column. | Users who follow the documented setting get the benchmarked behaviour now; the default changes only when S6 can absorb up to 50× more warm rows for agents that log short events. | S (1) |
| **RA-1** (P) | The whole row is embedded. bge-small silently truncates at 512 tokens (≈14% of a median evidence session, N-3). OpenAI rejects rows over 8,191 tokens, which leaves the embedding NULL. Phase 5.9 then retries the same oversized row every cycle. | Truncate explicitly and log the fraction kept. Make provider token-limit errors visible failures and add an `embedding IS NULL` counter to `/health`. Stop Phase 5.9 from retrying rows that are over the limit. | No silent keyword-only degradation, and operators can see the coverage loss. The accuracy gain comes with A2. | S (1) |

### 1.3 Knowledge-maintenance correctness

| ID | Problem | Fix | Expected effect | Effort |
|---|---|---|---|---|
| **RA-10** (C) / **SC-2** (P) | Nothing ever inserts into `memory_conflicts`, so Phase 2.5 resolution, the "contested" status and the documented conflict feature never do anything. | Add a Phase 2.4 detector. Candidate pairs share ≥1 entity (or ≥3 content terms) with cosine ≥ 0.8, and differ in a number, a negation or polarity. Optionally confirm with a cheap LLM yes/no call inside the token budget, or reuse the `contradictions` that `reflect()` already outputs. Then insert conflict rows. Add a test that ingests A, then not-A, and checks the resolution. | Brings the existing resolver and contested logic to life. Knowledge-update is a known weak spot across the field (Supersede, 2026-06: gpt-5.4 KU accuracy falls from 92% with full context to 77% with bounded memory). The effect is measured by longitudinal families P1 and P3. | M (4–6) |
| **RA-11** (C) = PERF-22 = MX-3 | `retrieval_log` ids are never returned, so feedback, evidence counts, promotion and graduation can never fire. | Insert with `RETURNING id`, or pre-generate a `query_id`. Put `retrieval_id` on each result in REST, both SDKs and MCP. Fold it into the same statement as the access-count update (PERF-5). | Unlocks the reinforcement loop, which the longitudinal "feedback" arm needs. One fewer detached write per query. | S (1–2) |
| **SC-1** (P) | Adaptive phase skipping permanently disables 8 phases after three quiet cycles. **Owner: stability TT-3.** | (see TT-3) | Re-enables temporal validation, which `valid_until` needs, embedding migration, which re-embedding A2 chunks needs, and reflection. Longitudinal results are not valid without this fix. | S |
| **SC-24** (U) | `sleep()` refuses to run without an LLM, although 12 of its 15 phases are SQL. | Run the SQL phases and report `llm_phases_skipped`. | Enables the longitudinal "SQL-only sleep" arm (§4.4). Default deployments get eviction, capacity limits and epistemic promotion. | S (1–2) |
| **SC-6** (P) | Confidence is an LLM opinion that oscillates against a staleness decrement each cycle, and it uses up the token budget re-verifying stable rows. | Separate verification from confidence: record `last_verified_at`, exclude recently verified rows, and blend LLM confidence with evidence instead of overwriting it. | Makes confidence fit for ranking (RA-8) and for the longitudinal results. Frees the sleep budget for rows that are actually wrong. | M (3–4) |

### 1.4 Speed and scale correctness

| ID | Problem | Fix | Expected effect | Effort |
|---|---|---|---|---|
| **PERF-2** (P, re-checked) | There is no HNSW index by default. Even if an operator adds one, `ORDER BY embedding <=> $2, id DESC` (`memory-manager.ts:1181`) stops the planner from using it, so the semantic arm is always an exact scan of the agent's rows. | Order by distance alone in an inner `LIMIT` subquery and break ties in the outer query. Add `npm run setup:vector`, which sets `halfvec(N)` from `EMBEDDING_DIMENSIONS` and builds HNSW with explicit `m`/`ef_construction`. Wrap queries in `SET LOCAL hnsw.ef_search = max(2×candidates, 100)` and `hnsw.iterative_scan = relaxed_order`; pgvector 0.8.0 is already in the standalone image. Add an EXPLAIN test and a test that filtered recall equals exact recall. | Audit estimate for the exact scan: 50–150 ms at 100K rows and 0.5–1.5 s at 1M. Target with the index: semantic arm p50 ≤ 20 ms at 1M rows, with recall ≥ 0.98 of exact (to be measured). | M (3–4) |
| **PERF-3** (P) | The lexical arm ORs every lexeme, fetches every matched tsvector and ranks them before `LIMIT`. | Search the AND form first and fall back to OR only when it returns fewer than `limit` rows. Normalise the rank (RA-13). Make the index tenant-scoped with `btree_gin (agent_id, content_tsv)`. In A2 the arm runs over small chunk tsvectors. Re-measure R@k on LongMemEval, because the OR rewrite was itself a recall fix. | Audit estimate: 0.3–1 s at 100K rows today. Target: lexical arm ≤ 50 ms p50 at 100K and ≤ 150 ms at 1M, with no R@10 loss. | M (3–4) |
| **PERF-4** (P) | When FTS returns nothing, a trigram fallback runs `ILIKE` over the full content of the agent's whole corpus. | Use `SET LOCAL statement_timeout = '2s'` on the fallback and return the empty FTS result on timeout. Or run it over a bounded candidate set or a trigram index on chunk text. | Removes a full-scan path that can hit the 30 s statement timeout at 1M rows. | S (1) |
| **PERF-9** (P) | Every `add()` triggers a full-keyspace Redis SCAN that wipes the agent's query cache. | Use a per-agent version counter in the cache key. Invalidate only stats on `add`, and queries only when `supersedes` is set. | Agents that both write and read get a real cache hit rate. Redis load stops growing with the department's key count. | S (1) |
| **PERF-5** (C) | Fire-and-forget writes have no `.catch`. **Owner: stability TT-1.** | (see TT-1) | Process survival. Folding the two detached writes into one statement also cuts connections per query (§3). | S |
| **PERF-7** (P) | LLM and embedding calls run inside an open consolidation transaction, with no timeouts. **Owner: stability TT-2.** | (see TT-2) | Moving the embedding call outside the transaction is a prerequisite for S6 batching. | M |
| **PERF-1** (P) | The schema declares an index before its table, and the compose image lacks pgvector. **Owner: stability TT-8.** | (see TT-8). In addition, for speed: the verifier found the partial index on bare `occurred_at` can never be used, because filters apply `COALESCE(occurred_at, time_end, consolidated_at)`. Add an expression index `(agent_id, namespace, COALESCE(occurred_at, time_end, consolidated_at))`. | Time-filtered queries and the A3 temporal arm stop scanning the agent's rows. | S (1) |

**Expected outcome of M0+M1, including A1 from §2.** LongMemEval-S QA of **72–76%** (gpt-4o-2024-08-06 reader, official judge). If the M0 re-judge moves the baseline by more than 2 points, read the target as "M0 baseline + 4 to 8 points". Speed at M1: hybrid p95 ≤ 300 ms at 100K rows, with the first 1M-row numbers published.

---

## 2. Accuracy roadmap

**Overview: each lever, the categories it targets, and the evidence behind it.**

| Lever | Categories (MemForge, gpt-4o) | Strongest evidence (metric · reader · run by · date) | Expected gain on LongMemEval-S (gpt-4o) | Confidence | Effort | Milestone |
|---|---|---|---|---|---|---|
| **A1** Reader-facing context assembly | TR 56.4, KU 76.9, MS 59.4 | Chain-of-Note: GPT-4o oracle 87.0 → 92.4 QA (LongMemEval paper; up to +10). Harness date stamps: TR 32.3 → 56.4 (QA, gpt-4o, MemForge self). post-graph-rag: validity periods given to the reader lift TR QA 0.496 → 0.881 (gemini-3.6-flash reader, self) | **+2 to +6** (dates are already in the harness, so the gain comes from sorting, Chain-of-Note and status). Much larger in production, where the reader sees no dates today | medium–high | M (3–4) | **M1** |
| **A2** Turn/chunk indexing with neighbour restore | SSU 75.7, SSP 56.7, MS 59.4 | Redis Remis 83.4 QA (gpt-4o, vendor, no LLM ingest). LongMemEval-M: round + fact keys 72.0 vs session 67.6 QA (gpt-4o, paper). SelRoute R@5 0.786 with bge-small at turn level (recall only, self). Chroma Context Rot: focused ~300-token prompts beat ~113K-token LongMemEval prompts on accuracy for all 18 models tested (independent, 2025-07-14) | **+4 to +12**; context 32K → 8–16K tokens | medium (MemForge's own sweep shows the effect depends on the reader) | L (8–12) | M2 |
| **A3** Time-aware retrieval end to end | TR 56.4 | Mastra OM 3-date observations: TR 85.7 QA (gpt-4o, self). Time-aware query expansion +6.8–11.3% temporal *recall* (LongMemEval paper, independent). TReMu: GPT-4o temporal multiple-choice accuracy 29.83 → 77.67 with code-based date arithmetic (self) | **+2 to +5** (TR +8 to +20) | medium | M (4–6) | M2 |
| **A4** Facts/events/preferences lane and fact-augmented keys | KU 76.9, SSP 56.7, TR, MS | Remis+Instruct vs Remis: QA +3.1 (86.5 vs 83.4, gpt-4o, vendor); verbatim assistant recall 72 → 100%. Fact keys: +9.4% R@k, +5.4% QA on average (LongMemEval-M, 3 readers, paper) | **+2 to +6** on top of A2 (with an LLM extractor); 0 to +2 from hints only | medium | L (6–10) | M3 |
| **A5** Resident preference block | SSP 56.7 | Mastra OM SSP 73.3 QA (gpt-4o, self), 100 (gpt-5-mini). Hindsight SSP 66.7 vs 20 full context (QA, GPT-OSS-20B, self) | **+0.5 to +1** (SSP +8 to +17; only 30 questions) | medium | M (3–4) | M2 |
| **A6** Local cross-encoder, budget-aware | all; mainly lean profiles | QA +9.1 at a tight budget (3 of 30) vs +1.1 at generous budgets (pre-registered study, 2026-09-28, reader not named). Emergence Simple 82.4 QA with a cross-encoder (gpt-4o-2024-08-06, self; Redis repro 81.3) | **+1 to +4** at lean budgets; ~0 at generous ones. Enables a ≤4K-token profile | medium | M (3–4) | M3 |
| **A7** Query decomposition and sufficiency | MS 59.4 | BFR 72.4 → 82.2 QA (+9.8, reader not named, self). Exabase MS 85.0 → 94.0 QA from k=10 to k=50 (Gemini 3 Flash reader and judge, self) | **+1.3 to +3** (MS +5 to +12); opt-in depth | low–medium | M (4–5) | M3 |
| **A8** Graph / multi-hop arm | MS, KU | Evidence is weak or negative (see A8) | **0 to +2** | low | spike M (2), full M+ | M4 (gated) |
| **A9** Token-budget recall and k per reader | all | Exabase QA +5.6 from k=10 to k=50 (Gemini 3 Flash, self). MemForge's own sweep shows the best context width differs by reader (QA; gpt-oss-120b, deepseek-v4-flash, Llama-3.3-70B; self) | **+1 to +5**, depending on the reader | medium | S–M (2–3) | M2 |

**Targets by category per milestone (gpt-4o-2024-08-06 reader, official judge).** These are planner-set targets, not predictions. The weighted totals match the overall targets.

| Category (n) | Today | M1 | M2 | M3 | Best same-reader reference |
|---|---:|---:|---:|---:|---|
| temporal-reasoning (133) | 56.4 | 65 | 75 | 82 | Mastra OM 85.7 |
| multi-session (133) | 59.4 | 64 | 72 | 78 | Mastra OM 79.7 |
| knowledge-update (78) | 76.9 | 80 | 84 | 87 | Mastra OM 85.9 |
| single-session-user (70) | 75.7 | 80 | 88 | 92 | Mastra OM 98.6 |
| single-session-preference (30) | 56.7 | 60 | 70 | 73 | Mastra OM 73.3 |
| single-session-assistant (56) | 96.4 | ≥ 95 | ≥ 95 | ≥ 95 | MemForge leads (OM 82.1) |
| **Overall** | **67.6** | **72–76** | **78–83** | **84–88** | Remis+Instruct 86.5 |

### A1. Reader-facing context assembly ("the reader protocol is a product feature")

*Evidence: RA-20 (U+R), RA-8 (C), RA-12 (U); LongMemEval paper; MemForge's own harness; post-graph-rag; Papr.*

- **What to build.** Add a `format=context` (alias `reader`) option to `/query` and `/resume`, and make it the default output of the MCP query tool. It returns one text block:
  - a first line, `Current date: <as_of>`;
  - results grouped by session or episode, **sorted by event date (oldest first)**, with duplicates removed;
  - a compact header on every item: memory id, event date (`occurred_at`, falling back to `time_start`), stored date, status (current / superseded by #id / expired / contested), epistemic status, and source (namespace; pool and trust for shared items);
  - then the passages (from `snippet_tokens` today, from chunks after A2);
  - an optional Chain-of-Note (CoN) scaffold (`notes=true`) that asks the reader to note what each item says about the question before answering, in a JSON shape;
  - a token budget (`budget_tokens`).
- **Why it matters beyond the benchmark.**
  - **G2.** Copilot, ChatGPT and Gemini readers know nothing about MemForge, so the context has to describe itself.
  - **G1.** The skill can teach one protocol: sort by date, work out elapsed time explicitly, prefer the current value, treat recalled text as data.
- **Evidence.**
  - Chain-of-Note: up to +10 points; the GPT-4o oracle rises from 87.0 to 92.4 QA (LongMemEval paper, independent).
  - MemForge's own harness: dates alone raised temporal-reasoning from 32.3 to 56.4 (QA, gpt-4o, self). That gain exists only in the harness today (RA-20).
  - Papr: 20 date-sorted sessions answered 7 more temporal questions than the top 5 (QA, Claude Opus 4.6 reader, self).
- **Expected gain.**
  - **LongMemEval-S:** +2 to +6 points, from sorting, Chain-of-Note, status and the question date. The harness already supplies dates.
  - **Production (Claude via MCP):** much larger on "when" and "which is current" questions, since the reader sees no dates today.
- **Acceptance.**
  - The harness switches to `format=context` with no loss on the dev split.
  - The temporal-reasoning (TR) and knowledge-update (KU) dev subsets improve with paired CIs that exclude 0.
  - An MCP snapshot test checks the header fields.
- **Effort:** M (3–4 sessions). **Scheduled in M1**, because it is the cheapest large lever.

### A2. Turn/chunk-level indexing with neighbour restore (the structural fix for RA-1 and RA-14)

*Evidence: RA-1 (P), RA-14 (C), RA-12 (U), PERF-8 (P), N-3; Redis Remis, the LongMemEval paper, Chain on Demand, SelRoute.*

- **Schema.** Add `warm_tier_chunks` in a new migration:
  - columns: `id`, `agent_id`, `namespace`, `warm_id` FK, `session_id`, `ordinal`, `char_start`, `char_end`, `occurred_at`, `referenced_dates` (A3), a generated `tsv` over the chunk text, `embedding halfvec(N)` and `embedding_model`;
  - store offsets into the parent row so text is not stored twice, or store the text if detoasting cost argues for it;
  - the warm row stays as the "episode" (one session) for provenance and whole-session questions.
- **Chunking.**
  - one user + assistant exchange per chunk when turn markers exist;
  - otherwise the RA-12 fallback order: `---`, then blank lines, then 2-sentence windows;
  - a hard cap of about 400 tokens for bge-small (512-token window); split long turns, since 10% are over ~700 tokens (N-3);
  - optionally merge adjacent small exchanges at topic-shift breakpoints (Remis style).
- **Retrieval.**
  - Run the keyword and semantic arms over chunks and fuse them with RRF.
  - Score each parent by its best chunk (max), optionally summing the top two.
  - Expand ±1 neighbouring chunk within the same session.
  - Group by session, sort by date and hand the result to A1.
  - Keep the parent-level arm at low RRF weight for whole-session questions.
- **Backfill.** A re-chunking worker on the dream-runs job model, or Phase 5.9 once SC-1 is fixed, processes existing warm rows in batches.
- **Evidence.**
  - Redis Remis: topic-shift chunks, 0.7·cos + 0.3·BM25 and neighbour expansion give 83.4% QA (gpt-4o, vendor), with no LLM at ingest. That is MemForge's own design point.
  - LongMemEval paper: rounds are a better value unit than sessions.
  - Chain on Demand: 86.6% with neighbourhood restore (reader not named; not comparable).
  - SelRoute: shows bge-small is enough at turn level (R@5 0.786 on LongMemEval-M; recall only).
- **Expected gain.**
  - **Accuracy:** +4 to +12 points.
  - **Context:** the reader context falls from 32,396 tokens (p50 today) to 8–16K.
  - **Risk:** MemForge's own sweep found that narrowing context helped gpt-oss (+8.8) but cost deepseek-v4-flash 2.4 points. The direction for gpt-4o is unmeasured, so A9 tunes the budget per reader.
- **Speed cost.**
  - **More embedding.** About 4.5× more tokens get embedded: on LongMemEval-S about 57M tokens, against about 13M today (N-3), so S6 has to land with A2.
  - **More rows.** Chunk rows are about 6× the number of warm rows, but each tsvector is small, which makes the lexical arm cheaper per row.
- **Acceptance.**
  - Dev-split QA rises with a paired CI that excludes 0.
  - Turn-level evidence recall (from `has_answer`) is reported.
  - LongMemEval-S ingest wall time stays ≤ 45 minutes (today's figure) while embedding every chunk.
- **Effort:** L (8–12 sessions).

### A3. Time-aware retrieval, end to end

*Evidence: RA-3 (C; fixed in M1), RA-4 (P), RA-8 (C); Mastra OM, post-graph-rag, the LongMemEval paper, TReMu, Mem0 (2026-10-20 temporal update), Hindsight TEMPR.*

- **At ingest: resolve relative dates.** A deterministic, LLM-free resolver turns "yesterday", "last Tuesday" and "two weeks ago" into `referenced_dates[]`, anchored on each chunk's `occurred_at`. Mastra OM's observations carry three dates: observation, referenced and relative.
- **At query: a temporal arm in RRF.**
  - When the query has a temporal constraint (resolved against `as_of`), rank chunks by how close their `occurred_at` or `referenced_dates` fall to the target window.
  - Fuse that ranking as a third arm. This mirrors Hindsight's four-way recall: semantic, BM25, graph and temporal.
- **Validity windows.** Supersession (A4 and RA-10) sets `valid_until` on the old fact, and A1 shows the window to the reader.
- **A deterministic date tool for readers.** Add an MCP tool (`memforge_date_math`: difference, ordering, "how many days between") so readers stop doing date arithmetic in their heads. TReMu's code-based date arithmetic lifted GPT-4o from 29.83 to 77.67 on temporal multiple-choice questions.
- **Optional query expansion.** LLM-based time-aware query expansion is an opt-in feature. In the LongMemEval paper it adds +6.8% to +11.3% temporal recall but needs a strong LLM.
- **Expected gain:** temporal reasoning +8 to +20 points in the category (target 75 at M2), or +2 to +5 points overall.
- **Acceptance:**
  - the TR dev subset improves;
  - a regression test with `occurred_at` a year before ingestion;
  - timeline sorts by event time.
- **Effort:** M (4–6 sessions).

### A4. Facts/events/preferences lane and fact-augmented keys

*Evidence: RA-14 (C; `key_facts` never indexed), RA-9 (P; hints dropped), SC-15 (U); Redis Remis+Instruct, the LongMemEval paper, Mem0 April 2026, and the pre-registered 2026-09-28 study.*

- **Extraction.**
  - *With an LLM (opt-in):* a single pass at consolidation with a small, pinned model. It only adds facts, never rewrites them, and links each new fact to any fact it supersedes (the design Mem0 adopted in April 2026).
  - *Without an LLM:* agent-supplied hints are honoured instead of being dropped (RA-9): `_hint_type='preference'`, `_hint_entities`, `_hint_importance`.
- **Storage.**
  - a `memory_facts` table with these columns:
    - `kind` (fact/event/preference);
    - `subject`;
    - `text`;
    - `occurred_at`;
    - `referenced_date`;
    - `valid_from`;
    - `valid_until`;
    - `superseded_by`;
    - `confidence`;
    - provenance (source session and chunk ids, extractor model);
  - facts are indexed in both arms as **extra keys that point to their parent chunks** (small-to-big retrieval).
- **Reader context.** Two blocks in A1: "Extracted memories", with status, followed by "Conversation excerpts".
- **What this enables.**
  - conflict detection over facts (RA-10);
  - the preference block (A5);
  - fact-level provenance and access control for G2.
- **Evidence.**
  - Remis+Instruct scores 86.5 against 83.4 for Remis alone, a gain of 3.1 (gpt-4o, vendor), at $0.0703 per session; Mastra OM costs $0.365 per session (Redis cost model).
  - Fact keys average +9.4% R@k and +5.4% QA (LongMemEval paper).
  - A pre-registered study (2026-09-28) found selected raw turns non-inferior to LLM extraction under tight budgets, at 3,061× lower write cost. So extraction stays **opt-in**, and the default no-LLM path must stand on A1–A3.
- **Expected gain:**
  - **with an LLM extractor:** +2 to +6 points over A2;
  - **from hints alone:** 0 to +2.
- **Cost reporting:** $/session in the Redis cost model (§4.1).
- **Effort:** L (6–10 sessions).

### A5. Resident preference block

*Evidence: Mastra OM, Hindsight, OpenAI Dreaming's preference-adherence axis (internal metric, not comparable).*

- **What it is.** A compact, prioritised block of preferences (high/medium/low), each with a date. The sleep cycle builds it from preference facts (A4) or hints, and caps it (for example at 300 tokens).
- **Where it appears.** At the top of `format=context` and in `/resume`.
- **Expected gain.** The single-session-preference category (30 questions) rises 8–17 points, toward 65–73. That is +0.5 to +1 point overall. It matters more for product personalisation and for longitudinal family P6.
- **Effort:** M (3–4 sessions).

### A6. Local cross-encoder, used when the context budget is tight

*Evidence: RA-5 (P); the pre-registered rerank study; Emergence; Papr; MemForge's own rerank measurement (+6.2 points for the gpt-oss reader at +11.5 s per query).*

- **What to build.** A cross-encoder running in-process via transformers.js, chosen by measured latency and quality. Candidates are bge-reranker-base and MiniLM cross-encoders.
- **When it runs.** Over the top 30–50 chunks, and only when the output is small: k_out ≤ 5 or a budget of ≤ 4K tokens.
- **What it replaces.** The listwise LLM rerank in the default path. The LLM rerank stays as an opt-in.
- **Expected gain.**
  - **At lean budgets:** +1 to +4 points.
  - **At generous budgets:** about 0 (+1.1 in the study).
  - **Why build it anyway.** It is what makes the lean profile (≤ 4K tokens, §3) viable without losing accuracy.
- **Latency target:** ≤ 150 ms p50 added for 30 chunks on CPU, to be measured.
- **Effort:** M (3–4 sessions).

### A7. Query decomposition and sufficiency

*Evidence: RA-2 (C; the deterministic part is fixed in M1); BFR; Exabase; Mastra OM's MS 79.7.*

- **Opt-in `depth=deep` for aggregation questions** ("how many", "total", "list all", "in what order"):
  - a small LLM lists the facts the question needs;
  - retrieval repeats until each fact is covered or the budget runs out;
  - the coverage is returned to the reader.
- **Expected gain.** Multi-session +5 to +12 in the category, or +1.3 to +3 points overall.
- **Cost.** One to three extra LLM calls, only on deep queries. Report them separately in the latency tables.
- **Effort:** M (4–5 sessions).

### A8. Graph / multi-hop arm: gated, deferred to M4

*Evidence: RA-21 (U+R) and the A8 re-check: the knowledge graph is populated only when an LLM summary exists (`memory-manager.ts:1705-1749`), so the default concat mode leaves it empty.*

- **Evidence against prioritising it:**
  - Zep's temporal knowledge graph scores 71.2% QA with gpt-4o; Remis, with no graph, scores 83.4%.
  - Mem0 dropped its separate graph databases in its April 2026 v2.
  - Two October 2026 controlled studies (Zhou et al., Bao et al.) found that raw-history RAG matches or beats explicit-memory systems.
  - Multi-hop FactConsolidation tops out at ≤ 28% for every system in MemoryAgentBench.
- **Gate:** once A4 produces entities on facts, spike an entity arm in RRF. This is Hindsight's four-way design, but Hindsight publishes no ablation for it. Keep the arm only if it moves MS or KU by ≥ 2 points, with a CI that excludes 0, on LongMemEval-M or BEAM-1M.
- **Effort:** spike M (2 sessions).

### A9. Token-budget recall and per-reader profiles

*Evidence: Exabase k sweep; MemForge's configuration-sensitivity table; Hindsight's token-budget recall; KITE 86.0% at ~1.6K reader tokens (reader not named).*

- **What to build.** A `budget_tokens` parameter and three named profiles:
  - **lean:** ≤ 4K tokens;
  - **standard:** ≤ 12K tokens;
  - **max:** ≤ 32K tokens.
- **Defaults.** Each pinned reader gets a recommended default, measured on the dev split. The skill (G1) uses the profile measured for Claude.
- **Effort:** S–M (2–3 sessions).

---

## 3. Speed and scale roadmap

### 3.1 Where speed stands

**Measured (MemForge, self):**
- Hybrid query: p50 43–46 ms, p95 99 ms, at about 50 warm rows per agent (LongMemEval corpus: about 24K rows across 500 agents).
- Ingest: 6.4 s per question for 50 serial `add()` calls. This excludes consolidation (PERF-8 verifier).
- Full LongMemEval-S corpus ingest: about 45 minutes.
- Reader context: 32,396 tokens p50.

**Estimated only (audit, unmeasured):**
- Hybrid at 100K rows: 0.5–1 s.
- Hybrid at 1M rows: 5–10 s.
- 10M rows per agent: not viable without partitioning.
- Sleep Phase 1 at 1M rows: tens of minutes (PERF-6).

**Competitor speed claims.** None of these is comparable without the corpus size, so read them as reference points only.

| System | Figure | What is measured | Corpus | Source, date |
|---|---|---|---|---|
| Zep | retrieval p50 104 ms / p95 162 ms; median context 4,408 tokens | server retrieval | not stated | Zep research page, modified 2026-09-29 (self) |
| Zep (paper) | 2.58 s vs 28.9 s with full context; 1.6K vs 115K tokens | end-to-end answer, gpt-4o | LongMemEval-S | arXiv 2501.13956, 2025-01-20 (self) |
| Mem0 | p50 1.09 s at 6.8K tokens per query | scope not stated | LongMemEval | Mem0, April 2026 algorithm (self) |
| Mem0 (paper) | search p95 0.200 s; total p95 1.440 s | search / end to end | LoCoMo | 2025-04-28 (self) |
| Supermemory | search 187 ms server / 356 ms end to end | percentile not stated | not stated | homepage, fetched 2026-10-30 (self) |
| Hindsight Memlake | < 100 ms p99 at 100M memories | vendor claim, Rust engine on object storage | 100M | vendor. Hindsight also says Postgres suits banks under ~50K memories |

**What "competitive" means.**
- **Retrieval:** match Zep's published retrieval latency (p50 ≈ 100 ms, p95 ≈ 160 ms) at **1M rows per agent**, and keep the small-corpus p50 under 60 ms.
- **End to end:** reader input tokens dominate answer latency for the user (Zep: 2.58 s vs 28.9 s with full context). Cutting context from 32K to ≤ 8K tokens (A2, A6, A9) is therefore the biggest end-to-end speed lever MemForge has.

### 3.2 Targets

Hardware is pinned per fixture in §4.5. These are planner-set targets, to be revised once M0 produces real measurements.

| Metric | Today | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|
| Hybrid server p50/p95, F-S (~50 rows per agent) | 43 / 99 ms | ≤ 50 / ≤ 120 | ≤ 50 / ≤ 120 | ≤ 50 / ≤ 120 | hold |
| Hybrid p50/p95, F-100K (1 agent) | unmeasured (est. 0.5–1 s) | measured; p95 ≤ 300 ms | ≤ 60 / ≤ 150 ms | ≤ 50 / ≤ 120 | hold |
| Hybrid p50/p95, F-1M (1 agent) | unmeasured (est. 5–10 s) | measured | ≤ 150 / ≤ 400 ms | ≤ 100 / ≤ 250 | hold |
| Hybrid p50/p95, F-10M (one shared space, partitioned) | not viable | — | — | measured | ≤ 250 / ≤ 600 ms |
| Department fixture (F-Dept), read p95 under mixed load | — | — | — | measured | ≤ 300 ms; small-tenant p95 ≤ 1.2× its isolated figure; 0 pool waits > 1 s; errors < 0.1% |
| `add()` acknowledgement p95 | unmeasured | measured | ≤ 40 ms | ≤ 30 ms | ≤ 40 ms under F-Dept load |
| Freshness: time until an added event is searchable | never, without a manual consolidate (RA-18) | — | lexical ≤ 2 s p95; semantic ≤ 15 s p95 | same | ≤ 5 s / ≤ 30 s under load |
| Consolidate + embed throughput (local bge-small, 8 vCPU) | unmeasured | measured | ≥ 150 chunks/s | ≥ 400 chunks/s | scales with workers |
| Full LongMemEval-S ingest | ~45 min (embeds 512 tokens per session) | — | ≤ 45 min while embedding every chunk (~4.5× more tokens) | ≤ 20 min | — |
| Median reader context, default profile | 32,396 tokens | hold | ≤ 12K | ≤ 8K (lean ≤ 4K) | hold |
| Connections per hybrid query | 4–6 (PERF-19) | ≤ 3 | ≤ 2 | 1–2 | 1–2 |
| SQL-only sleep, 100K-row agent | unmeasured | measured | ≤ 60 s | ≤ 30 s | — |
| SQL-only sleep, 1M-row agent | unmeasured (est. tens of minutes) | — | measured | ≤ 5 min | ≤ 5 min |

### 3.3 Work items

| Item | What | Evidence | Effort | Milestone |
|---|---|---|---|---|
| **S1** Scale harness | Synthetic generator and fixtures F-100K, F-1M, F-10M and F-Dept (§4.5); per-commit results; nightly regression gate at > 25% p95 regression. Defined here and run by stability CI-5. | PERF-20 (U) | M (4–6) | M0–M1 |
| **S2** Semantic arm on HNSW | The PERF-2 fix (§1.4), plus HNSW on `warm_tier_chunks` (A2) rather than on whole rows; `ef_search` tied to the candidate count; iterative scan; filtered-recall test. | PERF-2 (P), RA-16 (P) | M (3–4) | M1–M2 |
| **S3** Lexical arm | The PERF-3 fix: AND first, then OR; normalised rank; `btree_gin` on (agent_id, tsv); chunk-level tsvectors. Evaluate a BM25 extension only after checking its licence and its availability on managed Postgres. | PERF-3 (P), RA-13 (U) | M (3–4) | M1–M2 |
| **S4** One-statement hybrid | Both arms as CTEs, fused with RRF in SQL, on one connection; detached writes folded into one statement. | PERF-19 (U), PERF-5 (C) | M (3–4) | M2 |
| **S5** Bounded fallbacks and cache | Trigram fallback with a timeout or bounded scope (PERF-4); version-counter cache keys (PERF-9); `registerAgent` LRU (PERF-12); index housekeeping (PERF-13); the COALESCE expression index (PERF-1 note). | PERF-4/9 (P), PERF-12/13 (U) | M (3–4) | M1–M2 |
| **S6** Ingest pipeline | Embed outside the transaction (TT-2). True batching: pass arrays to the transformers.js pipeline and call `embedBatch` once per batch. Run the local model in `worker_threads`. Write-behind embedding through a LISTEN/NOTIFY worker on the dream-runs job model, so ingest is bound by the DB, not the model. Threshold-triggered asynchronous consolidation, plus a low-weight lexical arm over the hot tier for freshness. | PERF-8 (P), PERF-7 (P), PERF-23 (U), RA-18 (U), SR-14 (U) | L (6–9) | M2 |
| **S7** Sleep-cycle cost | Move volatile scores into a narrow `warm_tier_scores` table, or skip rows whose score changed by less than a threshold. Make Phase 1 incremental (only rows touched since the last cycle). Add a GIN index on `reflections.source_warm_ids`. Record per-phase row counts as service-level objectives. | PERF-6 (P), SC-14 (U) | L (5–8) | M3 |
| **S8** Reader-side cost | Profiles from A9; report context tokens, end-to-end latency with each named reader, and $/question in every benchmark table. | Zep 2.58 s vs 28.9 s; Redis cost model | S (1–2) | M1 onward |
| **S9** Department instance | See §3.4. | PERF-2/3/6/10/19, RA-16, SC-4/PERF-18 | L (10–15) | M4 |

### 3.4 Department instance (multi-tenant): the speed design

Identity, authorisation and knowledge spaces belong to the G2 plan. This section covers only what makes a shared instance fast and keeps tenants out of each other's latency.

- **Partitioning.**
  - Hash-partition `warm_tier`, `warm_tier_chunks` and `memory_facts` by tenant key: `agent_id` today, the knowledge-space id in G2. Use 16–64 partitions, each with its own HNSW and GIN indexes, so a small tenant's query never touches a large tenant's posting lists or graph.
  - Give large shared spaces (≥ 1M chunks) their own partition, or a partial index.
  - This also prepares RLS for G2 (ARCH-6, SEC-2: work to do in the G2 plan).
- **Worker tier.**
  - Consolidation, embedding, re-chunking and sleep run in a separate worker process, built on the existing dream-runs job model (SKIP LOCKED claiming, LISTEN/NOTIFY).
  - API replicas only acknowledge writes and serve reads.
  - The cross-instance sleep lock is the advisory lock from stability TT-4.
- **Connections.**
  - One-statement hybrid queries (S4), `DB_POOL_MAX` 20–30, and PgBouncer in transaction mode. `SET LOCAL` settings (`ef_search`, tenant context) survive transaction pooling; session-level settings do not.
- **Caching.** Per-tenant version counters. In G2, cache keys must also include the caller's access scope.
- **Sleep scheduling.**
  - Per-tenant cadence with incremental Phase 1 (S7). The budget to meet: every tenant cycled daily within a 6-hour window on the F-Dept fixture.
- **10M chunks in one space.** HNSW over 10M `halfvec(384)` vectors is about 7.7 GB of vector data plus graph overhead, which fits in memory on a 64 GB database host. The lexical arm needs the AND-first path, with OR only as a fallback. Do not attempt this on the unpartitioned default schema.

---

## 4. Measurement plan

### 4.1 Reporting rules (how to stay honest)

1. **Label every number** with:
   - its metric type (QA / R@k / CER / latency / cost);
   - the dataset and version (LongMemEval-S *cleaned* 2025-09 release, which the harness already downloads);
   - the exact reader snapshot;
   - the exact judge snapshot and prompt set;
   - the profile and k/budget;
   - the commit and date;
   - who ran it (self or independent).
2. **Report two judges until the legacy one is retired:**
   - official LongMemEval per-type prompts on gpt-4o-2024-08-06 (primary);
   - the legacy MemForge prompt (for continuity);
   - the number of questions where they disagree.

   Re-judge twice and report how many labels flip. MemStrata measured about 3 flips per 500, and found that source-aware versus reference-aware grading moves LongMemEval by 2.4 points.
3. **Keep a strict dev/test split.**
   - Tune on the fixed 100-question dev subset and on LongMemEval-M samples.
   - Run all 500 questions only at milestones.
   - Never tune prompts on the reported set. Papr tuned its prompts on half the questions; say so when citing it.
4. **Use paired statistics.**
   - Report paired bootstrap 95% CIs and McNemar's p against the previous milestone.
   - A single 500-question run at 70% has a 95% CI of about ±4.0 points. Headline moves under 2 points are noise unless the paired test says otherwise.
5. **The headline is the shipped default.**
   - Tuned configurations go in a separately labelled table, as `OFFICIAL-RESULTS.md` already does.
   - Also publish the "shipped default ingest" run (M0).
   - Until S6 changes the batch-size default (M2, RT-4), every milestone reports the documented benchmarked setting (`CONSOLIDATION_INNER_BATCH_SIZE=1`) and the shipped default side by side, with neither hidden (§1.2).
6. **Report cost and context tokens with every accuracy number.**
   - Use Redis's cost model: ingest $/session + 5.13 × query $/question.
   - For reference, MemForge's 500-question gpt-4o run costs about $35–40 including the judge, which is about $0.07–0.08 per question.
7. **Publish the evidence.** Publish run manifests, raw answers and judge outputs under `benchmarks/results/`, so anyone can re-judge them.
8. **Never compare across metrics or readers.**
   - Never put MemForge recall beside anyone's QA. MemPalace and Supermemory both did; MemForge's own April Show HN headline used R@5.
   - Never mix readers in one column.
   - Mark competitor numbers as self-reported or as reproduced by a competitor.
9. **Measure the product path.** After A1, the harness must consume `format=context` rather than inject its own dates.
10. **Publish negative results,** especially longitudinal ones.

### 4.2 LongMemEval-S and LongMemEval-M

**Readers (fixed and named).** Record the exact model ID in every manifest. Never use an alias.

| Reader | Model | Why |
|---|---|---|
| **R1** | `gpt-4o-2024-08-06` | Comparability with Table 1 (Redis, Mastra and the paper). Zep used `gpt-4o-2024-11-20`, so note the difference when citing it. |
| **R2** | One pinned current Claude model | It is the production reader for G1. |
| **R3** | One pinned open-weights reader (`gpt-oss-120b`, already used in the repo's sensitivity table) | Cheap dev-split runs on every PR that touches retrieval. |

**Judge.** `gpt-4o-2024-08-06` with the official per-type prompts.

**What each run reports:**
- QA by category;
- R@k and CER at session level, plus **turn-level evidence recall** (from `has_answer`);
- context tokens p50/p95;
- query latency;
- $/question.

Use the profiles default, lean and max (A9).

**Cadence:**
- **R3** on the dev split for every retrieval PR.
- **R1** on all 500 questions at every milestone, about $35–40 per run.
- **R2** on all 500 questions at M1, M2 and M3.

**LongMemEval-M** has about 500 sessions per question, about 10× the tokens of S.
- **M2:** retrieval-only first run, after S6 makes ingest affordable.
- **M3:** QA with R1. Target: ≥ 72% (QA, R1).

The like-for-like reference is the LongMemEval paper's best gpt-4o configuration: 72.0% at top-10 with round values and fact keys (independent). MemStrata's 85.4% used a Qwen reader with reference-only grading, so it is not comparable. Few systems report M, and that is an opening.

### 4.3 BEAM

**The benchmark.** 2,000 questions over 100 conversations, at 100K, 500K, 1M and 10M tokens. Its licence has not been checked; check it before redistributing anything.

**Run plan.** Use one pinned reader for all BEAM runs, recorded in the manifest.
- **M2:** BEAM-100K and 1M as a baseline, with no target.
- **M3:** BEAM-1M ≥ 70%.
- **M4:** BEAM-10M ≥ 62%, after partitioning (S9).

**Reference points.** These are QA accuracy figures, all self-reported. Readers differ, so they are not comparable unless the reader matches.
- **BEAM-10M:**
  - Exabase 68.0% (Gemini 3 Flash);
  - Mastra OM 66.4% (Opus 5.5 answerer, Gemini 3 Flash judge);
  - Hindsight 64.1%;
  - Mem0 48.6%;
  - Honcho 40.6%.
- **BEAM-1M:** Mastra 80.6%, Exabase 75.0%, Hindsight 73.9%, Mem0 64.1%.
- The readers for Hindsight and Mem0 are not stated.

Where MemForge's reader matches a competitor's, report the head-to-head. Otherwise list the results with a reader column and no ranking.

### 4.4 The longitudinal benchmark: proving "memory improves over time" (SC-12)

**Why build it.**
- The July plan named this benchmark (WB-04/WB-05) as MemForge's claim to make, and it is still unmeasured (SC-12 C).
- No vendor publishes a sleep-on versus sleep-off delta on a standard benchmark. That covers Anthropic Dreams, Mem0 Dream, Supermemory Dynamic Dreaming and MIRIX-2.0 AutoDream.
- OpenAI reports internal version-to-version gains for Dreaming: factual recall 41.5% to 82.8%. That metric is internal, not an on/off ablation, and not comparable.
- Continual-ARC (2026-11-10) found that harness-level persistence generally does not improve memorization.
- Tononi and Haber (2026-11-01) offer only a prediction.

A reproducible positive delta would stand out. An honest negative one would still be useful.

**Fix these before the result counts.** Otherwise the benchmark measures known bugs.
- SC-1 (phases re-arm; TT-3);
- SC-24 (SQL-only sleep);
- RA-11 and SC-15 (feedback and implicit evidence);
- RA-10/SC-2 (conflict detection);
- SC-6 (confidence);
- SC-7 (deprecation actually forgets);
- SC-8 (revision guards and **shadow mode**);
- SC-12 item 5 (provider-reported token usage);
- RA-8 (status surfaced).

**Run a baseline on today's code first,** and publish the before state.

**Three tracks:**

#### L1: public data, streamed (M1–M2; third-party first, as the benchmarks card recommends)

- **L1a: streamed LongMemEval-S.**
  - Ingest each question's haystack in date order, in 5 epochs.
  - Consolidate after each epoch, and run a sleep cycle between epochs (arms below).
  - Answer at the end with the §4.2 protocol.
  - This is a "do no harm" test: end-state QA should not fall.
- **L1b: MemoryAgentBench.** The test-time-learning and selective-forgetting splits (FactConsolidation, single-hop and multi-hop), with sleep on and off. The field ceiling is ≤ 28% on multi-hop FactConsolidation; Zep averages 5.0 and Mem0 10.0 on selective forgetting.
- **L1c: Supersede environment.** Knowledge-update accuracy as the conversation grows up to 24×, with sleep on and off. For reference, gpt-5.4 drops from 92% with full context to 77% with bounded self-maintained memory.

#### L2: synthetic world with a ground-truth timeline (v0 at M2, v1 at M3)

**The world.**
- 20 personas (30 in v1), each simulated over 12 months, with about 60 evolving attributes: home, job, pets, projects, tools, preferences, relationships, recurring activities and procedures.
- Events are scheduled per persona:
  - updates ("moved to Denver");
  - retractions ("forget that I mentioned X");
  - second-hand contradictions (a colleague claims X; the user later corrects it);
  - recurring countable events;
  - preferences shown only implicitly;
  - procedures that succeed or fail.

**Sessions.**
- About 8 sessions per month per persona (about 1,900–2,900 sessions in total), each 6–20 turns, with about 70% distractor chatter.
- The text is rendered from event scripts by a pinned generator model with fixed seeds.
- A template-only rendering acts as a control, to show the generator is not leaking answers.
- The world is synthetic and MIT-licensed, so the whole thing can be published.

**Checkpoints:** the end of months 1, 2, 3, 6, 9 and 12. Each checkpoint asks about 30 probes per persona, generated from the world state at that moment.

**Probe families.** For each family: what it tests, how it is scored, and what sleep should improve.

| Family | Example | Scoring | What sleep should improve |
|---|---|---|---|
| **P1** Current value (knowledge update) | "Where do I live now?" | Exact match; stale-answer rate | Supersession and conflict demotion |
| **P2** As-of history | "Where did I live in March?" | Exact match | Supersession keeps history (no deletion) |
| **P3** Contradiction | Conflicting sources | Rubric; contested-marking precision and recall | Conflict detection and resolution |
| **P4** Forgetting | After "forget X" or a namespace deprecation | Abstention required; **leak rate** in top-k and in the answer | Eviction and deprecation |
| **P5** Aggregation | "How many gym visits in Q2?" | Exact number | Reflection and abstraction |
| **P6** Preference adherence | Recommendation probes | Rubric over the known preferences (an OpenAI-style axis) | Preference block and promotion |
| **P7** Temporal order / elapsed time | "What came first?" | Exact match | Validity windows, timeline |
| **P8** Stable facts (**no-regression control**) | Facts stated once and never changed | Exact match | Must **not** degrade. Catches revision damage of the kind ACE documented: a monolithic rewrite collapsed a context from 18,282 to 122 tokens, and accuracy fell from 66.7 to 57.1 |
| **P9** Procedure reuse (optional) | "How do we deploy X?" | Rubric: latest successful procedure | Procedure evolution |

Most families are scored by deterministic exact match. An LLM judge is used only for P3, P6 and P9.

**Arms.** The arms have names, not letters, so they are not confused with levers A1–A9. Retrieval configuration, readers (R3 for the full grid; R1 on the final checkpoint of the no-maintenance and full-sleep arms), embedding model, revision model (pinned and cheap) and 3 seeds are held fixed across all arms.
- **No-maintenance:** consolidate only. This is the raw-history-RAG control, which the October 2026 studies showed to be a strong baseline.
- **SQL-only sleep** (after SC-24).
- **Full sleep:** LLM phases on, revisions applied.
- **Shadow:** full sleep in **shadow mode**: revisions are recorded but not adopted, as Anthropic Dreams writes to a separate output store. This isolates the effect of adoption.
- **Feedback:** full sleep plus a simulated agent that sends feedback through `retrieval_id`. This tests the reinforcement loop.
- **Dreams delegation** (later): only if a delegation layer is rebuilt on the documented API (SC-3); NEXT-ITERATION-PLAN removes the current one in RT-1.
- **Knock-outs** on a subset: full sleep minus one of conflict detection, revision, reflection, eviction, temporal validation, or epistemic promotion, one at a time, to attribute the deltas.
- **Cadence variants:** sleep after every 8 sessions (the default) and after every 2.

**Metrics** for each checkpoint and arm:
- QA per family;
- lineage-aware evidence recall at k (gold = source session ids, followed through `superseded_by` and `source_hot_ids`);
- stale-answer rate;
- forgetting leak rate;
- contested-marking precision and recall;
- stable-fact retention;
- context tokens per answer;
- query p50;
- store size;
- sleep cost (provider-reported tokens, $, wall time).

**Pre-registered endpoints.**

| Endpoint | Definition | Pass |
|---|---|---|
| Primary | ΔAUC of mean QA over P1–P7, months 3–12, full-sleep arm minus no-maintenance arm | Paired bootstrap over probes × seeds, 95% CI excludes 0 |
| Co-primary | P8 accuracy, full sleep vs no-maintenance | Non-inferior: full sleep ≥ no-maintenance − 1.0 point |
| Secondary | Per-family deltas | Reported per family |
| Secondary | Accuracy vs query-time tokens (Pareto) | Same accuracy at fewer query tokens counts as an improvement (Letta's sleep-time-compute framing: about 5× less test-time compute on stateful GSM/AIME variants) |
| Secondary | Cost per point gained | Reported |

**Budget.** The v1 grid is 20 personas × 30 probes × 6 checkpoints × 5 arms × 3 seeds, about 54K reader calls. At the lean profile that is about 220M input tokens.
- Run the full grid with R3.
- Use R1 only on final checkpoints. At the repo's observed gpt-4o cost of about $2.2–2.5 per million tokens (derived from the $35–40 per 32K-token × 500-question run), the full grid on R1 would cost about $500.

**Release.** Publish:
- the generator, seeds, data, harness and results;
- adapters for at least two other systems at release (for example Mem0 OSS and the Anthropic memory tool), released with the pre-registered protocol by RT-3, plus an invitation to add more (Mem0 Dream, Letta's sleep-time agents, Anthropic Dreams through its documented API). Benchmark ownership is then the asset whatever MemForge's own delta turns out to be.

Owning an open longitudinal benchmark is a competitive lever: Mem0 launched DolphinBench and Hindsight runs its own leaderboard site.

#### L3: in-product telemetry (M3 onward; SC-12 items 1–3)

- A per-agent held-out probe set, generated automatically from the facts lane (A4): questions paired with their expected ids.
- R@k on that probe set before and after every cycle, stored in a `sleep_quality` table.
- Outcomes per revision: was the revised row retrieved afterwards, and did a later cycle revert it?
- Export these as metrics, so an operator can see whether sleep helps *their* agent. No content leaves the instance.

**Longitudinal targets.**

| Milestone | Target |
|---|---|
| **M1** | L1a protocol pre-registered, built and run on today's code. Publish whatever it shows as a labelled pre-repair baseline that does not count toward D1; a delta near 0 or negative is expected. By RT-3, pre-register the L2 protocol and release the harness with adapters for at least two other systems. |
| **M2** | L1a–c plus L2 v0 (10 personas, 6 months). Do-no-harm: the SQL-only-sleep and full-sleep arms ≥ the no-maintenance arm on every family within the CI. P1 stale-answer rate −30% relative to the no-maintenance arm (D1's first public endpoint). |
| **M3** | L2 v1. Primary endpoint ΔAUC ≥ +3 points with a CI that excludes 0. P8 non-inferior. P4 leak rate ≤ 2%. Publish. |

**If M3 is negative,** publish it anyway, and narrow the claim to what the data supports. One example: "sleep keeps memory bounded and current at lower query cost".

**Effort:** L1 M (4–6 sessions); L2 L (10–15 sessions); L3 M (4–6 sessions).

### 4.5 Latency, throughput and cost

**Fixtures.** All synthetic, with realistic length distributions: session median ~14K characters, turn median ~550 characters (N-3).

| Fixture | Shape | Cadence |
|---|---|---|
| **F-S** | The LongMemEval-S corpus (continuity with published numbers) | Nightly |
| **F-100K** | 1 agent, 100K warm rows (about 600K chunks after A2) | Nightly |
| **F-1M** | 1 agent, 1M rows | Weekly |
| **F-10M** | One shared space with 10M chunks (partitioned schema only) | Milestones |
| **F-Dept** | 1,000 agents, Zipf-distributed, 20M chunks in total, 10 shared spaces of about 1M each; 50 read QPS and 20 write events/s; sleep on 5% of agents per hour; 2 API replicas and 1 worker | Milestones |

**Workload mix:**
- 60% hybrid;
- 20% keyword;
- 10% time-filtered;
- 10% compound queries.

Step read QPS from 1 to 100, with concurrent writes and sleep running. Test with Redis both on and off.

**What each run reports:**
- p50/p95/p99 per mode, both server-side and client end-to-end;
- pool waits and errors;
- ingest rows/s and freshness lag;
- sleep duration per phase;
- database size and bloat;
- CPU-seconds per 1K queries and per 1K ingested events;
- reader context tokens and end-to-end answer latency with R1 and R2.

**Hardware.** Pin the spec, for example 8 vCPU / 32 GB for the API and 16 vCPU / 64 GB for Postgres 16 with pgvector 0.8.x. Record it in every manifest.

**Gate.** Fail the nightly run on a p95 regression of more than 25% (PERF-20).

### 4.6 Shared harnesses and leaderboards

- **Supermemory memorybench (MIT), at M2: uncommitted.** NEXT-ITERATION-PLAN keeps one second harness, the Redis-style gpt-4o run, and cuts this one unless capacity allows.
  - Write a MemForge provider adapter: LoCoMo, LongMemEval and ConvoMem, with gpt-4o as the default answerer.
  - Report the triple: accuracy, p50/p95 latency, context tokens.
- **A Redis-style gpt-4o run, at M3.** Offer Redis's harness an adapter so that MemForge has an *independent* reproduction.
- **LongMemEval-V2 Small, at M4.**
  - The authors are UCLA. The benchmark is 451 questions over web-agent trajectories of up to 115M tokens. Its leaderboard ranks by LAFS (accuracy against latency) and had no entries as of 2026-11-16.
  - A first-mover entry is cheap credibility, if S6/S9 make the ingest affordable.
- **Optional:**
  - DolphinBench (owned by Mem0; tasks, with cost and latency mandatory). Its Claude Code + Sonnet 5 results matter for G1.
  - agentmemorybenchmark.ai (run by Hindsight).
  - Both are owned by competitors, so state that whenever citing them.
- **For G2:** CrossLearnBench/MixUA, the first multi-user shared-memory benchmark with privacy probes (2026-11-07). That one belongs to the G2 plan.

### 4.7 Targets by milestone (all benchmarks)

| Benchmark (metric · reader) | M0 | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|
| LongMemEval-S QA · R1 (official judge) | re-baseline (both judges) | 72–76% | 78–83% | 84–88% | hold |
| LongMemEval-S QA · R2 (pinned Claude) | baseline | +4 to +8 points vs M0 | ≥ 88% | ≥ 92% | hold |
| LongMemEval-S lean profile (≤ 4K tokens) QA · R1 | — | — | ≥ 74% | ≥ 80% | hold |
| LongMemEval-S turn-level evidence recall@10 | baseline | — | ≥ 90% | ≥ 93% | hold |
| LongMemEval-M | — | — | retrieval baseline | QA ≥ 72% (R1) | — |
| BEAM (one pinned reader) | — | — | 100K / 1M baseline | 1M ≥ 70% | 10M ≥ 62% |
| Longitudinal L1/L2 | — | L1a pre-repair baseline (does not count toward D1) | do-no-harm; P1 stale −30% | primary ΔAUC ≥ +3, CI excludes 0 | extend to G2 scopes |
| memorybench (accuracy, p50/p95, tokens; uncommitted) | — | — | first submission | refreshed | — |
| Scale (§3.2) | F-100K measured | 100K p95 ≤ 300 ms | 100K ≤ 150 ms; 1M ≤ 400 ms | 1M ≤ 250 ms | F-Dept p95 ≤ 300 ms |
| Cost | $/question published | $/session (Redis model) | + sleep $/agent-month | same | same |

The R2 and lean-profile targets are planner estimates. The same-reader references are Mastra OM at 94.87% with gpt-5-mini and Papr at 96.0% with Opus 4.6. MemForge should not claim to "beat" anyone across different readers.

---

## 5. What not to do, and why

1. **Do not chase LongMemEval-S with a stronger reader or prompts tuned on the test set.**
   - **Why:** S is saturated for strong readers; label errors cap it near 96% (Exabase).
   - **Instead:** headline the gpt-4o comparison and the shipped default, and tune on the dev split.
2. **Do not put recall beside QA,** or compare across readers or judges in one column.
   - **Why:** this is the field's most common credibility failure (MemPalace's "perfect 500/500" was recall_any@5; Supermemory sets Recall@20 beside others' QA), and MemForge's own April headline used R@5.
   - **Instead:** MemForge's July relabelling is a real asset. Protect it.
3. **Do not make LLM extraction the default ingest path.**
   - **Why:** Mastra OM costs $0.365 per session against $0.0703 for Remis+Instruct. Raw turns were non-inferior at 3,061× lower write cost (pre-registered study). Explicit memory construction can take hours per conversation (Zhou et al.).
   - **Instead:** the no-LLM path (A1–A3) must stand on its own. A4 stays opt-in.
4. **Do not add a graph database, or headline graph retrieval.**
   - **Why:** CLAUDE.md requires pure Postgres. The evidence on LongMemEval is negative: Zep 71.2% vs Remis 83.4% (gpt-4o), and Mem0 dropped graph databases.
   - **Instead:** in default concat mode the graph is empty anyway. Gate A8 on measured gains.
5. **Do not let sleep rewrite content in place before the longitudinal harness exists.**
   - **Why:** revisions can merge falsely or drop facts with no grounding check (SC-8), and ACE showed monolithic rewrites collapse context (accuracy 66.7 → 57.1).
   - **Instead:** run the shadow arm and review before adopting, as Anthropic Dreams does.
6. **Do not put the LLM reranker in the default path.**
   - **Why:** it adds about 11.5 s per query and +1.1 points at generous budgets.
   - **Instead:** use the local cross-encoder (A6), and only when the budget is tight.
7. **Do not tune fusion weights, boosts or k on the reported set,** and do not change `HYBRID_SEMANTIC_WEIGHT` without a dev-split measurement.
   - **Why:** the code comment already records that the 1.5 weight was fitted against a broken lexical arm.
8. **Do not trust the audit's latency estimates.**
   - **Instead:** measure first (PERF-20).
   - Do not claim "HNSW" anywhere until EXPLAIN shows the index in use (PERF-2).
9. **Do not swap the default embedding model before chunking.**
   - **Why:** bge-small is adequate at turn level (SelRoute). A bigger model cuts ingest throughput and treats the symptom, which is whole-row embedding.
10. **Do not build query-time agent loops into the default query.**
    - **Why:** the default path has to stay in the tens-of-milliseconds class.
    - **Instead:** keep A7 behind `depth=deep`, and report its latency separately.
11. **Do not publish an "improves over time" claim from a custom suite alone,** or from activity metrics.
    - **Why:** `sleep_phase_analytics` measures activity, not quality (SC-12).
    - **Instead:** pair L2 with third-party L1 data, and publish negative results.
12. **Do not run BEAM-10M or the department fixture on the unpartitioned default schema.**
    - **Why:** the result would measure a known limitation (PERF-2/3/6), not the design.
13. **Do not change the judge silently.**
    - **Instead:** report both judges until the legacy one is retired (N-1).
14. **Do not use a Dreams-delegation arm** unless a delegation layer is rebuilt on the documented Memory Stores API (SC-3); the current one is removed in RT-1.

---

## 6. Sequencing, dependencies and risks

**Order of work:**
1. M0 measurement fixes.
2. RA-2, RA-3, RA-1/RA-14 stopgaps, A1, then the RA-8 surfacing.
3. PERF-2 and PERF-3, then the remaining items in §1.
4. A2 together with S6; A3; A5.
5. The A4 facts lane; then A6 and A7.
6. S7 and S9.

The longitudinal track runs in parallel from M1, and its prerequisites gate when its results can be published.

**Dependencies on the stability plan:**
- **TT-1** (floating promises: PERF-5, SR-1);
- **TT-2** (provider timeouts and moving calls out of transactions: PERF-7, SR-10);
- **TT-3** (phase re-arm: SC-1);
- **TT-4** (cross-instance sleep lock);
- **TT-8** (install: PERF-1);
- **TT-14** (a migration runner, needed before the chunk and fact tables ship);
- **CI-5** (the nightly scale run uses §4.5's fixtures).

**Dependencies on the G1 skill:**
- it should teach the A1 reader protocol: sort by date, compute elapsed time, Chain-of-Note, prefer current, treat recall as data;
- it should use `retrieval_id` for feedback (RA-11);
- until S6 lands, it must say that nothing becomes searchable before a consolidate (RA-18).

**Dependencies on the G2 plan:**
- S9 partitioning and the RA-15 pool arm are the speed and accuracy base for knowledge spaces;
- per-scope evaluation uses CrossLearnBench.

**Risks:**
- **Category gains from A2 depend on the reader.** MemForge's own sweep found that narrowing context moved scores in opposite directions for different readers. *Mitigation:* per-reader profiles (A9), and dev-split gates before defaults change.
- **The re-judge moves the baseline.** *Mitigation:* targets are stated as deltas from M0 if the move is larger than 2 points.
- **The R1 snapshot (gpt-4o-2024-08-06) is retired from the API.** *Mitigation:* freeze R1 as historical, keep comparisons to runs already made, and continue with R2 and R3.
- **Chunking adds ingest compute** (about 4.5× more embedded tokens). *Mitigation:* S6 lands in the same milestone, with an ingest-time gate.
- **The longitudinal result may be null or negative.** *Mitigation:* pre-registration, shadow mode, and a narrowed claim. A null result is still publishable and still differentiating.
- **Solo-maintainer capacity.** The full plan is about 140–200 sessions on top of the stability plan. *Mitigation:* the minimum competitive path in the Summary is about 40–55 sessions.

---

## Appendix A: where each finding goes

| Finding | Item(s) in this plan |
|---|---|
| **RA-** | RA-1 → §1.2, A2 · RA-2 → §1.1, A7 · RA-3 → §1.1, A3 · RA-4 → §1.1, A3 · RA-5 → §1.1, A6 · RA-6 → §1.1 · RA-7 → §1.1 · RA-8 → §1.1, A1 · RA-9 → A4 (docs in stability TT-12) · RA-10 → §1.3, A4, L2 P3 · RA-11 → §1.3, L2 "feedback" arm · RA-12 → §1.1, A2 · RA-13 → §1.1, S3 · RA-14 → §1.0, §1.2, A2, A4 · RA-15 → §1.1, §3.4 · RA-16 → S2, §3.4 · RA-17 → A9 (explain the per-arm contribution) · RA-18 → S6 · RA-19 → stability TT-12 · RA-20 → §1.0, A1 · RA-21 → §1.1, A8 |
| **SC-** (quality) | SC-1 → TT-3 (prerequisite) · SC-2 → §1.3 · SC-6 → §1.3 · SC-5 → M2 (transactional revision, required by L2 and EE Gate C) · SC-7 → M2 (prerequisite for L2 v0) · SC-8 → M2 (shadow-mode arm, prerequisite for L2 v0) · SC-20 → M2 (fencing, EE Gate C) · SC-12 → §4.4 (L1–L3) · SC-13 → §4.4 knock-outs (bound the weight drift first) · SC-14 → S7 · SC-15 → A4, §4.4 · SC-16 → defer (cut or redesign after L2 shows whether abstraction helps P5) · SC-19 → §4.4 (reflection inside the cycle, for P5) · SC-24 → §1.3 · SC-3 → §5 item 14 |
| **PERF-** | PERF-1 → TT-8 + expression index (§1.4) · PERF-2 → §1.4, S2 · PERF-3 → §1.4, S3 · PERF-4 → §1.4, S5 · PERF-5 → TT-1, S4 · PERF-6 → S7 · PERF-7 → TT-2, S6 · PERF-8 → S6 · PERF-9 → §1.4, S5 · PERF-12/13 → S5 · PERF-14 → §3.4 (one pool query) · PERF-15 → stability OP-4 · PERF-16 → A8 (frontier traversal if the gate passes) · PERF-19 → S4 · PERF-20 → §1.0, S1, §4.5 · PERF-22 → §1.3 · PERF-23 → S6 |
| **New** | N-1 → §1.0, §4.1 · N-2 → §1.1 (RA-2, RA-3 sizing) · N-3 → A2 |

## Appendix B: facts re-checked at HEAD for this plan (2026-11-16, `16e2f15`)

**Query parsing and the two query bugs.**
- `memory-manager.ts:372-425`: `TIME_REFERENCES` maps yesterday / last week / last month / recently / today / this week to day offsets. For "today", `after = now` and `before` is undefined. The conjunction-split regex is `and also|and|as well as|plus|along with`.
- `memory-manager.ts:721-739`: compound queries search only the sub-queries (at most 3, serially) and merge by max rank.
- **LongMemEval counts (N-2).** These come from applying those regexes to the 500 questions in `longmemeval-cleaned/longmemeval_oracle.json`, the same questions as S:
  - 92 split;
  - 13 hit a time word, 12 of them answerable;
  - per-category counts are in the Summary.

**Semantic arm and hybrid fusion.**
- `memory-manager.ts:1170-1183`: the semantic arm orders by `embedding <=> $2, id DESC`, so an HNSW index cannot serve it.
- `memory-manager.ts:1205-1257`: `candidateLimit = min(max(2·limit, 20), 60)`; RRF uses K = 60. The overlap boost uses whitespace tokens and substring matching.

**Lexical arm.**
- `memory-manager.ts:1041-1061`: the keyword arm rewrites `&` to `|`, ranks with `ts_rank_cd` with no normalisation flag, and orders by `rank DESC, id DESC`.

**Defaults, embedding and the knowledge graph.**
- `memory-manager.ts:338-352`: `consolidationInnerBatchSize` defaults to 50; `consolidationThreshold` is 50 and never read.
- `memory-manager.ts:1555-1564`: the whole `finalContent` is embedded.
- `embedding.ts:195`: the default model is `Xenova/bge-small-en-v1.5` (384 dimensions).
- `memory-manager.ts:1705-1749`: entities and relationships are written only when an LLM summary exists.

**Query results and the feedback loop.**
- `memory-manager.ts:985-1002`: the `access_count` UPDATE has no `.catch`. The `retrieval_log` INSERT has no `RETURNING`.
- `QueryResult` (`types.ts`) has `occurred_at` but no `valid_until`, `confidence` or `superseded_by`.

**Sleep and reranking.**
- `sleep-cycle.ts:1631-1640`: `shouldSkipPhase` reads the last 3 analytics rows with no time bound.
- `memory-manager.ts:636-639`: the reranker uses `r.content.slice(0, 300)` and caps at 20 candidates.

**The benchmark harness.**
- `benchmarks/longmemeval-qa/evaluate.ts:52-91`: the judge prompt is a custom 0.0–1.0 partial-credit rubric. A question counts as correct when the judge says so or when the score is ≥ 0.5. There are no question-type or abstention prompts (N-1).
- `evaluate.ts:95-191`:
  - the reader prompt is custom;
  - context comes in retrieval-rank order with `[DATE:]` stamps added by the harness;
  - `limit = max(QA_TOP_K)`;
  - snippets are off by default.
- `benchmarks/longmemeval/ingest.ts:42-71`: sessions are added one at a time, with `occurred_at` = session date. This came in commit `93233cf` (2026-07-29 07:49 UTC). `OFFICIAL-RESULTS.md` was committed in `16e2f15` at 08:58 UTC.
- `benchmarks/longmemeval/download.ts:13-14`: the harness downloads the *cleaned* LongMemEval S and oracle files (2025-09 release).

**Session sizes (N-3).** From the oracle file:
- evidence sessions: median 12 turns, median 14,292 characters (p90 18,150);
- turns: median 549 characters (p90 2,783);
- 896 turns carry `has_answer`.

**pgvector versions.** `Dockerfile.standalone` builds pgvector v0.8.0. CI uses `pgvector/pgvector:pg16`. `docker-compose.yml` uses `postgres:16-alpine`, which has no pgvector.
