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
  readerTemperature: number;
  timeoutMs: number;
  maxRetries: number;
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
    // Greedy by default. The reader previously sampled at 0.3, so the same
    // question produced different answers — and therefore different judge
    // verdicts — between runs: observed a question scoring 100% then 0% with
    // nothing changed. A benchmark whose score moves on re-run cannot measure
    // an improvement. Residual variance remains (hosted models are not bitwise
    // reproducible), but this removes the deliberate source.
    readerTemperature: parseFloat(process.env['QA_READER_TEMPERATURE'] ?? '0'),
    // Cloud-hosted Ollama models answer in tens of seconds under load; the
    // previous implementation had no timeout at all, so one stalled request
    // could hang a 500-question run indefinitely.
    timeoutMs: parseInt(process.env['QA_TIMEOUT_MS'] ?? '180000', 10),
    maxRetries: parseInt(process.env['QA_MAX_RETRIES'] ?? '5', 10),
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

  // Retry transient failures. A 500-question run makes thousands of calls, and
  // every hosted provider rate-limits: an unretried 429 does not merely lose
  // one question, it loses every question after the quota wall — measured on a
  // full run, 177 of 500 failed this way, wiping out two entire categories and
  // leaving a biased 316-question sample that still looked like a result.
  let response: Response | undefined;
  let lastError = '';
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (response.ok) break;

    const retryable = response.status === 429 || response.status >= 500;
    lastError = await response.text().catch(() => '');
    if (!retryable || attempt === config.maxRetries) {
      throw new Error(
        `LLM request failed (${response.status} ${response.statusText}) at ${config.baseUrl} for model "${model}" after ${attempt + 1} attempt(s): ${lastError.slice(0, 300)}`,
      );
    }

    // Honour Retry-After when the provider sends it; otherwise exponential
    // backoff with jitter so concurrent workers do not resynchronise and
    // stampede the limit again together.
    const retryAfter = Number(response.headers.get('retry-after'));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(2 ** attempt * 1000, 30_000) * (0.5 + Math.random());
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  const result = await response!.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(`LLM returned no message content for model "${model}"`);
  }
  return content;
}

/**
 * Judges sometimes wrap JSON in a markdown code fence despite being asked for
 * a JSON object — observed 7 times in a 500-question run, each of which was
 * otherwise a perfectly good verdict thrown away by JSON.parse. Strip the
 * fence rather than discard the judgment.
 */
export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}
