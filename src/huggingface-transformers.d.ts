// Ambient declaration for the optional `@huggingface/transformers` dependency.
//
// Why this exists: `npm run build` is a plain `tsc`, but the only import of
// this package (src/embedding.ts, LocalEmbeddingProvider.getPipeline) is a
// dynamic import of an *optional* dependency. When an environment installs
// without optional deps — which CI does intermittently, since the package
// pulls platform-specific native artifacts — module resolution fails and the
// build dies with TS2307 even though nothing about the source changed. That
// made Build a coin-flip job rather than a signal.
//
// Declaring the module here decouples compilation from whether the optional
// package happens to be on disk. The declaration is deliberately minimal: it
// describes only the single factory the codebase calls, and returns `unknown`
// because embedding.ts already defines its own `FeatureExtractionPipeline`
// shape and casts to it. We therefore depend on none of the upstream types,
// and shadowing them when the package *is* installed costs us nothing.

declare module '@huggingface/transformers' {
  /**
   * Model factory. Returns the loaded pipeline as `unknown` — callers cast to
   * the local structural type they actually rely on.
   */
  export function pipeline(
    task: string,
    model: string,
    options?: { dtype?: string },
  ): Promise<unknown>;
}
