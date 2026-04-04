// MemForge — LLM Safety Layer
//
// Wraps any LLMProvider with:
//   1. Pre-LLM content sanitization (classify + redact before sending)
//   2. External provider warnings (log when content leaves local boundary)
//   3. Configurable routing (local-only for sensitive operations by default)

import type { LLMProvider, ConsolidationSummary } from './llm.js';
import type { ClassifierRegistry } from './classifier.js';
import { sanitizeForLLM } from './classifier.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type LLMLocality = 'local' | 'remote';

export interface SafeLLMConfig {
  /** The underlying LLM provider */
  provider: LLMProvider;
  /** Whether this provider is local (Ollama) or remote (Anthropic, OpenAI) */
  locality: LLMLocality;
  /** Classifier registry for pre-LLM sanitization */
  classifierRegistry: ClassifierRegistry;
  /** Whether to sanitize content before sending to LLM (default: true) */
  sanitize?: boolean;
  /** Whether to allow remote LLMs (default: false — local only) */
  allowRemote?: boolean;
  /** Called when content is about to be sent to a remote LLM */
  onRemoteWarning?: (model: string, operation: string) => void;
}

// ─── Default Warning ────────────────────────────────────────────────────────────

function defaultRemoteWarning(model: string, operation: string): void {
  console.warn(
    `[memforge:security] WARNING: Memory content is being sent to external LLM provider ` +
    `(model=${model}, operation=${operation}). This data leaves your infrastructure. ` +
    `Set LLM_PROVIDER=ollama to keep memory processing local. ` +
    `See THREAT_MODEL.md §1 "Data Exfiltration via LLM Providers" for risks.`,
  );
}

// ─── Safe LLM Provider ─────────────────────────────────────────────────────────

/**
 * Wraps an LLMProvider with content sanitization and locality enforcement.
 *
 * By default:
 *   - All content is classified and redacted before reaching the LLM
 *   - Remote LLMs are blocked (set allowRemote=true to override)
 *   - A warning is logged every time content is sent to a remote provider
 */
export class SafeLLMProvider implements LLMProvider {
  private readonly provider: LLMProvider;
  private readonly locality: LLMLocality;
  private readonly registry: ClassifierRegistry;
  private readonly shouldSanitize: boolean;
  private readonly remoteAllowed: boolean;
  private readonly onRemote: (model: string, operation: string) => void;
  private remoteWarningIssued = false;

  constructor(config: SafeLLMConfig) {
    this.provider = config.provider;
    this.locality = config.locality;
    this.registry = config.classifierRegistry;
    this.shouldSanitize = config.sanitize !== false;
    this.remoteAllowed = config.allowRemote === true;
    this.onRemote = config.onRemoteWarning ?? defaultRemoteWarning;
  }

  get model(): string {
    return this.provider.model;
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    this.checkLocality('chat');
    const sanitizedUser = this.shouldSanitize
      ? sanitizeForLLM(this.registry, userPrompt).sanitized
      : userPrompt;
    return this.provider.chat(systemPrompt, sanitizedUser);
  }

  async summarize(rawContent: string, agentContext?: string): Promise<ConsolidationSummary> {
    this.checkLocality('summarize');
    const sanitizedContent = this.shouldSanitize
      ? sanitizeForLLM(this.registry, rawContent).sanitized
      : rawContent;
    const sanitizedContext = agentContext && this.shouldSanitize
      ? sanitizeForLLM(this.registry, agentContext).sanitized
      : agentContext;
    return this.provider.summarize(sanitizedContent, sanitizedContext);
  }

  private checkLocality(operation: string): void {
    if (this.locality === 'remote') {
      if (!this.remoteAllowed) {
        throw new Error(
          `[memforge:security] Blocked: operation "${operation}" would send memory content to external LLM ` +
          `(model=${this.provider.model}). Set ALLOW_REMOTE_LLM=true to override, or use LLM_PROVIDER=ollama. ` +
          `See THREAT_MODEL.md for risks.`,
        );
      }
      // Warn on first remote call, then periodically (not every call)
      if (!this.remoteWarningIssued) {
        this.onRemote(this.provider.model, operation);
        this.remoteWarningIssued = true;
      }
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

/**
 * Determine locality of an LLM provider based on its type.
 * Ollama is local, everything else is remote.
 */
export function getProviderLocality(providerType: string): LLMLocality {
  return providerType === 'ollama' ? 'local' : 'remote';
}

/**
 * Wrap an LLM provider with safety controls.
 * Returns null if provider is null.
 */
export function wrapLLMProvider(
  provider: LLMProvider | null,
  providerType: string,
  registry: ClassifierRegistry,
  allowRemote = false,
): LLMProvider | null {
  if (!provider) return null;

  return new SafeLLMProvider({
    provider,
    locality: getProviderLocality(providerType),
    classifierRegistry: registry,
    sanitize: true,
    allowRemote,
  });
}
