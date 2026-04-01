import type { UnifiedToolCall, TokenStats } from "../provider/lib/types.js";
import type { AgentLoopMode, AgentLoopPhase, AgentLoopState, AgentPhasePrompts } from "../agent/types.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
  contextContent?: string;
}

export interface LoopMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
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
  providerId: string;
  messages: LoopMessage[];
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemPrompt: string;
  maxIterations: number;
  loopMode: AgentLoopMode;
  phasePrompts: AgentPhasePrompts;
  mcpInstructions: string;
  agentVariables: Record<string, string>;
  phase: AgentLoopPhase;
  allTools: ToolDefinition[];
  executeTool: ExecuteToolFn;
  onContent?: (content: string) => void;
  onReasoning?: (content: string) => void;
  onContentReset?: () => void;
  onRetryNotice?: (message: string) => void;
  onToolCall?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onLoopState?: (state: AgentLoopState) => void;
  onStats?: (stats: TokenStats) => void;
}

export interface LoopResult {
  messages: LoopMessage[];
  finalResponse: string;
  iterations: number;
}
