import type { LLMProvider, ConsolidationSummary } from '../../src/llm.js';

/**
 * Deterministic mock LLM provider for testing LLM-dependent code paths.
 * Records all calls for assertions and returns context-appropriate responses
 * based on the system prompt content.
 */
export class MockLLMProvider implements LLMProvider {
  readonly model = 'mock-model-v1';

  summarizeCalls: Array<{ rawContent: string; agentContext?: string }> = [];
  chatCalls: Array<{ systemPrompt: string; userPrompt: string }> = [];

  private chatResponseQueue: string[] = [];
  private summarizeResponseQueue: ConsolidationSummary[] = [];

  private readonly defaultSummary: ConsolidationSummary = {
    summary: 'Mock consolidated summary of events.',
    keyFacts: ['Fact A was established', 'Fact B was confirmed'],
    entities: [
      { name: 'Alice', type: 'person' },
      { name: 'ProjectX', type: 'system' },
    ],
    relationships: [
      { source: 'Alice', target: 'ProjectX', relation: 'works on' },
    ],
    sentiment: 'neutral',
  };

  /**
   * Queue specific responses to be returned in order.
   * When the queue is empty, falls back to default responses.
   */
  queueChatResponse(...responses: string[]): void {
    this.chatResponseQueue.push(...responses);
  }

  queueSummarizeResponse(...responses: ConsolidationSummary[]): void {
    this.summarizeResponseQueue.push(...responses);
  }

  async summarize(rawContent: string, agentContext?: string): Promise<ConsolidationSummary> {
    this.summarizeCalls.push({ rawContent, agentContext });
    return this.summarizeResponseQueue.shift() ?? { ...this.defaultSummary };
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    this.chatCalls.push({ systemPrompt, userPrompt });

    const queued = this.chatResponseQueue.shift();
    if (queued !== undefined) return queued;

    return this.defaultChatResponse(systemPrompt);
  }

  private defaultChatResponse(systemPrompt: string): string {
    if (systemPrompt.includes('reflection engine')) {
      return JSON.stringify({
        reflection: 'Mock reflection: patterns observed across recent memories.',
        key_insights: [
          'Insight A: recurring pattern detected',
          'Insight B: causal relationship identified',
          'Insight C: strategic opportunity noted',
        ],
        contradictions: [],
        reinforced_patterns: ['Pattern X remains consistent'],
      });
    }

    if (systemPrompt.includes('memory revision engine')) {
      return JSON.stringify({
        action: 'augment',
        revised_content: 'Augmented mock memory with additional context.',
        reason: 'Added context from related memories.',
        delta_summary: 'Added cross-reference detail.',
        confidence: 0.85,
      });
    }

    if (systemPrompt.includes('meta-reflection') || systemPrompt.includes('second-order')) {
      return JSON.stringify({
        reflection: 'Mock meta-reflection: higher-order synthesis of patterns.',
        key_insights: ['Meta-insight: cross-cutting theme identified'],
        contradictions: [],
        reinforced_patterns: [],
      });
    }

    if (systemPrompt.includes('condition→action') || systemPrompt.includes('condition->action')) {
      return JSON.stringify({
        procedures: [{
          condition: 'When deploying on Friday',
          action: 'Run extra validation checks',
          confidence: 0.9,
        }],
      });
    }

    return '{}';
  }

  reset(): void {
    this.summarizeCalls = [];
    this.chatCalls = [];
    this.chatResponseQueue = [];
    this.summarizeResponseQueue = [];
  }
}
