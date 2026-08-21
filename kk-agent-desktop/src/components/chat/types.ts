import type { SessionMessage, ToolExecutionStatus } from "@/types/api";

export interface ActiveToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolExecutionStatus;
  result?: { content: string; isError: boolean; metadata?: Record<string, unknown> };
  displayText?: string;
  detail?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentStepView {
  assistant: SessionMessage;
  toolCalls: ActiveToolCall[];
}

export interface StreamingTurnState {
  steps: AgentStepView[];
}

export interface TokenDisplayStats {
  input: number;
  output: number;
  reasoning: number;
  used?: number;
}

export interface PendingPrompt {
  purpose: "question" | "approval";
  promptId: string;
  question: string;
  choices: { key: string; label: string }[];
}
