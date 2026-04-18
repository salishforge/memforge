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
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
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
        namespace: { type: 'string', description: 'Memory namespace; defaults to "default"' },
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
