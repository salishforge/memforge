// Chat-completion transport for the QA benchmark.
//
// Why this module exists: the QA harness needs two LLM roles (a reader that
// answers from retrieved context, and a judge that scores the answer), and
// which provider serves them is a benchmark-integrity decision, not an
// implementation detail. Keeping the transport in one place means the judge
// and reader cannot silently drift onto different backends, and the resolved
// configuration can be reported alongside every result.
//
// Defaults to Ollama on localhost because that is free, private, and fast
// enough to iterate on. Any OpenAI-compatible endpoint works — Ollama exposes
// one at /v1 — so pointing at OpenAI is a base-URL change, not a code change:
//
//   QA_API_BASE=https://api.openai.com/v1 OPENAI_API_KEY=sk-... \
//   QA_JUDGE_MODEL=gpt-4o-2024-08-06 QA_READER_MODEL=gpt-4o-2024-08-06 ...
//
// Note on comparability: LongMemEval's published protocol judges with GPT-4o
// (>97% human agreement). Scores produced by any other judge are useful for
// tracking relative progress but are NOT comparable to leaderboard numbers.
// `isPaperProtocolJudge()` exists so report generation can say so plainly
// rather than leaving the reader to assume.

/** Default judge/reader when nothing is configured. */
export const DEFAULT_QA_MODEL = 'qwen3.5:cloud';

/** Judge models whose scores are comparable to published LongMemEval results. */
const PAPER_PROTOCOL_JUDGES = /^gpt-4o/;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string | undefined;
  judgeModel: string;
  readerModel: string;
  timeoutMs: number;
}

export function loadLlmConfig(): LlmConfig {
  // OLLAMA_BASE_URL is the host root (no /v1) — the same variable the server
  // uses for its own Ollama provider, so one export configures both.
  const ollamaRoot = (process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434').replace(/\/$/, '');
  return {
    baseUrl: (process.env['QA_API_BASE'] ?? `${ollamaRoot}/v1`).replace(/\/$/, ''),
    apiKey: process.env['QA_API_KEY'] ?? process.env['OPENAI_API_KEY'],
    judgeModel: process.env['QA_JUDGE_MODEL'] ?? DEFAULT_QA_MODEL,
    readerModel: process.env['QA_READER_MODEL'] ?? DEFAULT_QA_MODEL,
    // Cloud-hosted Ollama models answer in tens of seconds under load; the
    // previous implementation had no timeout at all, so one stalled request
    // could hang a 500-question run indefinitely.
    timeoutMs: parseInt(process.env['QA_TIMEOUT_MS'] ?? '180000', 10),
  };
}

/** True when this judge's scores are comparable to published LongMemEval numbers. */
export function isPaperProtocolJudge(judgeModel: string): boolean {
  return PAPER_PROTOCOL_JUDGES.test(judgeModel);
}

export interface ChatOptions {
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
  /** Request a JSON object back. Honored by OpenAI and by Ollama's /v1 shim. */
  json?: boolean;
}

/**
 * One chat completion against an OpenAI-compatible endpoint.
 * Throws with the response body on failure — a bare status code is not enough
 * to tell "model not pulled" from "bad request" when debugging a long run.
 */
export async function chat(
  config: LlmConfig,
  model: string,
  opts: ChatOptions,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Ollama ignores Authorization; sending it only when present keeps the
  // no-key local path clean and still satisfies hosted providers.
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature,
  };
  if (opts.maxTokens !== undefined) body['max_tokens'] = opts.maxTokens;
  if (opts.json) body['response_format'] = { type: 'json_object' };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `LLM request failed (${response.status} ${response.statusText}) at ${config.baseUrl} for model "${model}": ${detail.slice(0, 300)}`,
    );
  }

  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`LLM returned no message content for model "${model}"`);
  }
  return content;
}
