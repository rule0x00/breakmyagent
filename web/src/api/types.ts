export type BlockedBy = 'input_guard' | 'output_filter' | 'egress_filter';

export interface Player {
  id: string;
  nickname: string;
}

export interface LevelSummary {
  level: number;
  name: string;
  defense: string;
  briefing: string;
  unlocked: boolean;
  cleared: boolean;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  blockedBy?: BlockedBy;
}

export interface LevelDetail {
  level: number;
  name: string;
  defense: string;
  briefing: string;
  cleared: boolean;
  history: HistoryMessage[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  blocked: boolean;
}

export interface AttemptResult {
  attemptId: string;
  reply: string;
  toolCalls: ToolCall[];
  blockedBy: BlockedBy | null;
}

export type SubmitResult = { correct: false } | { correct: true; level: number; attemptsUsed: number };
