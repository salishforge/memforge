// LongMemEval QA Accuracy Evaluator
//
// Runs the full LongMemEval pipeline: retrieve → generate answer → LLM judge
// Official metric: end-to-end QA accuracy (not retrieval R@5)
// Judge: gpt-4o-2024-08-06 (per paper's protocol, >97% human agreement)
//
// Usage: npx tsx benchmarks/longmemeval-qa/evaluate.ts [--limit=100] [--judge=openai]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadConfig, type BenchmarkConfig } from '../lib/config.js';
import type { LongMemEvalInstance, QAQuestionResult } from './types.js';

const JUDGE_MODEL = process.env['QA_JUDGE_MODEL'] ?? 'gpt-4o-2024-08-06';
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];

async function createClient(config: BenchmarkConfig) {
  const { MemForgeClient } = await import('../../src/client.js');
  return new MemForgeClient({
    baseUrl: config.memforgeUrl,
    token: config.memforgeToken,
  });
}

async function judgeAnswer(
  question: string,
  expectedAnswer: string,
  generatedAnswer: string,
): Promise<{ correct: boolean; score: number; reasoning: string }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY required for QA judging. Set QA_JUDGE_MODEL to use alternative judge.');
  }

  // Use OpenAI API directly to avoid external SDK dependency
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an expert judge evaluating AI agent answers against gold standard answers.
Rate the generated answer on a scale of 0.0 to 1.0 based on factual correctness and completeness.
Score 1.0 = fully correct and complete, 0.0 = completely wrong or irrelevant.
Consider partial credit for answers that contain some correct information.
Output JSON: {"score": 0.0-1.0, "correct": true/false, "reasoning": "brief explanation"}`,
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nGold Answer: ${expectedAnswer}\n\nGenerated Answer: ${generatedAnswer}`,
        },
      ],
      temperature: 0.0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Judge API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;
  const parsed = JSON.parse(content);

  return {
    score: parsed.score,
    correct: parsed.correct,
    reasoning: parsed.reasoning,
  };
}

