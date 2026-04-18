#!/usr/bin/env node
// MemForge — Model Context Protocol (MCP) Server
//
// Exposes MemForge operations as MCP tools for use with Claude Code, Cursor,
// and other MCP-compatible AI tools.
//
// Usage:
//   npx memforge-mcp                         # stdio transport (default)
//   MEMFORGE_URL=http://localhost:3333 npx memforge-mcp
//
// Add to Claude Code settings (~/.claude/settings.json):
//   { "mcpServers": { "memforge": { "command": "npx", "args": ["memforge-mcp"] } } }

import { MemForgeClient } from './client.js';
import { VERSION } from './version.js';
import type { JsonSchemaProperty } from './types.js';

// ─── MCP Protocol Types ──────────────────────────────────────────────────────
// Minimal types for MCP stdio transport — no external SDK dependency required.

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

const TOOLS: MCPToolDefinition[] = [
  {
    name: 'memforge_add',
    description: 'Store a memory event in the hot tier. Use for recording interactions, decisions, facts, or observations.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        content: { type: 'string', description: 'Memory content to store' },
        metadata: { type: 'object', description: 'Optional structured metadata' },
        namespace: { type: 'string', description: 'Memory namespace (default: "default")' },
      },
      required: ['agent_id', 'content'],
    },
  },
  {
    name: 'memforge_query',
    description: 'Search long-term memory. Supports keyword, semantic, and hybrid modes.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        q: { type: 'string', description: 'Natural language search query' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
        mode: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'], description: 'Search mode' },
        namespace: { type: 'string', description: 'Memory namespace (default: "default")' },
      },
      required: ['agent_id', 'q'],
    },
  },
  {
    name: 'memforge_timeline',
    description: 'Retrieve memories in chronological order within an optional time range.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        from: { type: 'string', description: 'Start of time range (ISO 8601)' },
        to: { type: 'string', description: 'End of time range (ISO 8601)' },
        limit: { type: 'integer', description: 'Max results (default 50)' },
        namespace: { type: 'string', description: 'Memory namespace (default: "default")' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_entities',
    description: 'Search knowledge graph entities (people, systems, organizations, concepts).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        q: { type: 'string', description: 'Search entity names' },
        type: { type: 'string', description: 'Filter by entity type' },
        limit: { type: 'integer', description: 'Max results (default 20)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_graph',
    description: 'Traverse the knowledge graph from a specific entity. Returns connected nodes and edges.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        entity: { type: 'string', description: 'Starting entity name' },
        depth: { type: 'integer', description: 'Traversal depth (default 2, max 5)' },
      },
      required: ['agent_id', 'entity'],
    },
  },
  {
    name: 'memforge_reflect',
    description: 'Trigger a reflection — synthesizes insights and contradictions from recent memories.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        limit: { type: 'integer', description: 'Max memories to review (default 20)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_reflections',
    description: 'Retrieve stored reflections (synthesized insights from past reviews).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_consolidate',
    description: 'Consolidate hot-tier events into searchable warm-tier memory. Call after adding multiple events.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        mode: { type: 'string', enum: ['concat', 'summarize'], description: 'Consolidation mode' },
        namespace: { type: 'string', description: 'Memory namespace (default: "default")' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_procedures',
    description: 'Retrieve learned procedures — condition→action rules extracted from reflections.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        q: { type: 'string', description: 'Filter by condition/action text' },
        limit: { type: 'integer', description: 'Max results (default 20)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_sleep',
    description: 'Trigger a sleep cycle — scores importance, evicts low-value memories, revises low-confidence memories via LLM, maintains graph. Agent-wide: processes all namespaces for the agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        token_budget: { type: 'integer', description: 'Max tokens for LLM calls (default 100000)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_health',
    description: 'Get memory health metrics — importance, confidence, revision velocity, stability, contradiction rate.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_stats',
    description: 'Get memory statistics — counts across tiers, entities, relationships, and reflections.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        namespace: { type: 'string', description: 'Memory namespace (default: overall stats)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_feedback',
    description: 'Record whether retrieved memories led to good outcomes. Links retrieval events to success/failure for self-improvement.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        retrieval_ids: { type: 'array', items: { type: 'integer' }, description: 'Retrieval log IDs to provide feedback on' },
        outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Whether the retrieved memories were helpful' },
      },
      required: ['agent_id', 'retrieval_ids', 'outcome'],
    },
  },
  {
    name: 'memforge_meta_reflect',
    description: 'Trigger meta-reflection — synthesizes higher-order principles from accumulated first-order reflections.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        limit: { type: 'integer', description: 'Max reflections to review (default 10, min 3)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_dedup_entities',
    description: 'Detect and merge duplicate entities in the knowledge graph using trigram similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        threshold: { type: 'number', description: 'Similarity threshold 0.3-1.0 (default 0.7)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_active_recall',
    description: 'Proactively surface relevant memories and procedures before taking an action. Use this to check "what should I know before doing X?"',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        context: { type: 'string', description: 'What the agent is about to do (natural language)' },
        limit: { type: 'integer', description: 'Max memories to surface (default 5)' },
      },
      required: ['agent_id', 'context'],
    },
  },
  {
    name: 'memforge_cold_search',
    description: 'Search archived (cold tier) memories. Use for audit, recovery, and compliance. Returns rows still within retention window.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        q: { type: 'string', description: 'Substring match on content (case-insensitive)' },
        namespace: { type: 'string', description: 'Filter by namespace (default: "default")' },
        from: { type: 'string', description: 'Filter archived_at >= from (ISO 8601)' },
        to: { type: 'string', description: 'Filter archived_at <= to (ISO 8601)' },
        source_table: { type: 'string', enum: ['hot_tier', 'warm_tier'], description: 'Filter by source table' },
        limit: { type: 'integer', description: 'Max results (default 50, max 500)' },
        offset: { type: 'integer', description: 'Rows to skip for pagination' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_cold_restore',
    description: 'Restore a cold tier row to warm tier for reactivation. Non-destructive — the cold row is preserved for audit.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
        cold_id: { type: 'string', description: 'cold_tier row id to restore' },
        namespace: { type: 'string', description: 'Override namespace on restore (defaults to cold row\'s original namespace)' },
      },
      required: ['agent_id', 'cold_id'],
    },
  },
  {
    name: 'memforge_sleep_advisory',
    description: 'Get an adaptive sleep-cycle recommendation. Advisory only — MemForge has no built-in scheduler. Callers (cron jobs, control planes) read the urgency and reason and decide whether to call memforge_sleep.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_publish_procedures',
    description: 'Publish an agent\'s active procedures (condition→action rules) to a shared pool. Applies a 0.8× confidence discount per hop. The agent must be a pool member.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent whose procedures to publish' },
        pool_id: { type: 'string', description: 'Target shared pool ID' },
        min_confidence: { type: 'number', description: 'Minimum confidence threshold (0–1, default 0)', minimum: 0, maximum: 1 },
        namespace: { type: 'string', description: 'Namespace to filter procedures (default: "default")' },
      },
      required: ['agent_id', 'pool_id'],
    },
  },
  {
    name: 'memforge_shared_procedures',
    description: 'List active procedures shared in a pool, ranked by confidence and corroboration. Use to discover what condition→action rules other agents have learned.',
    inputSchema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'Pool ID to query' },
        q: { type: 'string', description: 'Optional text filter on condition or action' },
        limit: { type: 'number', description: 'Max results (default 50, max 200)', minimum: 1, maximum: 200 },
      },
      required: ['pool_id'],
    },
  },
  {
    name: 'memforge_expertise',
    description: 'Discover which pool members know the most about a topic. Returns agents ranked by relevance score with sample matching memories. Use to route questions to the right agent.',
    inputSchema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'Pool to search across' },
        q: { type: 'string', description: 'Topic or question to match against agent memories' },
        limit: { type: 'number', description: 'Max agents to return (default 10, max 50)', minimum: 1, maximum: 50 },
      },
      required: ['pool_id', 'q'],
    },
  },
  {
    name: 'memforge_declare_role',
    description: 'Declare an expertise domain for an agent. Roles are used by expertise discovery and for routing queries in multi-agent systems. Upserts on (agent_id, domain).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent to declare the role for' },
        domain: { type: 'string', description: 'Domain name (e.g. "security", "frontend", "person")' },
        confidence: { type: 'number', description: 'Confidence in this role (0–1)', minimum: 0, maximum: 1 },
        description: { type: 'string', description: 'Human-readable description of the role' },
      },
      required: ['agent_id', 'domain'],
    },
  },
  {
    name: 'memforge_roles',
    description: 'Get all declared expertise roles for an agent, ordered by confidence. Includes both manually declared and auto-detected roles.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'memforge_detect_roles',
    description: 'Auto-detect expertise roles from an agent\'s knowledge graph and active procedures. Updates or creates role entries with auto_detected=true.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent/session identifier' },
      },
      required: ['agent_id'],
    },
  },
];

