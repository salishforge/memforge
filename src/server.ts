// MemForge Standalone — Express REST API server
//
// This file bootstraps real providers from environment variables and starts the server.
// The Express app factory lives in app.ts for testability.

import { MemoryManager } from './memory-manager.js';
import { createEmbeddingProvider } from './embedding.js';
import { createLLMProvider } from './llm.js';
import { closePool, getPool } from './db.js';
import { closeRedis } from './cache.js';
import { createDefaultRegistry } from './classifier.js';
import { wrapLLMProvider } from './llm-safety.js';
import { AuditChain } from './audit.js';
import { createApp } from './app.js';
import { getLogger } from './logger.js';
import { configureWebhooks } from './webhooks.js';
import type { ConsolidationMode } from './types.js';

const log = getLogger('server');

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3333', 10);
const ADMIN_TOKEN = process.env['ADMIN_TOKEN'] ?? '';

const classifierRegistry = createDefaultRegistry();

const embeddingProvider = createEmbeddingProvider();

const llmProviderType = process.env['LLM_PROVIDER'] ?? 'none';
const allowRemoteLLM = process.env['ALLOW_REMOTE_LLM'] === 'true';
const rawLlmProvider = createLLMProvider();
const llmProvider = wrapLLMProvider(rawLlmProvider, llmProviderType, classifierRegistry, allowRemoteLLM);

const revisionProviderType = process.env['REVISION_LLM_PROVIDER'] ?? llmProviderType;
const rawRevisionLlmProvider = process.env['REVISION_LLM_PROVIDER']
  ? createLLMProvider(process.env['REVISION_LLM_PROVIDER'] as 'anthropic' | 'openai' | 'ollama')
  : null;
const revisionLlmProvider = wrapLLMProvider(rawRevisionLlmProvider, revisionProviderType, classifierRegistry, allowRemoteLLM);

const auditChain = new AuditChain(getPool(process.env['DATABASE_URL'] || undefined), {
  hmacKey: process.env['AUDIT_HMAC_KEY'],
  retentionDays: parseInt(process.env['AUDIT_RETENTION_DAYS'] ?? '90', 10),
});

const manager = new MemoryManager({
  databaseUrl: process.env['DATABASE_URL'],
  consolidationBatchSize: parseInt(process.env['CONSOLIDATION_BATCH_SIZE'] ?? '500', 10),
  consolidationThreshold: parseInt(process.env['CONSOLIDATION_THRESHOLD'] ?? '50', 10),
  autoRegisterAgents: process.env['AUTO_REGISTER_AGENTS'] !== 'false',
  embeddingProvider,
  llmProvider,
  revisionLlmProvider,
  consolidationMode: (process.env['CONSOLIDATION_MODE'] as ConsolidationMode) ?? 'concat',
  temporalDecayRate: parseFloat(process.env['TEMPORAL_DECAY_RATE'] ?? '0'),
  consolidationInnerBatchSize: parseInt(process.env['CONSOLIDATION_INNER_BATCH_SIZE'] ?? '50', 10),
  keywordOverlapBoost: parseFloat(process.env['KEYWORD_OVERLAP_BOOST'] ?? '0.3'),
  temporalProximityDays: parseFloat(process.env['TEMPORAL_PROXIMITY_DAYS'] ?? '7'),
  enableLlmRerank: process.env['ENABLE_LLM_RERANK'] === 'true',
  enableLlmIngest: process.env['ENABLE_LLM_INGEST'] === 'true',
  sleepCycle: {
    tokenBudget: parseInt(process.env['SLEEP_CYCLE_TOKEN_BUDGET'] ?? '100000', 10),
    evictionThreshold: parseFloat(process.env['SLEEP_CYCLE_EVICTION_THRESHOLD'] ?? '0.1'),
    revisionThreshold: parseFloat(process.env['SLEEP_CYCLE_REVISION_THRESHOLD'] ?? '0.4'),
    includeReflection: process.env['SLEEP_CYCLE_INCLUDE_REFLECTION'] !== 'false',
    coldRetentionDays: process.env['COLD_TIER_RETENTION_DAYS']
      ? Math.max(1, parseInt(process.env['COLD_TIER_RETENTION_DAYS'], 10))
      : undefined,
    warmTierMaxPerAgent: parseInt(process.env['WARM_TIER_MAX_PER_AGENT'] ?? '0', 10),
    weights: {
      recency: 0.25,
      frequency: 0.20,
      centrality: 0.20,
      reflection: 0.15,
      stability: 0.20,
    },
  },
  auditChain,
  sleepAdvisoryThresholds: {
    ...(process.env['SLEEP_ADVISORY_HOT_BACKLOG_LOW']      ? { hotBacklogLow:      parseInt(process.env['SLEEP_ADVISORY_HOT_BACKLOG_LOW'], 10) }      : {}),
    ...(process.env['SLEEP_ADVISORY_HOT_BACKLOG_MEDIUM']   ? { hotBacklogMedium:   parseInt(process.env['SLEEP_ADVISORY_HOT_BACKLOG_MEDIUM'], 10) }   : {}),
    ...(process.env['SLEEP_ADVISORY_HOT_BACKLOG_HIGH']     ? { hotBacklogHigh:     parseInt(process.env['SLEEP_ADVISORY_HOT_BACKLOG_HIGH'], 10) }     : {}),
    ...(process.env['SLEEP_ADVISORY_CONTRADICTION_HIGH']   ? { contradictionHigh:  parseFloat(process.env['SLEEP_ADVISORY_CONTRADICTION_HIGH']) }     : {}),
    ...(process.env['SLEEP_ADVISORY_REVISION_DEBT_MEDIUM'] ? { revisionDebtMedium: parseInt(process.env['SLEEP_ADVISORY_REVISION_DEBT_MEDIUM'], 10) } : {}),
    ...(process.env['SLEEP_ADVISORY_MAX_AGE_HOURS']        ? { maxAgeHours:        parseFloat(process.env['SLEEP_ADVISORY_MAX_AGE_HOURS']) }          : {}),
    ...(process.env['SLEEP_ADVISORY_STABILITY_CEILING']    ? { stabilityCeiling:   parseFloat(process.env['SLEEP_ADVISORY_STABILITY_CEILING']) }      : {}),
  },
});

// ─── Webhooks ────────────────────────────────────────────────────────────────
configureWebhooks();

// ─── Create and start ────────────────────────────────────────────────────────

const app = createApp({
  manager,
  auditChain,
  classifierRegistry,
  adminToken: ADMIN_TOKEN,
  rateLimitWindowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
  rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10),
  port: PORT,
  corsOrigin: process.env['CORS_ORIGIN'],
  corsMethods: process.env['CORS_METHODS'],
  corsHeaders: process.env['CORS_HEADERS'],
});

const server = app.listen(PORT, () => {
  log.info({ port: PORT, embeddings: manager.embeddingsEnabled, summarization: manager.summarizationEnabled }, 'server started');
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'shutting down');
  server.close(async () => {
    await Promise.all([closePool(), closeRedis()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
