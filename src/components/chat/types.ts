import type { ToolExecutionStatus } from "@/types/api";

export interface ActiveToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolExecutionStatus;
  result?: { content: string; isError: boolean };
}

export interface TokenDisplayStats {
  input: number;
  output: number;
  reasoning: number;
}

export interface PendingPrompt {
  promptId: string;
  question: string;
  choices: { key: string; label: string }[];
}
