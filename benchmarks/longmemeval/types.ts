// LongMemEval dataset and benchmark result types

export interface LongMemEvalTurn {
  role: 'user' | 'assistant';
  content: string;
  has_answer?: boolean;
}

export interface LongMemEvalInstance {
  question_id?: string;
  question: string;
  answer: string;
  answer_session_ids: number[];
  question_type: string;
  question_date?: string;
  haystack_sessions: LongMemEvalTurn[][];
  haystack_dates: string[];
  haystack_session_ids: number[];
}

export interface QuestionResult {
  questionIndex: number;
  questionType: string;
  question: string;
  expectedAnswer: string;
  answerSessionIds: number[];
  retrievedSessionIds: string[];
  recallAt: Record<number, number>;
  latency: {
    ingestMs: number;
    consolidateMs: number;
    queryMs: number;
  };
  queryMode: string;
  resultCount: number;
}

export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
}

export interface CategoryResult {
  count: number;
  recallAt: Record<number, number>;
  latency: LatencyStats;
}

export interface BenchmarkReport {
  timestamp: string;
  memforgeVersion: string;
  questionsEvaluated: number;
  queryMode: string;
  consolidationMode: string;
  overall: {
    recallAt: Record<number, number>;
    queryLatency: LatencyStats;
    ingestLatency: LatencyStats;
  };
  perCategory: Record<string, CategoryResult>;
  results: QuestionResult[];
}

export interface IngestManifest {
  timestamp: string;
  agentPrefix: string;
  questionCount: number;
  consolidationMode: string;
  agents: Array<{
    agentId: string;
    questionIndex: number;
    sessionsIngested: number;
    ingestMs: number;
    consolidateMs: number;
  }>;
}
