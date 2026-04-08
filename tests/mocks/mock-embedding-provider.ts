import type { EmbeddingProvider } from '../../src/embedding.js';

/**
 * Deterministic mock embedding provider for testing semantic/hybrid search.
 * Uses a simple hash function to produce consistent vectors for the same input.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 3;
  embedCalls: string[] = [];

  async embed(text: string): Promise<number[]> {
    this.embedCalls.push(text);
    return this.deterministicVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private deterministicVector(text: string): number[] {
    let h = 0;
    for (const c of text) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    const a = Math.sin(h) * 0.5 + 0.5;
    const b = Math.cos(h) * 0.5 + 0.5;
    const c = Math.sin(h * 2) * 0.5 + 0.5;
    const norm = Math.sqrt(a * a + b * b + c * c) || 1;
    return [a / norm, b / norm, c / norm];
  }

  reset(): void {
    this.embedCalls = [];
  }
}
