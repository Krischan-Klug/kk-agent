import type { TranscriptMessage } from "../lib/transcript.js";
import type { ProviderTransportState, ProviderTurnDebug, TokenStats, UnifiedToolDefinition } from "../provider/lib/types.js";
import type { ChatMode, AgentPromptSections } from "../agent/types.js";

export type LoopMessage = TranscriptMessage;

export interface LoopResult {
  messages: LoopMessage[];
  finalResponse: string;
  iterations: number;
  providerState?: ProviderTransportState;
  providerDebug?: ProviderTurnDebug;
}

export interface ToolExecutionResult {
  content: string;
  contextContent?: string;
  isError?: boolean;
}

export type ToolExecutionStatus =
  | "queued"
  | "executing"
  | "yielded"
  | "completed"
  | "error"
  | "discarded"
  | "invalid";

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
  providerState?: ProviderTransportState;
  onAssistantBlockDelta?: (messageId: string, block: import("../lib/transcript.js").TranscriptBlock) => void;
  onAssistantMessage?: (message: LoopMessage) => void;
  onSystemNotice?: (level: "info" | "warning" | "error", message: string) => void;
  onToolExecutionUpdate?: (
    toolUseId: string,
    toolName: string,
    status: ToolExecutionStatus,
    result?: LoopMessage,
  ) => void;
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
