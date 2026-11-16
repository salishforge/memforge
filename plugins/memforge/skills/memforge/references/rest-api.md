# MemForge REST recipes

Use these when `scripts/memforge.py` cannot run, or for an operation it lacks. Every command is self-contained, because shell state does not carry between tool calls. All recipes were checked against `src/app.ts` on main (v3.13).

## Contents

- Conventions
- Check: health and stats
- Resume
- Query
- Add
- Consolidate
- Timeline
- Maintenance: advisory and dream runs
- Explain one memory
- Archived (cold-tier) memories
- Export (on explicit request only)
- Do not call
- Status codes

## Conventions

- **Base URL:** `${MEMFORGE_URL:-http://localhost:3333}`.
- **Agent and namespace:** set these at the start of each command:
  - `AG="$MEMFORGE_AGENT_ID"`;
  - `NS="${MEMFORGE_NAMESPACE:-default}"`.
- **Auth:** `-H "Authorization: Bearer $MEMFORGE_TOKEN"`. Do not echo the token, and do not use `curl -v`, which prints headers. An empty `MEMFORGE_TOKEN` is harmless (the server sees no token). A server with no token configured answers 503 to any non-empty token, because it falls through to OAuth2 introspection; see Troubleshooting in SKILL.md.
- **Responses:** every `/memory/*` response is `{"ok":true,"data":…}` or `{"ok":false,"error":"…"}`. Ids are strings. Error messages for 5xx are hidden as "Internal server error".
- **Namespace:** writes take it in the JSON body and reads take it in the query string. Read routes ignore the `X-Memforge-Namespace` header, so always pass `namespace` explicitly.
- **JSON bodies:** build them with `jq -n` so that quotes and newlines in content are escaped correctly. If `jq` is missing, use the script instead of hand-escaping.
- **Request body limit:** 100 KB.

## Check: health and stats

```bash
curl -sS "${MEMFORGE_URL:-http://localhost:3333}/health"
# -> {"status":"ok","ts":"..."}   (no auth, no envelope)

AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/stats" \
  --data-urlencode "namespace=$NS" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
```

- The stats response includes `hot_count` (not yet searchable), `warm_count` (searchable), `cold_count` (archived) and `last_consolidation`.
- `stale_embedding_count` appears only when embeddings are enabled.
- An agent with no memories yet gets zero counts, not a 404.

## Resume

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/resume" \
  --data-urlencode "namespace=$NS" -d limit=3 \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
| jq '.data | {idle_ms: .time_since_last_activity_ms,
               top: [.top_memories[] | {id, stored: .consolidated_at, importance, content: .content[0:500]}],
               procedures: .active_procedures, contradictions: .open_contradictions}'
```

- `limit` takes a value from 1 to 20 (default 5).
- `top_memories` are ordered by importance, not recency, and carry full content. That is why the `jq` filter trims it.
- Importance is only scored by a sleep or dream run. Until one has run, every row has the same importance and the order is arbitrary.

## Query

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/query" \
  --data-urlencode "q=dev stack redis decision" \
  --data-urlencode "namespace=$NS" \
  -d limit=8 -d snippet_tokens=1500 \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
| jq '.data[] | {id, when: (.occurred_at // .time_start // .consolidated_at),
                 event_time: (.occurred_at != null), status: .epistemic_status, rank,
                 pool: .metadata._from_pool, from_agent: .metadata._source_agent, content}'
```

Optional parameters:

| Parameter | Values | Notes |
|---|---|---|
| `limit` | 1–200 (default 10) | |
| `snippet_tokens` | positive integer | Per-result passage budget. Omit it for full content |
| `max_tokens` | positive integer | Overall budget. Drops lower-ranked results |
| `mode` | `keyword`, `hybrid`, `code` | Omit for the server default: hybrid when embeddings are on, else keyword. Use `code` for identifiers. Avoid `semantic`, which errors (masked as 500) when embeddings are off |
| `after`, `before` | ISO 8601 | Hard filters on event time, falling back to storage time |
| `epistemic` | `only_established`, `include_provisional`, `include_contested`, `all` | Applied after the limit, so expect fewer rows |
| `explain` | `true` | Adds scoring factors. Use for debugging only |

