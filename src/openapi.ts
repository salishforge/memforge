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
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string', enum: ['concat', 'summarize'], description: 'Consolidation mode (default: from server config)' },
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
