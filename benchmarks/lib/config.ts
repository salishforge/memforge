// Benchmark configuration — reads from environment variables

export interface BenchmarkConfig {
  memforgeUrl: string;
  memforgeToken: string | undefined;
  datasetDir: string;
  resultsDir: string;
  questionLimit: number;
  questionOffset: number;
  queryModes: string[];
  queryTopK: number[];
  agentPrefix: string;
  concurrency: number;
  consolidationMode: 'concat' | 'summarize';
  cleanupAfter: boolean;
}

export function loadConfig(): BenchmarkConfig {
  return {
    memforgeUrl: process.env['MEMFORGE_URL'] ?? 'http://localhost:3333',
    memforgeToken: process.env['MEMFORGE_TOKEN'],
    datasetDir: process.env['BENCHMARK_DATASET_DIR'] ?? 'benchmarks/data/longmemeval',
    resultsDir: process.env['BENCHMARK_RESULTS_DIR'] ?? 'benchmarks/results',
    questionLimit: parseInt(process.env['BENCHMARK_LIMIT'] ?? '500', 10),
    questionOffset: parseInt(process.env['BENCHMARK_OFFSET'] ?? '0', 10),
    queryModes: (process.env['BENCHMARK_MODES'] ?? 'keyword').split(',').map((m) => m.trim()),
    queryTopK: [1, 3, 5, 10],
    agentPrefix: 'bench-lme-',
    concurrency: parseInt(process.env['BENCHMARK_CONCURRENCY'] ?? '5', 10),
    consolidationMode: (process.env['BENCHMARK_CONSOLIDATION'] ?? 'concat') as 'concat' | 'summarize',
    consolidationBatchSize: parseInt(process.env['CONSOLIDATION_INNER_BATCH_SIZE'] ?? '50', 10),
    cleanupAfter: process.env['BENCHMARK_CLEANUP'] !== 'false',
  };
}