// ─── Input Validation ────────────────────────────────────────────────────────

const AGENT_ID_RE = /^[\w.@:=-]+$/;

// Tools that use pool_id as primary key instead of agent_id
const POOL_ONLY_TOOLS = new Set(['memforge_shared_procedures', 'memforge_expertise']);

function validateToolArgs(name: string, args: Record<string, unknown>): void {
  // agent_id: required for agent-scoped tools
  if (!POOL_ONLY_TOOLS.has(name)) {
    const agentId = args['agent_id'];
    if (typeof agentId !== 'string' || agentId.length < 1 || agentId.length > 256 || !AGENT_ID_RE.test(agentId)) {
      throw new Error('agent_id must be a string of 1-256 characters matching /^[\\w.@:=-]+$/');
    }
  }

  // q param: string, max 10000 chars
  if ('q' in args && args['q'] !== undefined) {
    if (typeof args['q'] !== 'string' || args['q'].length > 10000) {
      throw new Error('q must be a string of at most 10000 characters');
    }
  }

  // limit param: number, 1-200
  if ('limit' in args && args['limit'] !== undefined) {
    const limit = args['limit'];
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error('limit must be an integer between 1 and 200');
    }
  }

  // content param: string, max 100000 chars (100KB)
  if ('content' in args && args['content'] !== undefined) {
    if (typeof args['content'] !== 'string' || args['content'].length > 100000) {
      throw new Error('content must be a string of at most 100000 characters');
    }
  }

  // memforge_sleep tokenBudget: max 200000
  if (name === 'memforge_sleep' && 'token_budget' in args && args['token_budget'] !== undefined) {
    const tokenBudget = args['token_budget'];
    if (typeof tokenBudget !== 'number' || tokenBudget > 200000) {
      throw new Error('token_budget must be a number no greater than 200000');
    }
  }
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

