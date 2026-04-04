// MemForge — Content Classification and Redaction Engine
//
// Two interception points:
//   1. Ingest-time: classify + redact on add() before content reaches hot tier
//   2. Pre-LLM: sanitize content before any LLM call (consolidation, reflection, revision)
//
// Classification levels follow NIST FIPS 199:
//   PUBLIC       — no sensitive content detected
//   INTERNAL     — low-risk PII (email, phone) per NIST 800-122 "linkable"
//   CONFIDENTIAL — direct PII (name+context, financial accounts) per NIST 800-122 "linked"
//   RESTRICTED   — plaintext credentials, GDPR Art.9 special categories, SSN, PHI

// ─── Types ──────────────────────────────────────────────────────────────────────

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export type RedactionAction = 'none' | 'tag' | 'redact' | 'reject';

export interface Classification {
  /** What type of sensitive data was found */
  type: string;
  /** Sensitivity level (NIST FIPS 199 + GDPR Art.9) */
  sensitivity: Sensitivity;
  /** The matched text */
  match: string;
  /** Byte offset in content */
  offset: number;
  /** Confidence 0-1 (1.0 for regex, lower for heuristic) */
  confidence: number;
  /** Recommended action */
  action: RedactionAction;
}

export interface ClassificationResult {
  /** Highest sensitivity found */
  sensitivity: Sensitivity;
  /** All findings */
  findings: Classification[];
  /** Content after redaction (if any redactions applied) */
  redactedContent: string;
  /** Whether content was modified */
  wasRedacted: boolean;
}

export interface ContentClassifier {
  /** Unique name */
  readonly name: string;
  /** What this classifier detects */
  readonly description: string;
  /** Run classification */
  classify(content: string): Classification[];
}

// ─── Sensitivity Ordering ───────────────────────────────────────────────────

const SENSITIVITY_ORDER: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export function maxSensitivity(a: Sensitivity, b: Sensitivity): Sensitivity {
  return SENSITIVITY_ORDER[a] >= SENSITIVITY_ORDER[b] ? a : b;
}

// ─── Secret Pattern Classifier ──────────────────────────────────────────────
// Patterns sourced from GitLeaks (MIT license) and common credential formats.

interface PatternDef {
  id: string;
  pattern: RegExp;
  type: string;
  sensitivity: Sensitivity;
  action: RedactionAction;
}

