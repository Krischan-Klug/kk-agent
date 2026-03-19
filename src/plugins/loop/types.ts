import type { UnifiedMessage, UnifiedToolCall, TokenStats } from "../provider/lib/types.js";
import type { LoopStrategy, PromptTemplates, AgentLoopState } from "../agent/types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export type ExecuteToolFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface LoopOptions {
  agentId: string;
  sessionId: string;
  messages: UnifiedMessage[];
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  strategy: LoopStrategy;
  promptTemplates: PromptTemplates;
  mcpInstructions: string;
  agentVariables: Record<string, string>;
  allTools: ToolDefinition[];
  executeTool: ExecuteToolFn;
  onContent?: (content: string) => void;
  onReasoning?: (content: string) => void;
  onToolCall?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onPhaseChange?: (from: string, to: string, reason: string) => void;
  onLoopState?: (state: AgentLoopState) => void;
  onStats?: (stats: TokenStats) => void;
  maxContextTokens?: number;
  compactionPrompt?: string;
  compactionThreshold?: number;
}

export interface LoopResult {
  messages: UnifiedMessage[];
  finalResponse: string;
  iterations: number;
}
