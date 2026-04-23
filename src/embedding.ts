// MemForge — Embedding provider abstraction
//
// Pluggable interface for generating vector embeddings.
// Ships with OpenAI-compatible, Ollama, and no-op providers.

import { validateProviderUrl } from './schemas.js';

export interface EmbeddingProvider {
  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts in a single call. */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** The dimensionality of vectors this provider produces. */
  readonly dimensions: number;

  /**
   * Stable identifier of the embedding model producing these vectors,
   * written to warm_tier.embedding_model alongside each row. The format is
   * `<provider>/<model>` (e.g. 'openai/text-embedding-3-small',
   * 'ollama/nomic-embed-text', 'huggingface/Xenova/bge-small-en-v1.5').
   * Empty string signals "not applicable" (NoOp).
   */
  readonly modelId: string;
}

// ─── OpenAI-compatible provider ──────────────────────────────────────────────

interface OpenAIEmbeddingConfig {
  /** API base URL (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** API key — falls back to OPENAI_API_KEY env var */
  apiKey?: string;
  /** Model name (default: text-embedding-3-small) */
  model?: string;
  /** Vector dimensions (default: 1536) */
  dimensions?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  readonly dimensions: number;
  readonly modelId: string;

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.baseUrl = validateProviderUrl(config.baseUrl ?? process.env['OPENAI_API_BASE_URL'] ?? 'https://api.openai.com/v1', 'OpenAI Embedding');
    this.apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = config.model ?? process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
    this.dimensions = config.dimensions ?? parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10);
    this.modelId = `openai/${this.model}`;

    if (!this.apiKey) {
      throw new Error('OpenAI API key required — set OPENAI_API_KEY or pass apiKey in config');
    }
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // API may return results out of order — sort by index
    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

// ─── Ollama provider ─────────────────────────────────────────────────────────

interface OllamaEmbeddingConfig {
  /** Ollama API base URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Model name (default: nomic-embed-text) */
  model?: string;
  /** Vector dimensions — must match the model's output dimensions */
  dimensions?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  readonly dimensions: number;
  readonly modelId: string;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.baseUrl = validateProviderUrl(config.baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434', 'Ollama Embedding', true);
    this.model = config.model ?? process.env['EMBEDDING_MODEL'] ?? 'nomic-embed-text';
    this.dimensions = config.dimensions ?? parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '768', 10);
    this.modelId = `ollama/${this.model}`;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama embedding error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as { embeddings: number[][] };
    return json.embeddings[0]!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Ollama /api/embed supports batch input
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama embedding error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as { embeddings: number[][] };
    return json.embeddings;
  }
}

// ─── Local in-process provider (no external service) ────────────────────────
// Uses @huggingface/transformers (ONNX Runtime) for in-process embeddings.
// The package is the maintained successor of @xenova/transformers.
//
// Default: Xenova/bge-small-en-v1.5 (384 dim, 33MB, ~137 embeds/sec on CPU)
// Configurable via EMBEDDING_MODEL and EMBEDDING_DIMENSIONS env vars.
//
// Compatible models (any ONNX model on Hugging Face that supports feature-extraction):
//   Xenova/all-MiniLM-L6-v2       — 384 dim, 22MB, general-purpose
//   Xenova/all-MiniLM-L12-v2      — 384 dim, 33MB, higher quality
//   Xenova/bge-small-en-v1.5      — 384 dim, 33MB, strong retrieval (default)
//   Xenova/bge-base-en-v1.5       — 768 dim, 110MB, best quality
//   Xenova/nomic-embed-text-v1    — 768 dim, 135MB, matches Ollama nomic-embed-text
//   Xenova/gte-small              — 384 dim, 30MB, multilingual

