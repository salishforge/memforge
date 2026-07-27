// LongMemEval QA Accuracy types

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

export interface Judgment {
  score: number;
  correct: boolean;
  reasoning: string;
}

export interface QAQuestionResult {
  questionIndex: number;
  questionType: string;
  question: string;
  expectedAnswer: string;
  generatedAnswer: string;
  retrievedContext: string[];
  judgment: Judgment | null;
  correct: boolean;
  score: number;
  latency: {
    queryMs: number;
    generateMs: number;
    judgeMs: number;
    totalMs: number;
  };
  tokens: {
    contextTokens: number;
    answerTokens: number;
    totalTokens: number;
  };
  errors: {
    generateError: string | null;
    judgeError: string | null;
  };
}

export interface QAAggregateResult {
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  averageScore: number;
  perCategory: Record<string, { count: number; correct: number; accuracy: number; avgScore: number }>;
  latency: {
    queryMs: number;
    generateMs: number;
    judgeMs: number;
    totalMs: number;
  };
  tokensPerRetrieval: number;
  judgeModel: string;
  readerModel: string;
  timestamp: string;
}
