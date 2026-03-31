export interface ActiveToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
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