interface LocalEmbeddingConfig {
  /** Model identifier — any Xenova/* ONNX model on Hugging Face (default: Xenova/bge-small-en-v1.5) */
  model?: string;
  /** Vector dimensions — must match the model's output (default: 384) */
  dimensions?: number;
  /** Weight quantization dtype ('q8' default, 'fp16', 'fp32', 'q4'). 'q8' matches prior @xenova quantized=true. */
  dtype?: 'q8' | 'fp16' | 'fp32' | 'q4';
}

/** Function signature for a @huggingface/transformers feature-extraction pipeline. */
type FeatureExtractionPipeline = (text: string, options: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly modelId: string;
  private readonly model: string;
  private readonly dtype: 'q8' | 'fp16' | 'fp32' | 'q4';
  private pipeline: FeatureExtractionPipeline | null = null;
  private loading: Promise<FeatureExtractionPipeline> | null = null;

  constructor(config: LocalEmbeddingConfig = {}) {
    // Default: bge-small-en-v1.5 — retrieval-optimized, 137 embeds/sec on CPU, best discrimination
    // Benchmarked against MiniLM-L6 (slower, weaker separation), MiniLM-L12, gte-small (poor separation)
    this.model = config.model ?? process.env['EMBEDDING_MODEL'] ?? 'Xenova/bge-small-en-v1.5';
    this.dimensions = config.dimensions ?? parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '384', 10);
    this.dtype = config.dtype ?? 'q8';
    // dtype is part of identity: re-quantizing the same base model produces
    // different vectors, so a dtype change must trigger re-embedding.
    this.modelId = `huggingface/${this.model}@${this.dtype}`;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) return this.pipeline;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      this.pipeline = await pipeline('feature-extraction', this.model, {
        dtype: this.dtype,
      }) as FeatureExtractionPipeline;
      return this.pipeline;
    })();

    return this.loading;
  }

  async embed(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // Process sequentially through single pipeline to avoid memory spikes
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

// ─── Concurrency-limited wrapper ────────────────────────────────────────────
// Wraps any embedding provider with a semaphore to prevent overwhelming
// external services under consolidation bursts.

export class ConcurrencyLimitedEmbeddingProvider implements EmbeddingProvider {
  private readonly inner: EmbeddingProvider;
  private readonly maxConcurrent: number;
  private running = 0;
  private readonly queue: Array<() => void> = [];
  readonly dimensions: number;
  readonly modelId: string;

  constructor(inner: EmbeddingProvider, maxConcurrent = 3) {
    this.inner = inner;
    this.maxConcurrent = maxConcurrent;
    this.dimensions = inner.dimensions;
    this.modelId = inner.modelId;
  }

  private async withLimit<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }

  async embed(text: string): Promise<number[]> {
    return this.withLimit(() => this.inner.embed(text));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.withLimit(() => this.inner.embedBatch(texts));
  }
}

// ─── No-op provider (embeddings disabled) ────────────────────────────────────

export class NoOpEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 0;
  readonly modelId = '';

  async embed(_text: string): Promise<number[]> {
    return [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export type EmbeddingProviderType = 'openai' | 'ollama' | 'local' | 'none';

export function createEmbeddingProvider(type?: EmbeddingProviderType): EmbeddingProvider {
  const resolved = type ?? (process.env['EMBEDDING_PROVIDER'] as EmbeddingProviderType | undefined) ?? 'none';
  const concurrencyLimit = parseInt(process.env['EMBEDDING_CONCURRENCY_LIMIT'] ?? '3', 10);

  let provider: EmbeddingProvider;
  switch (resolved) {
    case 'openai':
      provider = new OpenAIEmbeddingProvider();
      break;
    case 'ollama':
      provider = new OllamaEmbeddingProvider();
      break;
    case 'local':
      // LocalEmbeddingProvider runs in-process and controls its own concurrency
      return new LocalEmbeddingProvider();
    case 'none':
      return new NoOpEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding provider: ${resolved}. Valid options: openai, ollama, local, none`);
  }

  return new ConcurrencyLimitedEmbeddingProvider(provider, concurrencyLimit);
}