const SECRET_PATTERNS: PatternDef[] = [
  // Anthropic
  { id: 'anthropic-api-key', pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, type: 'anthropic_api_key', sensitivity: 'restricted', action: 'redact' },
  // OpenAI
  { id: 'openai-api-key', pattern: /sk-[a-zA-Z0-9]{20,}/g, type: 'openai_api_key', sensitivity: 'restricted', action: 'redact' },
  // GitHub
  { id: 'github-pat', pattern: /ghp_[a-zA-Z0-9]{36,}/g, type: 'github_pat', sensitivity: 'restricted', action: 'redact' },
  { id: 'github-oauth', pattern: /gho_[a-zA-Z0-9]{36,}/g, type: 'github_oauth', sensitivity: 'restricted', action: 'redact' },
  { id: 'github-app', pattern: /ghu_[a-zA-Z0-9]{36,}/g, type: 'github_app_token', sensitivity: 'restricted', action: 'redact' },
  // AWS
  { id: 'aws-access-key', pattern: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, type: 'aws_access_key', sensitivity: 'restricted', action: 'redact' },
  // Private keys
  { id: 'private-key', pattern: /-----BEGIN\s+(RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/g, type: 'private_key', sensitivity: 'restricted', action: 'redact' },
  // Connection strings with credentials
  { id: 'postgres-uri', pattern: /postgresql?:\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, type: 'connection_string', sensitivity: 'restricted', action: 'redact' },
  { id: 'mongodb-uri', pattern: /mongodb(\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, type: 'connection_string', sensitivity: 'restricted', action: 'redact' },
  { id: 'redis-uri', pattern: /redis:\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, type: 'connection_string', sensitivity: 'restricted', action: 'redact' },
  // Generic bearer tokens (long alphanumeric strings after "Bearer")
  { id: 'bearer-token', pattern: /Bearer\s+[a-zA-Z0-9_\-.]{20,}/g, type: 'bearer_token', sensitivity: 'confidential', action: 'redact' },
  // Password assignments
  { id: 'password-assignment', pattern: /password\s*[:=]\s*['"][^'"]{4,}['"]/gi, type: 'password_literal', sensitivity: 'restricted', action: 'redact' },
  { id: 'secret-assignment', pattern: /secret\s*[:=]\s*['"][^'"]{4,}['"]/gi, type: 'secret_literal', sensitivity: 'restricted', action: 'redact' },
  // Slack tokens
  { id: 'slack-token', pattern: /xox[bpors]-[a-zA-Z0-9-]{10,}/g, type: 'slack_token', sensitivity: 'restricted', action: 'redact' },
  // Stripe
  { id: 'stripe-key', pattern: /[sr]k_(live|test)_[a-zA-Z0-9]{20,}/g, type: 'stripe_key', sensitivity: 'restricted', action: 'redact' },
  // JWT (detect but don't redact — may be intentional)
  { id: 'jwt', pattern: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, type: 'jwt', sensitivity: 'confidential', action: 'tag' },
];

export class SecretPatternClassifier implements ContentClassifier {
  readonly name = 'secrets';
  readonly description = 'Detects API keys, tokens, passwords, and connection strings (GitLeaks-derived patterns)';

  classify(content: string): Classification[] {
    const findings: Classification[] = [];
    for (const def of SECRET_PATTERNS) {
      // Reset regex lastIndex for global patterns
      def.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = def.pattern.exec(content)) !== null) {
        findings.push({
          type: def.type,
          sensitivity: def.sensitivity,
          match: match[0],
          offset: match.index,
          confidence: 1.0,
          action: def.action,
        });
      }
    }
    return findings;
  }
}

// ─── PII Pattern Classifier ────────────────────────────────────────────────
// Patterns inspired by Microsoft Presidio (Apache 2.0) recognizer model.
// Uses context words to boost confidence.

interface PIIPatternDef {
  id: string;
  pattern: RegExp;
  type: string;
  sensitivity: Sensitivity;
  baseConfidence: number;
  contextWords: string[];
  contextBoost: number;
}

const PII_PATTERNS: PIIPatternDef[] = [
  {
    id: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: 'ssn',
    sensitivity: 'restricted', baseConfidence: 0.5,
    contextWords: ['ssn', 'social security', 'social sec'],
    contextBoost: 0.45,
  },
  {
    id: 'ssn-dotted', pattern: /\b\d{3}\.\d{2}\.\d{4}\b/g, type: 'ssn',
    sensitivity: 'restricted', baseConfidence: 0.4,
    contextWords: ['ssn', 'social security'],
    contextBoost: 0.5,
  },
  {
    id: 'email', pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, type: 'email',
    sensitivity: 'internal', baseConfidence: 0.9,
    contextWords: ['email', 'e-mail', 'contact'],
    contextBoost: 0.1,
  },
  {
    id: 'credit-card-visa', pattern: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, type: 'credit_card',
    sensitivity: 'restricted', baseConfidence: 0.6,
    contextWords: ['card', 'visa', 'credit', 'payment', 'cc'],
    contextBoost: 0.35,
  },
  {
    id: 'credit-card-mc', pattern: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, type: 'credit_card',
    sensitivity: 'restricted', baseConfidence: 0.6,
    contextWords: ['card', 'mastercard', 'credit', 'payment', 'cc'],
    contextBoost: 0.35,
  },
  {
    id: 'phone-us', pattern: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, type: 'phone',
    sensitivity: 'internal', baseConfidence: 0.4,
    contextWords: ['phone', 'call', 'tel', 'mobile', 'cell', 'fax'],
    contextBoost: 0.4,
  },
  {
    id: 'phone-intl', pattern: /\b\+\d{1,3}[-.\s]?\d{4,14}\b/g, type: 'phone',
    sensitivity: 'internal', baseConfidence: 0.5,
    contextWords: ['phone', 'call', 'tel', 'mobile'],
    contextBoost: 0.3,
  },
  {
    id: 'iban', pattern: /\b[A-Z]{2}\d{2}\s?[\dA-Z]{4}\s?[\dA-Z]{4}\s?[\dA-Z]{4}(?:\s?[\dA-Z]{1,4}){0,5}\b/g, type: 'iban',
    sensitivity: 'confidential', baseConfidence: 0.7,
    contextWords: ['iban', 'bank', 'account', 'transfer'],
    contextBoost: 0.25,
  },
];

