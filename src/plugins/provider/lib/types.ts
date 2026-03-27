export interface UnifiedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: UnifiedToolCall[];
}

export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UnifiedRequest {
  model: string;
  messages: UnifiedMessage[];
  tools?: UnifiedToolDefinition[];
  stream?: boolean;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  endpoint?: string;
}

export interface UnifiedToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface UnifiedResponse {
  content: string;
  reasoning?: string;
  tool_calls?: UnifiedToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
  stats?: TokenStats;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  source: "provider" | "estimated" | "unknown";
}

export interface StreamChunk {
  type: "content" | "reasoning" | "tool_calls" | "done" | "stats";
  content?: string;
  tool_calls?: UnifiedToolCall[];
  finishReason?: UnifiedResponse["finishReason"];
  stats?: TokenStats;
}

export type OnChunkFn = (chunk: StreamChunk) => void;