async function executeTool(client: MemForgeClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  validateToolArgs(name, args);

  const agentId = args['agent_id'] as string;

  switch (name) {
    case 'memforge_add':
      return client.add(agentId, args['content'] as string, args['metadata'] as Record<string, unknown> | undefined, args['namespace'] as string | undefined);

    case 'memforge_query':
      return client.query(agentId, {
        q: args['q'] as string,
        limit: args['limit'] as number | undefined,
        mode: args['mode'] as 'keyword' | 'semantic' | 'hybrid' | undefined,
        namespace: args['namespace'] as string | undefined,
      });

    case 'memforge_timeline':
      return client.timeline(agentId, {
        from: args['from'] as string | undefined,
        to: args['to'] as string | undefined,
        limit: args['limit'] as number | undefined,
        namespace: args['namespace'] as string | undefined,
      });

    case 'memforge_entities':
      return client.searchEntities(agentId, {
        q: args['q'] as string | undefined,
        type: args['type'] as string | undefined,
        limit: args['limit'] as number | undefined,
      });

    case 'memforge_graph':
      return client.graphTraverse(agentId, args['entity'] as string, args['depth'] as number | undefined);

    case 'memforge_reflect':
      return client.reflect(agentId, { limit: args['limit'] as number | undefined });

    case 'memforge_reflections':
      return client.getReflections(agentId, args['limit'] as number | undefined);

    case 'memforge_consolidate':
      return client.consolidate(agentId, args['mode'] as 'concat' | 'summarize' | undefined, args['namespace'] as string | undefined);

    case 'memforge_procedures':
      return client.getProcedures(agentId, {
        q: args['q'] as string | undefined,
        limit: args['limit'] as number | undefined,
      });

    case 'memforge_sleep':
      return client.sleep(agentId, {
        tokenBudget: args['token_budget'] as number | undefined,
      });

    case 'memforge_health':
      return client.memoryHealth(agentId);

    case 'memforge_stats':
      return client.stats(agentId, args['namespace'] as string | undefined);

    case 'memforge_feedback':
      return client.feedback(agentId, args['retrieval_ids'] as number[], args['outcome'] as 'positive' | 'negative' | 'neutral');

    case 'memforge_meta_reflect':
      return client.metaReflect(agentId, args['limit'] as number | undefined);

    case 'memforge_dedup_entities':
      return client.deduplicateEntities(agentId, args['threshold'] as number | undefined);

    case 'memforge_active_recall':
      return client.activeRecall(agentId, args['context'] as string, args['limit'] as number | undefined);

    case 'memforge_cold_search':
      return client.searchColdTier(agentId, {
        q: args['q'] as string | undefined,
        namespace: args['namespace'] as string | undefined,
        from: args['from'] as string | undefined,
        to: args['to'] as string | undefined,
        sourceTable: args['source_table'] as 'hot_tier' | 'warm_tier' | undefined,
        limit: args['limit'] as number | undefined,
        offset: args['offset'] as number | undefined,
      });

    case 'memforge_cold_restore':
      return client.restoreColdTier(agentId, args['cold_id'] as string, {
        namespace: args['namespace'] as string | undefined,
      });

    case 'memforge_sleep_advisory':
      return client.sleepAdvisory(agentId);

    case 'memforge_publish_procedures':
      return client.publishProcedures(agentId, args['pool_id'] as string, {
        minConfidence: args['min_confidence'] as number | undefined,
        namespace: args['namespace'] as string | undefined,
      });

    case 'memforge_shared_procedures':
      return client.getSharedProcedures(args['pool_id'] as string, {
        q: args['q'] as string | undefined,
        limit: args['limit'] as number | undefined,
      });

    case 'memforge_expertise':
      return client.expertiseDiscovery(args['pool_id'] as string, args['q'] as string, {
        limit: args['limit'] as number | undefined,
      });

    case 'memforge_declare_role':
      return client.declareRole(agentId, args['domain'] as string, {
        confidence: args['confidence'] as number | undefined,
        description: args['description'] as string | undefined,
      });

    case 'memforge_roles':
      return client.getRoles(agentId);

    case 'memforge_detect_roles':
      return client.autoDetectRoles(agentId);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP stdio transport ─────────────────────────────────────────────────────

function send(msg: MCPResponse): void {
  const json = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

async function handleRequest(client: MemForgeClient, req: MCPRequest): Promise<void> {
  switch (req.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'memforge', version: VERSION },
        },
      });
      break;

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: TOOLS },
      });
      break;

    case 'tools/call': {
      const toolName = (req.params?.['name'] ?? '') as string;
      const toolArgs = (req.params?.['arguments'] ?? {}) as Record<string, unknown>;

      try {
        const result = await executeTool(client, toolName, toolArgs);
        send({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        send({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      send({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new MemForgeClient();

  let buffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;

    // Parse Content-Length framed messages
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1]!, 10);
      const bodyStart = headerEnd + 4;

      if (buffer.length < bodyStart + contentLength) break;

      const body = buffer.slice(bodyStart, bodyStart + contentLength);
      buffer = buffer.slice(bodyStart + contentLength);

      try {
        const req = JSON.parse(body) as MCPRequest;
        void handleRequest(client, req);
      } catch {
        // Skip malformed messages
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
}

main().catch((err) => {
  process.stderr.write(`[memforge-mcp] Fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
