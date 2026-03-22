import type { UnifiedToolCall, TokenStats } from "../provider/lib/types.js";
import type { AgentLoopState } from "../agent/types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface LoopMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  kind?: "compaction" | "internal_summary";
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: UnifiedToolCall[];
}

export type ExecuteToolFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface LoopOptions {
  agentId: string;
  sessionId: string;
  messages: LoopMessage[];
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemPrompt: string;
  maxIterations: number;
  mcpInstructions: string;
  agentVariables: Record<string, string>;
  allTools: ToolDefinition[];
  executeTool: ExecuteToolFn;
  onContent?: (content: string) => void;
  onReasoning?: (content: string) => void;
  onCompaction?: (message: LoopMessage) => void;
  onRetryNotice?: (message: string) => void;
  onToolCall?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onLoopState?: (state: AgentLoopState) => void;
  onStats?: (stats: TokenStats) => void;
  maxContextTokens?: number;
  compactionPrompt?: string;
  compactionThreshold?: number;
}

export interface LoopResult {
  messages: LoopMessage[];
  finalResponse: string;
  iterations: number;
}