async function generateAnswer(
  question: string,
  retrievedContext: string[],
  readerModel?: string,
): Promise<string> {
  const model = readerModel ?? process.env['QA_READER_MODEL'] ?? 'gpt-4o-2024-08-06';
  const apiKey = process.env['OPENAI_API_KEY'];

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for answer generation');
  }

  const context = retrievedContext.join('\n\n---\n\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: `You are an AI agent answering questions based on retrieved context.
Use ONLY the information in the provided context to answer.
If the context doesn't contain enough information, say so clearly.
Be concise and factual. Cite specific details from the context.`,
        },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Reader API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content ?? '';
}

async function evaluateQuestion(
  client: Awaited<ReturnType<typeof createClient>>,
  instance: LongMemEvalInstance,
  agentId: string,
  questionIndex: number,
  config: BenchmarkConfig,
): Promise<QAQuestionResult> {
  const maxK = Math.max(...config.queryTopK);

  // Step 1: Retrieve
  const queryStart = performance.now();
  const results = await client.query(agentId, {
    q: instance.question,
    limit: maxK,
    mode: config.queryModes[0] ?? 'hybrid',
  });
  const queryMs = performance.now() - queryStart;

  // Extract context from retrieved results
  const retrievedContext = results.map(r => 
    typeof r === 'object' && r !== null && 'content' in r
      ? (r as { content: string }).content
      : ''
  ).filter(c => c.length > 0);

  // Step 2: Generate answer
  const generateStart = performance.now();
  let generatedAnswer = '';
  let generateError: string | null = null;
  try {
    generatedAnswer = await generateAnswer(instance.question, retrievedContext);
  } catch (err) {
    generateError = err instanceof Error ? err.message : 'Unknown error';
  }
  const generateMs = performance.now() - generateStart;

  // Step 3: Judge
  const judgeStart = performance.now();
  let judgment: { score: number; correct: boolean; reasoning: string } | null = null;
  let judgeError: string | null = null;
  if (generatedAnswer && !generateError) {
    try {
      judgment = await judgeAnswer(instance.question, instance.answer, generatedAnswer);
    } catch (err) {
      judgeError = err instanceof Error ? err.message : 'Unknown error';
    }
  }
  const judgeMs = performance.now() - judgeStart;

  // Count tokens (rough estimate)
  const contextTokens = Math.ceil(retrievedContext.join(' ').length / 4);
  const answerTokens = Math.ceil((generatedAnswer || '').length / 4);
  const totalTokens = contextTokens + answerTokens;

  return {
    questionIndex,
    questionType: instance.question_type ?? 'unknown',
    question: instance.question,
    expectedAnswer: instance.answer,
    generatedAnswer,
    retrievedContext: retrievedContext.slice(0, 3), // Store top 3 for reference
    judgment,
    correct: judgment?.correct ?? false,
    score: judgment?.score ?? 0,
    latency: {
      queryMs,
      generateMs,
      judgeMs,
      totalMs: queryMs + generateMs + judgeMs,
    },
    tokens: {
      contextTokens,
      answerTokens,
      totalTokens,
    },
    errors: {
      generateError,
      judgeError,
    },
  };
}

export async function main(configOverride?: BenchmarkConfig): Promise<QAQuestionResult[]> {
  const config = configOverride ?? loadConfig();

  // Parse CLI args
  for (const arg of process.argv.slice(2)) {
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch?.[1]) config.limit = parseInt(limitMatch[1], 10);
  }

  console.log('=== LongMemEval QA Accuracy Evaluation ===');
  console.log(`MemForge URL: ${config.memforgeUrl}`);
  console.log(`Judge model: ${JUDGE_MODEL}`);
  console.log(`Reader model: ${process.env['QA_READER_MODEL'] ?? 'gpt-4o-2024-08-06'}`);
  console.log(`Mode: ${config.queryModes.join(', ')}`);
  console.log(`Limit: ${config.limit ?? 500}`);
  console.log('');

  // Load dataset
  const dataPath = join(process.cwd(), 'benchmarks', 'longmemeval', 'data', 'longmemeval.json');
  if (!existsSync(dataPath)) {
    throw new Error(`Dataset not found at ${dataPath}. Run 'npm run benchmark:download' first.`);
  }

  const dataset: LongMemEvalInstance[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const limit = config.limit ?? dataset.length;
  const offset = config.offset ?? 0;
  const subset = dataset.slice(offset, offset + limit);

  console.log(`Dataset loaded: ${dataset.length} total, evaluating ${limit} (offset ${offset})`);
  console.log('');

  const client = await createClient(config);
  const agentId = `longmemeval-qa-${Date.now()}`;
  const results: QAQuestionResult[] = [];

  // Ingest all sessions first (reuse existing ingest logic)
  console.log('Ingesting sessions...');
  const { ingest } = await import('./ingest.js');
  await ingest(client, agentId, subset, config);
  console.log('Ingestion complete.');
  console.log('');

  // Consolidate
  console.log('Consolidating...');
  const consolidateStart = performance.now();
  await client.consolidate(agentId);
  const consolidateMs = performance.now() - consolidateStart;
  console.log(`Consolidation complete (${Math.round(consolidateMs)}ms).`);
  console.log('');

  // Evaluate each question
  console.log('Evaluating questions...');
  for (let i = 0; i < subset.length; i++) {
    const instance = subset[i];
    const questionIndex = offset + i;

    try {
      const result = await evaluateQuestion(client, instance, agentId, questionIndex, config);
      results.push(result);

      const status = result.correct ? '✓' : '✗';
      const scoreStr = result.score !== null ? `${(result.score * 100).toFixed(0)}%` : 'N/A';
      console.log(`Q${questionIndex + 1} [${instance.question_type}] ${status} (${scoreStr})`);

      // Save incremental results
      if ((i + 1) % 10 === 0 || i === subset.length - 1) {
        saveResults(results, config, offset);
      }
    } catch (err) {
      console.error(`Q${questionIndex + 1} ERROR:`, err instanceof Error ? err.message : err);
      results.push({
        questionIndex,
        questionType: instance.question_type ?? 'unknown',
        question: instance.question,
        expectedAnswer: instance.answer,
        generatedAnswer: '',
        retrievedContext: [],
        judgment: null,
        correct: false,
        score: 0,
        latency: { queryMs: 0, generateMs: 0, judgeMs: 0, totalMs: 0 },
        tokens: { contextTokens: 0, answerTokens: 0, totalTokens: 0 },
        errors: {
          generateError: err instanceof Error ? err.message : 'Unknown error',
          judgeError: null,
        },
      });
    }
  }

  // Cleanup
  if (config.cleanup) {
    console.log('Cleaning up...');
    try {
      await client.clear(agentId);
    } catch (err) {
      console.error('Cleanup error:', err instanceof Error ? err.message : err);
    }
  }

  console.log('');
  console.log('=== Evaluation Complete ===');

  return results;
}

function saveResults(results: QAQuestionResult[], config: BenchmarkConfig, offset: number) {
  const resultsDir = join(process.cwd(), 'benchmarks', 'longmemeval-qa', 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const manifestPath = join(resultsDir, `qa-manifest-${timestamp}.json`);

  const manifest = {
    timestamp,
    offset,
    count: results.length,
    judgeModel: JUDGE_MODEL,
    readerModel: process.env['QA_READER_MODEL'] ?? 'gpt-4o-2024-08-06',
    modes: config.queryModes,
    results,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// Run if called directly
if (process.argv[1]?.endsWith('evaluate.ts')) {
  main()
    .then((results) => {
      const correct = results.filter(r => r.correct).length;
      const accuracy = correct / results.length;
      const avgScore = results.reduce((sum, r) => sum + (r.score ?? 0), 0) / results.length;
      console.log('');
      console.log(`Results: ${correct}/${results.length} correct (${(accuracy * 100).toFixed(1)}%)`);
      console.log(`Average score: ${(avgScore * 100).toFixed(1)}%`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
