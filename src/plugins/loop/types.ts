import type { UnifiedToolCall, TokenStats, ContentBlock, UnifiedToolDefinition } from "../provider/lib/types.js";
import type { ChatMode, AgentPromptSections } from "../agent/types.js";

export interface LoopMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string | ContentBlock[];
  isError?: boolean;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: UnifiedToolCall[];
}

export interface LoopResult {
  messages: LoopMessage[];
  finalResponse: string;
  iterations: number;
}

export interface ToolExecutionResult {
  content: string;
  contextContent?: string;
  isError?: boolean;
}

export interface ModeRuntimeConfig {
  promptSections: AgentPromptSections;
  modeInstruction: string;
  mcpInstructions: string;
  runtimeVariables?: Record<string, string>;
  allTools: UnifiedToolDefinition[];
}

export interface LoopOptions {
  agentId: string;
  sessionId: string;
  providerId: string;
  model: string;
  messages: LoopMessage[];
  extraSystemMessages?: string[];
  modeConfigs: Partial<Record<ChatMode, ModeRuntimeConfig>>;
  maxIterations: number;
  activeMode: ChatMode;
  agentVariables: Record<string, string>;
  executeTool: (toolName: string, args: Record<string, unknown>, mode: ChatMode) => Promise<ToolExecutionResult>;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  onContent?: (content: string) => void;
  onReasoning?: (content: string) => void;
  onContentReset?: () => void;
  onRetryNotice?: (message: string) => void;
  onToolCall?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolExecutionResult) => void;
  onLoopState?: (state: {
    sessionId: string;
    agentId: string;
    status: "idle" | "running" | "completed" | "error";
    mode: ChatMode;
    iteration: number;
    maxIterations: number;
    startedAt: string;
    updatedAt: string;
  }) => void;
  onStats?: (stats: TokenStats) => void;
}
