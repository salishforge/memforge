// MemForge Standalone — public npm entry-point
//
// Import the MemoryManager class and types when using memforge as a library.
// To run the HTTP server, use: node dist/server.js

export { MemoryManager } from './memory-manager.js';
export { getPool, closePool } from './db.js';
export type {
  Agent,
  HotRow,
  WarmRow,
  AddResult,
  QueryResult,
  ConsolidateResult,
  ClearResult,
  AgentStats,
  MemForgeConfig,
} from './types.js';
