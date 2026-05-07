// MemForge — Tool definitions for LLM function calling
//
// Compatible with both OpenAI function calling and Anthropic tool_use.
// Import and pass these to your LLM's tools parameter.
//
// Usage:
//   import { tools } from '@salishforge/memforge/tools';
//   const response = await anthropic.messages.create({ tools, ... });

import type { JsonSchemaProperty } from './types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
}

export const tools: ToolDefinition[] = [
  {
    name: 'memforge_add',
    description: 'Store a memory event in the hot tier for later consolidation. Use this to record important interactions, decisions, facts, or observations that should be remembered.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        content: { type: 'string', description: 'The memory content to store' },
        metadata: { type: 'object', description: 'Optional structured metadata', additionalProperties: true },
        namespace: { type: 'string', description: 'Memory namespace; project-scoped (e.g. "project-foo"). Defaults to "default" or the X-Memforge-Namespace header.' },
        session_id: { type: 'string', description: 'Per-device session identifier for multi-device hot-tier isolation. Defaults to "default" or the X-Memforge-Session-Id header.' },
      },
      required: ['agent_id', 'content'],
    },
  },
  {
    name: 'memforge_query',
    description: 'Search long-term memory for relevant information. Supports keyword, semantic (vector), and hybrid search modes. Use this to recall past interactions, facts, or context.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        q: { type: 'string', description: 'Natural language search query' },
        limit: { type: 'integer', description: 'Max results (default 10)', minimum: 1, maximum: 200 },
        mode: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'], description: 'Search mode (default: hybrid if embeddings available)' },
        after: { type: 'string', format: 'date-time', description: 'Only return memories after this timestamp' },
        before: { type: 'string', format: 'date-time', description: 'Only return memories before this timestamp' },
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
      },
      required: ['agent_id', 'q'],
    },
  },
  {
    name: 'memforge_timeline',
    description: 'Retrieve memories in chronological order within a time range. Use this to understand what happened during a specific period.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        from: { type: 'string', format: 'date-time', description: 'Start of time range' },
        to: { type: 'string', format: 'date-time', description: 'End of time range' },
        limit: { type: 'integer', description: 'Max results (default 50)', minimum: 1, maximum: 500 },
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_entities',
    description: 'Search the knowledge graph for entities (people, systems, organizations, concepts) mentioned across memories.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        q: { type: 'string', description: 'Search entity names (optional — omit to list all)' },
        type: { type: 'string', description: 'Filter by entity type (person, system, organization, concept, location, other)' },
        limit: { type: 'integer', description: 'Max results (default 20)', minimum: 1, maximum: 200 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_graph',
    description: 'Traverse the knowledge graph starting from a specific entity. Returns connected nodes and relationship edges up to N hops deep.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        entity: { type: 'string', description: 'Starting entity name' },
        depth: { type: 'integer', description: 'Traversal depth (default 2, max 5)', minimum: 1, maximum: 5 },
      },
      required: ['agent_id', 'entity'],
    },
  },
  {
    name: 'memforge_reflect',
    description: 'Trigger a reflection — the system reviews recent memories and synthesizes higher-order insights, patterns, and contradictions. Use this periodically to build deeper understanding.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        limit: { type: 'integer', description: 'Max warm-tier rows to review (default 20)', minimum: 1, maximum: 100 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_reflections',
    description: 'Retrieve stored reflections (synthesized insights from past reflection runs). Use this to check what lessons and patterns have been previously identified.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        limit: { type: 'integer', description: 'Max results (default 10)', minimum: 1, maximum: 100 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_consolidate',
    description: 'Consolidate hot-tier events into searchable warm-tier memory. In summarize mode, uses an LLM to distill and extract structured knowledge. Call this after adding multiple events.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        mode: { type: 'string', enum: ['concat', 'summarize'], description: 'Consolidation mode (default: from server config)' },
        namespace: { type: 'string', description: 'Source memory namespace to consolidate from; defaults to "default"' },
        target_namespace: { type: 'string', description: 'Override the warm-tier target namespace. Defaults from WARM_CONSOLIDATION_TARGET env (or echoes namespace if unset). Set to "shared" for cross-project propagation in multi-project deployments.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_procedures',
    description: 'Retrieve learned procedures — condition→action rules extracted from reflections. These represent strategies the agent has learned from experience.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        q: { type: 'string', description: 'Filter by condition/action text' },
        limit: { type: 'integer', description: 'Max results (default 20)', minimum: 1, maximum: 100 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_sleep',
    description: 'Trigger a sleep cycle — background processing that scores memory importance, evicts low-value memories, revises low-confidence memories via LLM, and maintains the knowledge graph. Call during idle periods. Agent-wide: processes all namespaces.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        token_budget: { type: 'integer', description: 'Max tokens for LLM calls this cycle (default 100000)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_health',
    description: 'Get memory health metrics — average importance/confidence, revision velocity, knowledge stability percentage, retrieval activity, and contradiction rate.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_stats',
    description: 'Get memory statistics for an agent — counts across hot/warm/cold tiers, entities, relationships, and reflections.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        namespace: { type: 'string', description: 'Scope stats to this namespace; omit for overall stats' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_feedback',
    description: 'Record outcome feedback for retrieved memories — close the self-improvement loop by reporting whether retrieved memories led to good outcomes.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        retrieval_ids: { type: 'array', items: { type: 'integer' }, description: 'Retrieval log IDs to provide feedback on' },
        outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Whether the retrieved memories were helpful' },
      },
      required: ['agent_id', 'retrieval_ids', 'outcome'],
    },
  },
  {
    name: 'memforge_meta_reflect',
    description: 'Trigger meta-reflection — a second-order reflection that synthesizes principles and patterns from accumulated first-order reflections.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        limit: { type: 'integer', description: 'Max reflections to review (default 10, min 3)', minimum: 3, maximum: 50 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_dedup_entities',
    description: 'Detect and merge duplicate entities in the knowledge graph using trigram string similarity. Run during maintenance to keep the graph clean.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        threshold: { type: 'number', description: 'Similarity threshold 0.3-1.0 (default 0.7)', minimum: 0.3, maximum: 1.0 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_active_recall',
    description: 'Proactively surface relevant memories and procedures before taking an action. Ask "what should I know before doing X?" to prevent forgot-to-look failures.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        context: { type: 'string', description: 'What the agent is about to do (natural language)' },
        limit: { type: 'integer', description: 'Max memories to surface (default 5)', minimum: 1, maximum: 20 },
      },
      required: ['agent_id', 'context'],
    },
  },
  {
    name: 'memforge_cold_search',
    description: 'Search archived (cold tier) memories. Use for audit, recovery, and compliance. Returns rows still within the retention window.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        q: { type: 'string', description: 'Substring match on content (case-insensitive)' },
        namespace: { type: 'string', description: 'Filter by namespace; defaults to "default"' },
        from: { type: 'string', format: 'date-time', description: 'Filter archived_at >= from' },
        to: { type: 'string', format: 'date-time', description: 'Filter archived_at <= to' },
        source_table: { type: 'string', enum: ['hot_tier', 'warm_tier'], description: 'Filter by origin tier' },
        limit: { type: 'integer', description: 'Max results (default 50, max 500)', minimum: 1, maximum: 500 },
        offset: { type: 'integer', description: 'Rows to skip for pagination', minimum: 0 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_cold_restore',
    description: 'Restore a cold tier row back to warm tier for reactivation. Non-destructive — the original cold row is preserved for audit.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent/session identifier' },
        cold_id: { type: 'string', description: 'cold_tier row id to restore' },
        namespace: { type: 'string', description: 'Override namespace on restore; defaults to cold row\'s original namespace' },
      },
      required: ['agent_id', 'cold_id'],
    },
  },
  {
    name: 'memforge_publish_procedures',
    description: 'Publish an agent\'s active procedures to a shared pool. Applies confidence discount per hop.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent whose procedures to publish' },
        pool_id: { type: 'string', description: 'Target shared pool ID' },
        min_confidence: { type: 'number', description: 'Minimum confidence threshold (0–1)', minimum: 0, maximum: 1 },
        namespace: { type: 'string', description: 'Namespace to filter procedures' },
      },
      required: ['agent_id', 'pool_id'],
    },
  },
  {
    name: 'memforge_shared_procedures',
    description: 'List active procedures shared in a pool, ranked by confidence and corroboration.',
    input_schema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'Pool ID to query' },
        q: { type: 'string', description: 'Optional text filter on condition or action' },
        limit: { type: 'integer', description: 'Max results (default 50)', minimum: 1, maximum: 200 },
      },
      required: ['pool_id'],
    },
  },
  {
    name: 'memforge_expertise',
    description: 'Rank pool members by expertise for a query topic. Returns agents with relevance scores and sample matching memories.',
    input_schema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'Pool to search across' },
        q: { type: 'string', description: 'Topic or question to match against agent memories' },
        limit: { type: 'integer', description: 'Max agents to return (default 10)', minimum: 1, maximum: 50 },
      },
      required: ['pool_id', 'q'],
    },
  },
  {
    name: 'memforge_declare_role',
    description: 'Declare an expertise domain for an agent. Upserts on (agent_id, domain).',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent to declare the role for' },
        domain: { type: 'string', description: 'Domain name (e.g. "security", "frontend")' },
        confidence: { type: 'number', description: 'Confidence in this role (0–1)', minimum: 0, maximum: 1 },
        description: { type: 'string', description: 'Human-readable description of the role' },
      },
      required: ['agent_id', 'domain'],
    },
  },
  {
    name: 'memforge_roles',
    description: 'Get all declared expertise roles for an agent, ordered by confidence.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_detect_roles',
    description: 'Auto-detect expertise roles from knowledge graph and active procedures.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_set_validity',
    description: 'Set or clear the validity window on a warm-tier memory. Memories past valid_until are penalized during sleep cycles.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        warm_id: { type: 'string', description: 'warm_tier row id' },
        valid_until: { type: 'string', format: 'date-time', description: 'ISO-8601 expiry timestamp; omit or pass null to clear.' },
      },
      required: ['agent_id', 'warm_id'],
    },
  },
  {
    name: 'memforge_record_procedure_outcome',
    description: 'Record the outcome of executing a procedure. Procedures accumulate success/failure counts; their confidence evolves during sleep cycles.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        procedure_id: { type: 'string', description: 'procedures row id' },
        outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Outcome classification' },
      },
      required: ['agent_id', 'procedure_id', 'outcome'],
    },
  },
  {
    name: 'memforge_drift',
    description: 'Fetch a drift-detection report based on recent drift_signals snapshots. Trend classification: stable | degrading | recovering | insufficient_data.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_dreams_create',
    description: 'Enqueue a dream run — async sleep-cycle job mirroring Anthropic Claude Dreaming. Returns a run id (status="pending"); poll memforge_dreams_status until terminal.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
        session_ids: {
          type: 'array',
          description: 'Subset of per-device session_ids to scope the run to. Hard cap 100 (matches Anthropic Dreams).',
          items: { type: 'string' },
        },
        model: { type: 'string', description: 'Model identifier — pass-through for source="anthropic", advisory for "local".' },
        instructions: { type: 'string', description: 'Free-text guidance plumbed into Phase 3 (Revision) and Phase 5 (Reflection) prompts. Max 4096 chars.' },
        source: { type: 'string', enum: ['local', 'anthropic'], description: "'local' uses MemForge's own cycle (default). 'anthropic' delegates Phase 3.5 to Anthropic Dreams (requires Service layer)." },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_dreams_status',
    description: 'Fetch a dream run by id. Useful for polling pending or running cycles.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        run_id: { type: 'string', description: 'Dream run UUID returned by memforge_dreams_create.' },
      },
      required: ['agent_id', 'run_id'],
    },
  },
  {
    name: 'memforge_dreams_list',
    description: 'List dream runs for an agent. Filter by status or source.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'canceled'], description: 'Filter by run status.' },
        source: { type: 'string', enum: ['local', 'anthropic', 'bridge_pull', 'bridge_push'], description: 'Filter by run source.' },
        limit: { type: 'integer', description: 'Max results (default 50, max 500)', minimum: 1, maximum: 500 },
        offset: { type: 'integer', description: 'Rows to skip', minimum: 0 },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_dreams_cancel',
    description: 'Request cancellation of a dream run. Pending runs go straight to "canceled"; running runs exit at the next phase boundary.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        run_id: { type: 'string', description: 'Dream run UUID.' },
      },
      required: ['agent_id', 'run_id'],
    },
  },
  {
    name: 'memforge_anthropic_push',
    description: 'Bridge: export warm-tier rows for an agent/namespace to an Anthropic Memory Store. Requires DREAMS_PROVIDER=anthropic + ANTHROPIC_API_KEY on the server.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
        limit: { type: 'integer', description: 'Max rows to push (default 1000, max 5000)', minimum: 1, maximum: 5000 },
        external_store_id: { type: 'string', description: 'Existing memory store id to update; omit to create a new one.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_anthropic_pull',
    description: "Bridge: import records from an Anthropic Memory Store into warm_tier. Strategies: anthropic-wins (default), memforge-wins, merge.",
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        external_store_id: { type: 'string', description: 'Anthropic memory store id to read from.' },
        namespace: { type: 'string', description: 'Target namespace; defaults to "default"' },
        strategy: { type: 'string', enum: ['memforge-wins', 'anthropic-wins', 'merge'], description: "Conflict policy. Default 'anthropic-wins'." },
      },
      required: ['agent_id', 'external_store_id'],
    },
  },
  {
    name: 'memforge_anthropic_sync_state',
    description: 'Bridge: report current sync state for an agent/namespace — known store links, last push/pull timestamps, and a drift indicator.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
      },
      required: ['agent_id'],
    },
  },
];

/** Convert MemForge tool definitions to OpenAI function calling format. */
export function toOpenAITools(): Array<{ type: 'function'; function: { name: string; description: string; parameters: ToolDefinition['input_schema'] } }> {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}
