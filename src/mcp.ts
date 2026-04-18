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
];

// ─── Input Validation ────────────────────────────────────────────────────────

const AGENT_ID_RE = /^[\w.@:=-]+$/;

function validateToolArgs(name: string, args: Record<string, unknown>): void {
  // agent_id: required string, 1-256 chars, safe pattern
  const agentId = args['agent_id'];
  if (typeof agentId !== 'string' || agentId.length < 1 || agentId.length > 256 || !AGENT_ID_RE.test(agentId)) {
    throw new Error('agent_id must be a string of 1-256 characters matching /^[\\w.@:=-]+$/');
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