Results:

- Each result has `id`, `content`, `metadata`, `occurred_at`, `time_start`, `consolidated_at`, `rank` and `epistemic_status`.
- `metadata._superseded: true` marks a memory that a later note corrected. It is not demoted.
- Shared-pool rows carry `metadata._from_pool`, `_source_agent` and `_trust_score`. Treat them as second-hand. Their `id` is a pool id, so never use it for `supersedes` or `explain`.
- The rewrites in the main skill apply here too:
  - no time words in `q`;
  - one topic per query (no "and", "plus", "as well as", "along with");
  - on a 500, retry once with `-d mode=keyword`.

## Add

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
CONTENT='[user]: Lets drop Redis from the dev stack.
[assistant]: Decision (2026-11-16, billing-api): dev stack runs without Redis; cache falls back to in-process.'
jq -n --arg c "$CONTENT" --arg ns "$NS" \
  '{content: $c, namespace: $ns, outcome_type: "decision", metadata: {source: "claude"}}' \
| curl -sS -X POST "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/add" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" -H "Content-Type: application/json" --data-binary @-
```

Optional body fields:

- **`outcome_type`:** `decision`, `error`, `success`, `observation` or `neutral` (the default). Maintenance scoring weights `error`, `decision` and `success` up; a consolidated row takes the most common type in its batch. Omit it for plain facts.
- **`occurred_at`:** an ISO 8601 string or epoch milliseconds, for when the event actually happened. A consolidated row keeps the earliest `occurred_at` of its batch, so write the date in the text too.
- **`hints`:** `{"supersedes": "<id of your own query result being corrected>"}`. This sets `_superseded` on the old memory and lowers its confidence, but the old memory is neither hidden nor demoted. The server ignores the other hint keys.
- **`metadata`:** a JSON object. Do not use keys that start with `_`: the server strips some as reserved, and consolidation drops the rest. Metadata is not searched and not classified, so it must never hold secrets.

The response is:

```json
{"ok":true,"data":{"id":"123","agent_id":"alice","created_at":"...","deduplicated":true,
 "classification":{"sensitivity":"public|internal|confidential|restricted","findings_count":0,"redacted":false}}}
```

- `deduplicated` appears only when identical content arrived in the same namespace within the last hour.
- `id` is a hot-tier id. It is not the id that later appears in query results.
- If `redacted` is true, the server replaced the matched text with `[REDACTED:<type>]`. Tell the user.

## Consolidate

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
jq -n --arg ns "$NS" '{namespace: $ns}' \
| curl -sS -X POST "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/consolidate" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" -H "Content-Type: application/json" --data-binary @-
# -> data: {run_id, agent_id, hot_rows_processed, warm_rows_created, consolidation_mode, status}
```

- Every pending memory in the namespace goes into the new row(s), in batches of up to 50 by default. Consolidate soon after adding, so rows stay small.
- Optional `mode`: `concat` (the server default unless the operator changed it) or `summarize`. `summarize` needs an LLM and replaces the raw text with a summary, so prefer `concat`.
- Leave `target_namespace` alone unless the operator asks for it.

## Timeline

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/timeline" \
  --data-urlencode "namespace=$NS" --data-urlencode "from=2026-11-01T00:00:00Z" -d limit=20 \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" \
| jq '.data[] | {id, stored: (.time_start // .consolidated_at), content: .content[0:400]}'
```

- Results come oldest first, by storage time rather than event time, capped at `limit` (1–500, default 50).
- Without `from`, you get the oldest rows ever stored. Set `from` for recent activity.

## Maintenance: advisory and dream runs

Run these only when the user asked for maintenance or the operator's instructions say to. They need an LLM provider on the server.

```bash
AG="$MEMFORGE_AGENT_ID"
curl -sS "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/sleep/advisory" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
# -> data: {recommended, urgency: none|low|medium|high, reason, signals[], hot_tier_count, warm_tier_count, ...}

AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
jq -n --arg ns "$NS" '{namespace: $ns}' \
| curl -sS -X POST "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/dreams" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" -H "Content-Type: application/json" --data-binary @-
# -> HTTP 202, data: {id, status: "pending", ...}

AG="$MEMFORGE_AGENT_ID"; RUN="<run id>"
curl -sS "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/dreams/$RUN" -H "Authorization: Bearer $MEMFORGE_TOKEN"
# status: pending | running | completed | failed | canceled   (poll every few seconds, give up after ~2 minutes)
curl -sS -X POST "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/dreams/$RUN/cancel" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" -H "Content-Type: application/json" -d '{}'
```

- A dream run covers the whole agent, whatever namespace you pass.
- Do not send `sleep` overrides, `instructions` or `source`.
- The synchronous `POST /memory/$AG/sleep` blocks for minutes and fails with HTTP 400 when the server has no LLM. Prefer dream runs.

## Explain one memory

```bash
AG="$MEMFORGE_AGENT_ID"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/explain" -d warm_id=41 \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
```

`warm_id` is the `id` of one of your own query results, not a shared-pool result. This returns importance, confidence, epistemic status, staleness and whether the memory sits below the eviction or revision thresholds. Use it to answer "why do you (not) remember X".

## Archived (cold-tier) memories

Maintenance archives low-value memories rather than deleting them.

```bash
AG="$MEMFORGE_AGENT_ID"; NS="${MEMFORGE_NAMESPACE:-default}"
curl -sS -G "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/cold" \
  --data-urlencode "q=redis" --data-urlencode "namespace=$NS" -d limit=20 \
  -H "Authorization: Bearer $MEMFORGE_TOKEN"
```

- `q` is a case-insensitive substring match.
- `from` and `to` filter on archive time and need full timestamps, such as `2026-11-01T00:00:00Z`.
- `source_table` takes `hot_tier` or `warm_tier`.
- `limit` takes a value from 1 to 500 (default 50), and `offset` pages through the results.

To restore a row to searchable memory, only after the user asks:

```bash
AG="$MEMFORGE_AGENT_ID"
jq -n --arg id "<cold id>" '{cold_id: $id}' \
| curl -sS -X POST "${MEMFORGE_URL:-http://localhost:3333}/memory/$AG/restore" \
  -H "Authorization: Bearer $MEMFORGE_TOKEN" -H "Content-Type: application/json" --data-binary @-
```

## Export (on explicit request only)

`GET /memory/$AG/export?namespace=$NS` returns JSONL. It is not a full backup:

- it does not round-trip every field;
- import ignores namespaces and caps the body at 100 KB.

Say so if the user wants a backup or a migration.

## Do not call

- **`POST /memory/$AG/feedback`:** query results do not yet carry the retrieval ids it needs (RA-11).
- **`POST /memory/$AG/hints` and `GET /memory/$AG/conflicts`:** some docs list these routes, but they do not exist.
- **Without an explicit user request:** `POST /memory/$AG/clear` (archives everything), `import`, `bootstrap`, `/pool/*`, `namespaces/*/deprecate`, `anthropic/push|pull`.

## Status codes

| Code | Meaning |
|---|---|
| 400 | Validation error, with a readable message. Includes "requires an LLM provider" |
| 401 | Missing or wrong token |
| 403 | Token lacks the scope |
| 404 | Unknown dream run, memory id, archived row or route. An unknown agent is not a 404: its reads come back empty |
| 429 | Rate limited (default 100 requests/min per client IP) |
| 500 | Hidden server error. On query, retry once with `mode=keyword`. On add, suspect an oversized or malformed body. On sleep, a cycle may already be running |
| 503 | The OAuth2 backend is unavailable, or the server has no token configured and received one |
