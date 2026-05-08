#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MemForge Demo — memories that improve while the agent sleeps
#  https://github.com/salishforge/memforge
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
DIM='\033[2m'

ok()      { printf "${GREEN}${BOLD}  ✓${RESET}  %s\n" "$*"; }
hdr()     { printf "\n${YELLOW}${BOLD}══ %s${RESET}\n" "$*"; }
info()    { printf "${CYAN}     %s${RESET}\n" "$*"; }
dim()     { printf "${DIM}     %s${RESET}\n" "$*"; }
err()     { printf "${RED}${BOLD}  ✗${RESET}  %s\n" "$*" >&2; }
note()    { printf "     %s\n" "$*"; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear 2>/dev/null || true
printf "${BOLD}"
printf "  ╔══════════════════════════════════════════════════════╗\n"
printf "  ║          M E M F O R G E   —   D E M O              ║\n"
printf "  ║     memories that improve while the agent sleeps     ║\n"
printf "  ╚══════════════════════════════════════════════════════╝\n"
printf "${RESET}\n"

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Prerequisites
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 1 — Checking prerequisites"

if ! command -v jq &>/dev/null; then
  err "jq is required but not found. Install it: https://jqlang.github.io/jq/download/"
  exit 1
fi
ok "jq found"

USE_DOCKER=false
CONTAINER_STARTED=false

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  ok "Docker is available"
  USE_DOCKER=true
else
  note "Docker not available or not running — assuming MemForge is already"
  note "listening at localhost:3333. Start it with:"
  note "  npm start   (after npm install && npm run build && psql ... -f schema/schema.sql)"
fi

# ── Resolve base URL and token ────────────────────────────────────────────────
BASE_URL="${MEMFORGE_URL:-http://localhost:3333}"
AGENT="demo-agent"
DEMO_TOKEN="demo-token"

# If the caller already exported MEMFORGE_TOKEN, honour it; otherwise use ours.
TOKEN="${MEMFORGE_TOKEN:-$DEMO_TOKEN}"
AUTH="Authorization: Bearer $TOKEN"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Start MemForge (Docker path)
# ─────────────────────────────────────────────────────────────────────────────
if $USE_DOCKER; then
  hdr "Step 2 — Starting MemForge"

  # Remove any leftover container from a previous demo run.
  if docker inspect memforge-demo &>/dev/null 2>&1; then
    info "Removing stale container from a previous run..."
    docker rm -f memforge-demo &>/dev/null
  fi

  info "Pulling salishforge/memforge:standalone (cached after first pull)..."
  docker pull salishforge/memforge:standalone &>/dev/null || {
    err "docker pull failed. Check your internet connection or image name."
    exit 1
  }

  docker run -d \
    -p 3333:3333 \
    --name memforge-demo \
    -e MEMFORGE_TOKEN="$DEMO_TOKEN" \
    -e LLM_PROVIDER="${LLM_PROVIDER:-none}" \
    ${ANTHROPIC_API_KEY:+-e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"} \
    ${OPENAI_API_KEY:+-e OPENAI_API_KEY="$OPENAI_API_KEY"} \
    salishforge/memforge:standalone &>/dev/null

  CONTAINER_STARTED=true
  ok "Container started (memforge-demo)"
else
  hdr "Step 2 — Using existing MemForge instance"
  info "Target: $BASE_URL"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Wait for health check
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 3 — Waiting for MemForge to be ready"

info "Polling GET $BASE_URL/health ..."
READY=false
for i in $(seq 1 30); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || true)
  if [ "$HTTP_STATUS" = "200" ]; then
    READY=true
    break
  fi
  printf "."
  sleep 1
done
printf "\n"

if ! $READY; then
  err "MemForge did not become healthy within 30 seconds."
  if $CONTAINER_STARTED; then
    note "Container logs:"
    docker logs memforge-demo --tail 20 2>/dev/null || true
  fi
  exit 1
fi

ok "MemForge is ready"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Add realistic memories (with redundancy + contradiction)
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 4 — Adding memories"

note "We'll add 7 memories that simulate a real conversation trail."
note "Notice the redundancy and a deliberate contradiction about the database"
note "version and Redis optionality — these are what the sleep cycle will resolve."
printf "\n"

add_mem_curl() {
  local content="$1"
  printf "  ${CYAN}+${RESET} %s\n" "$content"
  curl -s -X POST "$BASE_URL/memory/$AGENT/add" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$content" '{content: $c}')" \
    | jq -r 'if .ok then "     → id \(.data.id)" else "     ✗ \(.error)" end'
}

add_mem_curl "Project uses PostgreSQL 14 for the database"
add_mem_curl "Switched database to PostgreSQL 16 for better performance and pgvector support"
add_mem_curl "The API server runs on port 3000"
add_mem_curl "API server listens on port 3000 by default, configurable via PORT env var"
add_mem_curl "Deployment uses Docker Compose with three services: app, postgres, redis"
add_mem_curl "Redis is required for caching session state"
add_mem_curl "Redis is optional — the system degrades gracefully without it"

ok "7 memories stored in the hot tier"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Consolidate hot → warm
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 5 — Consolidating hot tier → warm tier"

note "Raw events live in the hot tier. Consolidation merges them into the"
note "scored, searchable warm tier. This is fast and runs without an LLM."
printf "\n"

CONSOLIDATE_RESP=$(curl -s -X POST "$BASE_URL/memory/$AGENT/consolidate" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "$CONSOLIDATE_RESP" | jq '{
  memories_created: .data.consolidated,
  hot_rows_processed: .data.processed,
  duration_ms: .data.duration_ms
}' 2>/dev/null || echo "$CONSOLIDATE_RESP"

ok "Hot tier consolidated into warm tier"

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Show pre-sleep state
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 6 — Pre-sleep state"

note "Here is what the warm tier looks like before the sleep cycle."
note "Notice the duplicate port entries and the conflicting Redis statements."
printf "\n"

printf "${YELLOW}${BOLD}  Query: \"database PostgreSQL\"${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/query?q=database+PostgreSQL&limit=5" \
  -H "$AUTH" \
  | jq '.data[] | {score: .score, content: .content}' 2>/dev/null

printf "\n${YELLOW}${BOLD}  Query: \"Redis caching\"${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/query?q=Redis+caching&limit=5" \
  -H "$AUTH" \
  | jq '.data[] | {score: .score, content: .content}' 2>/dev/null

printf "\n${YELLOW}${BOLD}  Tier stats${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/stats" \
  -H "$AUTH" \
  | jq '{
    hot_count: .data.hot_count,
    warm_count: .data.warm_count,
    avg_importance: (.data.avg_importance // 0 | . * 1000 | round / 1000),
    avg_confidence: (.data.avg_confidence // 0 | . * 1000 | round / 1000)
  }' 2>/dev/null

ok "Pre-sleep state captured"

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Run sleep cycle
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 7 — Running sleep cycle"

note "The sleep cycle is a 10-phase background process that:"
note "  Phase 1  — recalculates importance scores (recency, frequency, centrality)"
note "  Phase 2  — evicts low-importance memories; flags low-confidence for revision"
note "  Phase 3  — LLM-assisted revision (augment, correct, merge, compress)"
note "  Phase 4  — knowledge graph edges invalidated / entities merged"
note "  Phase 5  — reflection (LLM synthesises patterns and contradictions)"
note "  Phase 2.5— conflict resolution: newer/higher-confidence memory wins"
printf "\n"

LLM_NOTE=""
if [ "${LLM_PROVIDER:-none}" = "none" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  info "Note: No LLM provider configured. Phases 3 and 5 (revision + reflection)"
  info "will be skipped — set LLM_PROVIDER=anthropic/openai and the matching"
  info "API key to see full revision behaviour. All other phases still run."
  printf "\n"
fi

info "Calling POST /memory/$AGENT/sleep ..."
SLEEP_RESP=$(curl -s -X POST "$BASE_URL/memory/$AGENT/sleep" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"includeReflection": true}')

SLEEP_OK=$(echo "$SLEEP_RESP" | jq -r '.ok' 2>/dev/null || echo "false")

if [ "$SLEEP_OK" = "true" ]; then
  ok "Sleep cycle completed"
  printf "\n"
  echo "$SLEEP_RESP" | jq '{
    scores_updated:     .data.phase1_scores_updated,
    memories_evicted:   .data.phase2_evicted,
    flagged_for_revision: .data.phase2_flagged_for_revision,
    memories_revised:   .data.phase3_revised,
    conflicts_resolved: .data.conflicts_resolved,
    schemas_detected:   .data.schemas_detected,
    reflection_ran:     .data.phase5_reflection,
    tokens_used:        .data.tokens_used,
    duration_ms:        .data.duration_ms
  }' 2>/dev/null
elif echo "$SLEEP_RESP" | jq -e '.error' &>/dev/null 2>&1 && \
     echo "$SLEEP_RESP" | jq -r '.error' | grep -qi "LLM\|provider"; then
  printf "\n"
  info "Sleep cycle returned a partial result — LLM phases were skipped:"
  echo "$SLEEP_RESP" | jq '.error' 2>/dev/null
  info "Phases 1, 2, 2.5, and 4 (score update, eviction, conflict resolution,"
  info "graph maintenance) ran without LLM. Set LLM_PROVIDER to unlock Phase 3/5."
else
  err "Sleep cycle call failed:"
  echo "$SLEEP_RESP" | jq '.' 2>/dev/null || echo "$SLEEP_RESP"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Show post-sleep state
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 8 — Post-sleep state (what changed)"

note "After the sleep cycle, importance scores are recalculated and"
note "conflict resolution has marked the losing side of contradictions."
printf "\n"

printf "${YELLOW}${BOLD}  Query: \"database PostgreSQL\" — post-sleep${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/query?q=database+PostgreSQL&limit=5" \
  -H "$AUTH" \
  | jq '.data[] | {score: (.score | . * 1000 | round / 1000), content: .content, revision_count: .revision_count}' 2>/dev/null

printf "\n${YELLOW}${BOLD}  Query: \"Redis caching\" — post-sleep${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/query?q=Redis+caching&limit=5" \
  -H "$AUTH" \
  | jq '.data[] | {score: (.score | . * 1000 | round / 1000), content: .content, revision_count: .revision_count}' 2>/dev/null

printf "\n${YELLOW}${BOLD}  Tier stats — post-sleep${RESET}\n"
curl -s "$BASE_URL/memory/$AGENT/stats" \
  -H "$AUTH" \
  | jq '{
    hot_count: .data.hot_count,
    warm_count: .data.warm_count,
    cold_count: .data.cold_count,
    avg_importance: (.data.avg_importance // 0 | . * 1000 | round / 1000),
    avg_confidence: (.data.avg_confidence // 0 | . * 1000 | round / 1000)
  }' 2>/dev/null

ok "Post-sleep state captured"

# ─────────────────────────────────────────────────────────────────────────────
# Step 9 — Health metrics
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 9 — Memory health metrics"

note "The health endpoint surfaces quality indicators derived from revision"
note "history, retrieval patterns, importance scores, and contradiction rate."
printf "\n"

curl -s "$BASE_URL/memory/$AGENT/health" \
  -H "$AUTH" \
  | jq '.data | {
    total_memories:          .total_memories,
    avg_importance:          (.avg_importance | . * 100 | round / 100),
    avg_confidence:          (.avg_confidence | . * 100 | round / 100),
    memories_below_eviction: .memories_below_eviction,
    memories_below_revision: .memories_below_revision,
    knowledge_stability_pct: (.knowledge_stability_pct | . * 10 | round / 10),
    stale_memory_count:      .stale_memory_count,
    contradiction_rate:      .contradiction_rate
  }' 2>/dev/null

ok "Health metrics shown"

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
hdr "Demo complete"

printf "${BOLD}  What you just saw:${RESET}\n\n"
note "  1. Raw events (\"PostgreSQL 14\" + \"PostgreSQL 16\") landed in the hot tier."
note "  2. Consolidation moved them to the scored warm tier."
note "  3. The sleep cycle recalculated importance across all 10 phases:"
note "       Phase 1  — importance scores updated (recency × frequency × centrality)"
note "       Phase 2  — low-importance candidates flagged for eviction"
note "       Phase 2.5— conflict resolution: PostgreSQL 16 supersedes 14;"
note "                  optional-Redis supersedes required-Redis"
note "       Phase 3  — LLM revision (correct / merge / compress) — requires LLM"
note "       Phase 4  — knowledge graph edges maintained"
note "       Phase 5  — LLM reflection synthesises patterns — requires LLM"
note "  4. Post-sleep queries return sharper, higher-confidence results."
printf "\n"
note "  To unlock full LLM revision/reflection:"
note "    export LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-..."
note "    # then re-run this demo"
printf "\n"

# ─────────────────────────────────────────────────────────────────────────────
# Step 10 — Cleanup offer
# ─────────────────────────────────────────────────────────────────────────────
if $CONTAINER_STARTED; then
  hdr "Step 10 — Cleanup"
  printf "  Remove the demo container? [y/N] "
  read -r REPLY < /dev/tty || REPLY="n"
  printf "\n"
  if [[ "${REPLY:-n}" =~ ^[Yy]$ ]]; then
    docker rm -f memforge-demo &>/dev/null
    ok "Container removed"
  else
    info "Container left running at $BASE_URL"
    info "Remove later with: docker rm -f memforge-demo"
  fi
fi

printf "\n${BOLD}  Learn more: https://github.com/salishforge/memforge${RESET}\n\n"
