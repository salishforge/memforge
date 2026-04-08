// MemForge Standalone — public npm entry-point
//
// Import the MemoryManager class and types when using memforge as a library.
// To run the HTTP server, use: node dist/server.js

export { MemoryManager } from './memory-manager.js';
export { getPool, closePool } from './db.js';
export {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  NoOpEmbeddingProvider,
} from './embedding.js';
export {
  createLLMProvider,
  AnthropicLLMProvider,
  OpenAILLMProvider,
  OllamaLLMProvider,
} from './llm.js';
export type {
  Agent,
  HotRow,
  WarmRow,
  AddResult,
  QueryResult,
  QueryOptions,
  QueryMode,
  ConsolidationMode,
  TimelineEntry,
  ConsolidateResult,
  ClearResult,
  AgentStats,
  MemForgeConfig,
  EmbeddingProvider,
  EmbeddingProviderType,
  LLMProvider,
  LLMProviderType,
  ConsolidationSummary,
  Entity,
  Relationship,
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  EntitySearchResult,
  Reflection,
  ReflectionResult,
  ReflectionTrigger,
  RetrievalEvent,
  MemoryRevision,
  RevisionType,
  SleepCycleResult,
  SleepCycleConfig,
  MemoryHealth,
  Procedure,
} from './types.js';
export { SleepCycleEngine } from './sleep-cycle.js';
export {
  createDefaultRegistry,
  ClassifierRegistry,
  SecretPatternClassifier,
  PIIPatternClassifier,
  sanitizeForLLM,
} from './classifier.js';
export type { Sensitivity, Classification, ClassificationResult, ContentClassifier } from './classifier.js';
export { SafeLLMProvider, wrapLLMProvider, getProviderLocality } from './llm-safety.js';
export { AuditChain, contentHash } from './audit.js';
export type { AuditEntry, AuditOperation, AuditTrigger, VerificationResult, AuditConfig } from './audit.js';
export { createApp } from './app.js';
export type { AppDependencies } from './app.js';
export { VERSION } from './version.js';
