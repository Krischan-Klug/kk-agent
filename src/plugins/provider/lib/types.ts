export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface UnifiedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  tool_call_id?: string;
  tool_calls?: UnifiedToolCall[];
}

/** Extract plain text from content that may be string or ContentBlock[] */
export function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UnifiedRequest {
  providerId?: string;
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
