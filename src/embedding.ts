// MemForge — Embedding provider abstraction
//
// Pluggable interface for generating vector embeddings.
// Ships with OpenAI-compatible, Ollama, and no-op providers.

export interface EmbeddingProvider {
  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts in a single call. */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** The dimensionality of vectors this provider produces. */
  readonly dimensions: number;
}

// ─── OpenAI-compatible provider ──────────────────────────────────────────────

export interface OpenAIEmbeddingConfig {
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

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env['OPENAI_API_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
    this.model = config.model ?? process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small';
    this.dimensions = config.dimensions ?? parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10);

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

export interface OllamaEmbeddingConfig {
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

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? process.env['EMBEDDING_MODEL'] ?? 'nomic-embed-text';
    this.dimensions = config.dimensions ?? parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '768', 10);
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

// ─── No-op provider (embeddings disabled) ────────────────────────────────────

export class NoOpEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 0;

  async embed(_text: string): Promise<number[]> {
    return [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export type EmbeddingProviderType = 'openai' | 'ollama' | 'none';

export function createEmbeddingProvider(type?: EmbeddingProviderType): EmbeddingProvider {
  const resolved = type ?? (process.env['EMBEDDING_PROVIDER'] as EmbeddingProviderType | undefined) ?? 'none';

  switch (resolved) {
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'ollama':
      return new OllamaEmbeddingProvider();
    case 'none':
      return new NoOpEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding provider: ${resolved}`);
  }
}