export class PIIPatternClassifier implements ContentClassifier {
  readonly name = 'pii';
  readonly description = 'Detects PII: SSN, email, credit cards, phone numbers, IBAN (Presidio-derived patterns with context boosting)';

  classify(content: string): Classification[] {
    const contentLower = content.toLowerCase();
    const findings: Classification[] = [];

    for (const def of PII_PATTERNS) {
      def.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = def.pattern.exec(content)) !== null) {
        // Context word boosting: check if any context word appears near the match
        const hasContext = def.contextWords.some((w) => contentLower.includes(w));
        const confidence = Math.min(1.0, def.baseConfidence + (hasContext ? def.contextBoost : 0));

        // Only report if confidence meets threshold
        if (confidence >= 0.5) {
          findings.push({
            type: def.type,
            sensitivity: def.sensitivity,
            match: match[0],
            offset: match.index,
            confidence,
            action: def.sensitivity === 'restricted' ? 'redact' : 'tag',
          });
        }
      }
    }
    return findings;
  }
}

// ─── Classifier Registry ────────────────────────────────────────────────────

export class ClassifierRegistry {
  private classifiers: ContentClassifier[] = [];

  register(classifier: ContentClassifier): void {
    this.classifiers.push(classifier);
  }

  unregister(name: string): void {
    this.classifiers = this.classifiers.filter((c) => c.name !== name);
  }

  list(): Array<{ name: string; description: string }> {
    return this.classifiers.map((c) => ({ name: c.name, description: c.description }));
  }

  /**
   * Run all classifiers on content. Merge results, apply redaction.
   */
  classify(content: string): ClassificationResult {
    const allFindings: Classification[] = [];

    for (const classifier of this.classifiers) {
      const findings = classifier.classify(content);
      allFindings.push(...findings);
    }

    if (allFindings.length === 0) {
      return { sensitivity: 'public', findings: [], redactedContent: content, wasRedacted: false };
    }

    // Determine highest sensitivity
    let highest: Sensitivity = 'public';
    for (const f of allFindings) {
      highest = maxSensitivity(highest, f.sensitivity);
    }

    // Apply redactions (sort by offset descending so replacements don't shift positions)
    const toRedact = allFindings
      .filter((f) => f.action === 'redact')
      .sort((a, b) => b.offset - a.offset);

    let redacted = content;
    for (const finding of toRedact) {
      const placeholder = `[REDACTED:${finding.type}]`;
      redacted =
        redacted.slice(0, finding.offset) +
        placeholder +
        redacted.slice(finding.offset + finding.match.length);
    }

    return {
      sensitivity: highest,
      findings: allFindings,
      redactedContent: redacted,
      wasRedacted: toRedact.length > 0,
    };
  }
}

// ─── Pre-LLM Sanitizer ─────────────────────────────────────────────────────

/**
 * Sanitize content before sending to an LLM. Runs the classifier registry
 * and returns redacted content. This is the last line of defense before
 * memory content leaves the application boundary.
 *
 * Called before every llm.chat() and llm.summarize() invocation.
 */
export function sanitizeForLLM(
  registry: ClassifierRegistry,
  content: string,
): { sanitized: string; findings: Classification[] } {
  const result = registry.classify(content);
  return {
    sanitized: result.redactedContent,
    findings: result.findings,
  };
}

// ─── Default Registry Factory ───────────────────────────────────────────────

export function createDefaultRegistry(): ClassifierRegistry {
  const registry = new ClassifierRegistry();
  registry.register(new SecretPatternClassifier());
  registry.register(new PIIPatternClassifier());
  return registry;
}
