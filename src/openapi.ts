// MemForge — OpenAPI 3.0 specification
//
// Extracted from server.ts for maintainability.

import { VERSION } from './version.js';

export function buildOpenApiSpec(port: number): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'MemForge Memory API',
      version: VERSION,
      description:
        'Tiered agent memory service with hot/warm/cold PostgreSQL storage, vector search, temporal intelligence, knowledge graph, reflection, and Redis caching.',
    },
    servers: [{ url: `http://localhost:${port}`, description: 'Local' }],
    tags: [
      { name: 'Memory', description: 'Agent memory operations' },
      { name: 'Dreams', description: 'Async sleep-cycle jobs (MemForge native)' },
      { name: 'DreamsCompat', description: 'Anthropic Dreams API drop-in (/v1/dreams)' },
      { name: 'AnthropicBridge', description: 'Bidirectional sync with Anthropic Memory Stores' },
      { name: 'System', description: 'Health and observability' },
      { name: 'Admin', description: 'Administrative endpoints' },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      ts: { type: 'string', format: 'date-time' },
                      embeddings: { type: 'boolean', description: 'Whether vector search is available' },
                      summarization: { type: 'boolean', description: 'Whether LLM summarization is available' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/metrics': {
        get: {
          summary: 'Prometheus metrics',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Prometheus text format metrics',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
          },
        },
      },
      '/memory/{agentId}/add': {
        post: {
          summary: 'Add memory event to hot tier',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'X-Memforge-Namespace', in: 'header', required: false, schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Fallback for body.namespace; body wins if both are present.' },
            { name: 'X-Memforge-Session-Id', in: 'header', required: false, schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Per-device session identifier; isolates this device\'s in-flight events from other concurrent devices sharing the same agent_id.' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content: { type: 'string', description: 'Memory content to store' },
                    metadata: { type: 'object', additionalProperties: true },
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Memory namespace (default: "default")' },
                    session_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Per-device session identifier (default: "default")' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Memory added', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/query': {
        get: {
          summary: 'Search warm tier memory (keyword, semantic, or hybrid)',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Search query' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 10 } },
            { name: 'mode', in: 'query', schema: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'] }, description: 'Search mode (default: hybrid if embeddings enabled, keyword otherwise)' },
            { name: 'after', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Only return memories after this timestamp' },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Only return memories before this timestamp' },
            { name: 'decay', in: 'query', schema: { type: 'number', minimum: 0 }, description: 'Temporal decay rate per hour (0 = no decay)' },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Memory namespace (default: "default")' },
          ],
          responses: {
            '200': { description: 'Search results with rank scores', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/timeline': {
        get: {
          summary: 'Retrieve memories in chronological order',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start of time range' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'End of time range' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Memory namespace (default: "default")' },
          ],
          responses: {
            '200': { description: 'Chronologically ordered memories', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/entities': {
        get: {
          summary: 'Search knowledge graph entities',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search entity names (case-insensitive contains)' },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Filter by entity type (person, system, organization, concept, etc.)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 20 } },
          ],
          responses: {
            '200': { description: 'Matching entities with linked memory IDs', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/graph': {
        get: {
          summary: 'Traverse knowledge graph from an entity',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'entity', in: 'query', required: true, schema: { type: 'string' }, description: 'Starting entity name' },
            { name: 'depth', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5, default: 2 }, description: 'Traversal depth (max 5)' },
          ],
          responses: {
            '200': { description: 'Graph with nodes and edges', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/reflect': {
        post: {
          summary: 'Trigger reflection — LLM synthesizes insights from recent memories',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    trigger: { type: 'string', enum: ['manual', 'threshold', 'scheduled'], description: 'What triggered this reflection (default: manual)' },
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Max warm-tier rows to review' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Reflection result with insight/contradiction counts', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/reflections': {
        get: {
          summary: 'Retrieve stored reflections (newest first)',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          ],
          responses: {
            '200': { description: 'Reflections with insights, contradictions, and source memory links', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/consolidate': {
        post: {
          summary: 'Trigger hot→warm memory consolidation (concat or LLM summarize)',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'X-Memforge-Namespace', in: 'header', required: false, schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Fallback for body.namespace.' },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string', enum: ['concat', 'summarize'], description: 'Consolidation mode (default: from server config)' },
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Source memory namespace to consolidate from (default: "default")' },
                    target_namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Override the warm-tier target namespace. Defaults from WARM_CONSOLIDATION_TARGET env (or echoes namespace if unset). Set to "shared" for cross-project propagation.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Consolidation result including mode used and extraction metadata', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/stats': {
        get: {
          summary: 'Get memory tier statistics for an agent (cached 5 min)',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Scope stats to this namespace; omit for overall stats' },
          ],
          responses: {
            '200': { description: 'Memory stats', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '404': { '$ref': '#/components/responses/NotFound' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/feedback': {
        post: {
          summary: 'Record outcome feedback for retrieved memories',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['retrieval_ids', 'outcome'],
                  properties: {
                    retrieval_ids: { type: 'array', items: { type: 'integer' }, description: 'Retrieval log IDs' },
                    outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                    metadata: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Feedback recorded', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/meta-reflect': {
        post: {
          summary: 'Trigger meta-reflection — synthesize higher-order insights from reflections',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    limit: { type: 'integer', minimum: 3, maximum: 50, default: 10 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Meta-reflection result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/dedup-entities': {
        post: {
          summary: 'Detect and merge duplicate entities in the knowledge graph',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    threshold: { type: 'number', minimum: 0.3, maximum: 1.0, default: 0.7, description: 'Trigram similarity threshold' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Dedup result with merge count', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/active-recall': {
        post: {
          summary: 'Proactively surface relevant memories and procedures for a planned action',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['context'],
                  properties: {
                    context: { type: 'string', description: 'What the agent is about to do' },
                    limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Relevant memories and procedures', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/sleep': {
        post: {
          summary: 'Trigger a sleep cycle — scores, evicts, revises memory',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tokenBudget: { type: 'integer', description: 'Max LLM tokens (default 100000)' },
                    evictionThreshold: { type: 'number' },
                    revisionThreshold: { type: 'number' },
                    includeReflection: { type: 'boolean' },
                    instructions: { type: 'string', maxLength: 4096, description: 'v3.6+ — free-text guidance plumbed into Phase 3 (Revision) prompt.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Sleep cycle result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/dreams': {
        post: {
          summary: 'Enqueue a dream run (async sleep cycle, Claude Dreaming-compatible)',
          tags: ['Dreams'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' },
                    session_ids: {
                      type: 'array',
                      items: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' },
                      maxItems: 100,
                      description: 'Hard cap 100 (matches Anthropic Dreams).',
                    },
                    model: { type: 'string', maxLength: 128 },
                    instructions: { type: 'string', maxLength: 4096 },
                    source: { type: 'string', enum: ['local', 'anthropic'], description: 'local (default) or anthropic (Service layer required).' },
                    output_mode: { type: 'string', enum: ['in_place', 'new_namespace'], description: 'in_place is default; new_namespace is currently rejected (requires namespace-scoped sleep — tracked).' },
                    sleep: {
                      type: 'object',
                      properties: {
                        tokenBudget: { type: 'integer' },
                        evictionThreshold: { type: 'number' },
                        revisionThreshold: { type: 'number' },
                        includeReflection: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '202': {
              description: 'Dream run enqueued (status=pending). Location header carries the run URL.',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } },
              headers: {
                Location: { schema: { type: 'string' }, description: 'URL of the created dream run.' },
              },
            },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
        get: {
          summary: 'List dream runs for an agent',
          tags: ['Dreams'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'canceled'] } },
            { name: 'source', in: 'query', schema: { type: 'string', enum: ['local', 'anthropic', 'bridge_pull', 'bridge_push'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          ],
          responses: {
            '200': { description: 'List of dream runs with total count', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/dreams/{runId}': {
        get: {
          summary: 'Fetch a dream run by id',
          tags: ['Dreams'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'runId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Dream run detail', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '404': { '$ref': '#/components/responses/NotFound' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/dreams/{runId}/cancel': {
        post: {
          summary: 'Cancel a dream run (pending → canceled, running → exits at next phase boundary)',
          tags: ['Dreams'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'runId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Updated dream run', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '404': { '$ref': '#/components/responses/NotFound' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/v1/dreams': {
        post: {
          summary: 'Drop-in Anthropic Dreams API: enqueue a dream',
          description: "Mirrors Anthropic's POST /v1/dreams (managed-agents-2026-04-01, dreaming-2026-04-21). `memory_store_id` is treated as the MemForge `agent_id`. Returns 200 + dream object, matching the Anthropic SDK shape so callers can swap base URLs.",
          tags: ['DreamsCompat'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['memory_store_id', 'model'],
                  properties: {
                    memory_store_id: { type: 'string', minLength: 1, maxLength: 256 },
                    session_ids: { type: 'array', items: { type: 'string' }, maxItems: 100 },
                    model: { type: 'string', maxLength: 128 },
                    instructions: { type: 'string', maxLength: 4096 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Dream object (Anthropic shape)' },
            '400': { description: 'Invalid request (Anthropic error envelope)' },
            '500': { description: 'API error' },
          },
        },
      },
      '/v1/dreams/{dreamId}': {
        get: {
          summary: 'Drop-in Anthropic Dreams API: fetch a dream',
          tags: ['DreamsCompat'],
          parameters: [
            { name: 'dreamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Dream object (Anthropic shape)' },
            '404': { description: 'Dream not found' },
            '500': { description: 'API error' },
          },
        },
      },
      '/v1/dreams/{dreamId}/cancel': {
        post: {
          summary: 'Drop-in Anthropic Dreams API: cancel a dream',
          tags: ['DreamsCompat'],
          parameters: [
            { name: 'dreamId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Updated dream object' },
            '404': { description: 'Dream not found' },
            '500': { description: 'API error' },
          },
        },
      },
      '/memory/{agentId}/anthropic/push': {
        post: {
          summary: 'Bridge: export warm-tier rows to an Anthropic Memory Store',
          tags: ['AnthropicBridge'],
          parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' },
                    limit: { type: 'integer', minimum: 1, maximum: 5000 },
                    external_store_id: { type: 'string', description: 'Existing memory store id; omit to create new.' },
                    metadata: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Link record', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/anthropic/pull': {
        post: {
          summary: 'Bridge: import records from an Anthropic Memory Store',
          tags: ['AnthropicBridge'],
          parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['external_store_id'],
                  properties: {
                    external_store_id: { type: 'string', minLength: 1, maxLength: 256 },
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' },
                    strategy: { type: 'string', enum: ['memforge-wins', 'anthropic-wins', 'merge'], default: 'anthropic-wins' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Link record', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/anthropic/sync-state': {
        get: {
          summary: 'Bridge: report current sync state with drift indicator',
          tags: ['AnthropicBridge'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' } },
          ],
          responses: {
            '200': { description: 'Sync state', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/resume': {
        get: {
          summary: 'Generate session resumption context',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 5 } },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Memory namespace (default: "default")' },
          ],
          responses: {
            '200': { description: 'Resumption context', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/export': {
        get: {
          summary: 'Export agent memory as JSONL',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Scope export to this namespace (default: all namespaces)' },
          ],
          responses: {
            '200': { description: 'JSONL export', content: { 'application/x-ndjson': { schema: { type: 'string' } } } },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/import': {
        post: {
          summary: 'Import JSONL into agent memory',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    lines: { type: 'array', items: { type: 'string' }, description: 'JSONL lines to import' },
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Fallback namespace for records without one (default: "default")' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Import result', content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } } },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/cold': {
        get: {
          summary: 'Search cold tier (archived memories)',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Substring match on content (case-insensitive)' },
            { name: 'namespace', in: 'query', schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$' }, description: 'Filter by namespace (default: "default")' },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter archived_at >= from' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter archived_at <= to' },
            { name: 'source_table', in: 'query', schema: { type: 'string', enum: ['hot_tier', 'warm_tier'] }, description: 'Filter by source table' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Rows to skip for pagination' },
          ],
          responses: {
            '200': {
              description: 'Matching cold tier rows with total count for pagination',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } },
            },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/restore': {
        post: {
          summary: 'Restore a cold tier row to warm tier',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cold_id'],
                  properties: {
                    cold_id: { oneOf: [{ type: 'string', pattern: '^\\d+$' }, { type: 'integer', minimum: 1 }], description: 'cold_tier row id to restore' },
                    namespace: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*$', description: 'Override namespace on restore (defaults to cold row\'s original namespace)' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'New warm_tier row id and restored content',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/OkResponse' } } },
            },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '404': { '$ref': '#/components/responses/NotFound' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/sleep/advisory': {
        get: {
          summary: 'Get adaptive sleep advisory — advisory only, MemForge has no built-in scheduler',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Sleep advisory with urgency, reason, and individual signals. Callers decide whether to act.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          agent_id: { type: 'string' },
                          recommended: { type: 'boolean', description: 'true when urgency is medium or high' },
                          urgency: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
                          reason: { type: 'string', description: 'One-line summary ≤120 chars' },
                          signals: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                value: { type: 'number' },
                                threshold: { type: 'number' },
                                urgency: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
                                description: { type: 'string' },
                              },
                            },
                          },
                          last_sleep_at: { type: 'string', format: 'date-time', nullable: true },
                          hot_tier_count: { type: 'integer' },
                          warm_tier_count: { type: 'integer' },
                          time_since_last_sleep_ms: { type: 'integer', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/epistemic': {
        get: {
          summary: 'Get epistemic confidence profile — memory counts per uncertainty level',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Counts of warm-tier memories per epistemic_status. All five values are always present.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          established: { type: 'integer', description: 'Corroborated by multiple retrievals across sessions' },
                          provisional: { type: 'integer', description: 'Accepted but not yet confirmed (default for new memories)' },
                          contested: { type: 'integer', description: 'Contradicted by a conflicting memory' },
                          deprecated: { type: 'integer', description: 'Superseded or stale; retained for audit' },
                          inferred: { type: 'integer', description: 'Derived by the sleep cycle, not directly observed' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '401': { description: 'Unauthorized' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/pool/{poolId}/procedures/publish/{agentId}': {
        post: {
          summary: 'Publish agent procedures to a shared pool',
          tags: ['Pools'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'poolId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    min_confidence: { type: 'number', description: 'Minimum confidence threshold (default 0)', minimum: 0, maximum: 1 },
                    namespace: { type: 'string', description: 'Namespace to filter procedures (default: "default")' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Number of procedures published' },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '403': { description: 'Agent is not a pool member' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/pool/{poolId}/procedures': {
        get: {
          summary: 'List procedures shared in a pool',
          tags: ['Pools'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'poolId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { description: 'Array of shared procedures' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/pool/{poolId}/expertise': {
        get: {
          summary: 'Discover which pool members know the most about a topic',
          tags: ['Pools'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'poolId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
          ],
          responses: {
            '200': { description: 'Agents ranked by relevance score with sample memories' },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/roles': {
        get: {
          summary: 'Get all expertise roles for an agent',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Array of agent roles' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
        post: {
          summary: 'Declare or update an expertise role for an agent',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['domain'],
                  properties: {
                    domain: { type: 'string', description: 'Domain name (1–128 chars)' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    description: { type: 'string', maxLength: 1000 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Created or updated role' },
            '400': { '$ref': '#/components/responses/BadRequest' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/roles/{domain}': {
        delete: {
          summary: 'Delete an expertise role from an agent',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'domain', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Deletion result' },
            '404': { '$ref': '#/components/responses/NotFound' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/roles/detect': {
        post: {
          summary: 'Auto-detect expertise roles from knowledge graph and procedures',
          tags: ['Memory'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Array of detected roles' },
            '500': { '$ref': '#/components/responses/InternalError' },
          },
        },
      },
      '/memory/{agentId}/{warmId}/validity': {
        post: {
          summary: 'Set or clear validity window on a warm-tier memory',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'warmId', in: 'path', required: true, schema: { type: 'string' }, description: 'warm_tier row id' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    valid_until: { type: 'string', format: 'date-time', nullable: true, description: 'ISO-8601 expiry; null to clear' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Updated result { updated: boolean }' },
            '404': { '$ref': '#/components/responses/NotFound' },
          },
        },
      },
      '/memory/{agentId}/procedures/{procId}/outcome': {
        post: {
          summary: 'Record a procedure outcome',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'procId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['outcome'],
                  properties: {
                    outcome: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Outcome recorded' },
            '404': { '$ref': '#/components/responses/NotFound' },
          },
        },
      },
      '/memory/{agentId}/drift': {
        get: {
          summary: 'Drift-detection report based on recent drift_signals',
          tags: ['Memory'],
          parameters: [
            { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Drift report with trend classification',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      agent_id: { type: 'string' },
                      drift_detected: { type: 'boolean' },
                      trend: { type: 'string', enum: ['stable', 'degrading', 'recovering', 'insufficient_data'] },
                      latest: { type: 'object', nullable: true },
                      signals: {
                        type: 'object',
                        properties: {
                          contradiction_rate_trend: { type: 'number' },
                          staleness_trend: { type: 'number' },
                          revision_velocity_trend: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/admin/cache/stats': {
        get: {
          summary: 'Cache statistics (admin)',
          tags: ['Admin'],
          responses: { '200': { description: 'Cache hit/miss stats + Redis info' } },
        },
      },
      '/admin/cache/clear': {
        post: {
          summary: 'Flush cache (admin)',
          tags: ['Admin'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agentId: { type: 'string', description: 'Flush only this agent (omit to flush all)' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Flush result' } },
        },
      },
      '/admin/config/reload': {
        post: {
          summary: 'Hot-reload operational config knobs without restart (admin)',
          tags: ['Admin'],
          description: 'Re-reads an allowlisted set of config keys (WARM_CONSOLIDATION_TARGET, CONSOLIDATION_MODE, ENABLE_LLM_RERANK, ENABLE_LLM_INGEST, and consolidation/retrieval tuning knobs). Without overrides, re-reads process.env. With overrides, only the listed keys are updated. Static infrastructure (DATABASE_URL, port, ADMIN_TOKEN, audit HMAC) is intentionally not in the allowlist.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    overrides: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      description: 'Optional explicit overrides keyed by allowlisted env var name.',
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Reload summary including changed keys' } },
        },
      },
    },
    components: {
      schemas: {
        OkResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
            data: { description: 'Response payload' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Bad request',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
        },
        InternalError: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  };
}
