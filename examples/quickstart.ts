#!/usr/bin/env npx tsx
// MemForge Quickstart — demonstrates the core recall → act → store → sleep pattern
//
// Prerequisites:
//   1. MemForge server running: docker compose up -d (or npm start)
//   2. Set MEMFORGE_TOKEN if auth is enabled
//
// Run:
//   npx tsx examples/quickstart.ts

import { ResilientMemForgeClient } from '../src/client.js';

const memory = new ResilientMemForgeClient({
  baseUrl: process.env['MEMFORGE_URL'] ?? 'http://localhost:3333',
  token: process.env['MEMFORGE_TOKEN'],
});

const AGENT = 'quickstart-agent';

async function main() {
  console.log('=== MemForge Quickstart ===\n');

  // ─── Store some memories ────────────────────────────────────────────────
  console.log('1. Storing memories...');
  await memory.add(AGENT, 'The user prefers dark mode and compact layouts');
  await memory.add(AGENT, 'Deployed v2.3.0 to production on Monday — no issues');
  await memory.add(AGENT, 'The payments API rate-limits at 100 req/s — hit this during the Black Friday load test');
  await memory.add(AGENT, 'Alice from the platform team reviewed our PR and caught a race condition in the session handler');
  await memory.add(AGENT, 'Never deploy on Fridays — learned this the hard way after the 2025-11-14 incident');
  console.log('   Stored 5 memories in hot tier\n');

  // ─── Consolidate to warm tier ───────────────────────────────────────────
  console.log('2. Consolidating hot → warm tier...');
  const consolidation = await memory.consolidate(AGENT, 'concat');
  console.log(`   ${consolidation?.hot_rows_processed ?? 0} events → ${consolidation?.warm_rows_created ?? 0} warm memories\n`);

  // ─── Recall: search before acting ───────────────────────────────────────
  console.log('3. Recall: "What should I know before deploying?"');
  const context = await memory.activeRecall(AGENT, 'preparing to deploy to production');
  for (const m of context.memories) {
    console.log(`   [${m.relevance}] ${m.content.slice(0, 80)}...`);
  }
  console.log();

  // ─── Query: search for specific knowledge ───────────────────────────────
  console.log('4. Query: "payments API"');
  const results = await memory.query(AGENT, { q: 'payments API rate limit', mode: 'keyword' });
  for (const r of results) {
    console.log(`   [rank=${r.rank.toFixed(3)}] ${r.content.slice(0, 80)}...`);
  }
  console.log();

  // ─── Timeline: what happened recently ───────────────────────────────────
  console.log('5. Timeline:');
  const timeline = await memory.timeline(AGENT, { limit: 3 });
  for (const entry of timeline) {
    console.log(`   ${entry.content.slice(0, 80)}...`);
  }
  console.log();

  // ─── Stats ──────────────────────────────────────────────────────────────
  console.log('6. Memory stats:');
  const stats = await memory.stats(AGENT);
  if (stats) {
    console.log(`   Hot: ${stats.hot_count} | Warm: ${stats.warm_count} | Cold: ${stats.cold_count}`);
    console.log(`   Entities: ${stats.entity_count} | Reflections: ${stats.reflection_count}`);
  }
  console.log();

  // ─── Clean up ───────────────────────────────────────────────────────────
  console.log('7. Cleaning up (archiving to cold tier)...');
  await memory.clear(AGENT);
  console.log('   Done.\n');

  console.log('=== Next steps ===');
  console.log('• Add an LLM provider for intelligent consolidation: LLM_PROVIDER=anthropic');
  console.log('• Enable vector search: EMBEDDING_PROVIDER=openai');
  console.log('• Run a sleep cycle: POST /memory/your-agent/sleep');
  console.log('• See INTEGRATION.md for framework-specific guides');
}

main().catch(console.error);
