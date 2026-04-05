import type { TranscriptMessage } from "../lib/transcript.js";
import type { ProviderTransportState, ProviderTurnDebug, TokenStats, UnifiedToolDefinition } from "../provider/lib/types.js";
import type { ChatMode, AgentPromptSections } from "../agent/types.js";

export type LoopMessage = TranscriptMessage;
export type RuntimeToolSource = "system" | "mcp";
export type ToolInterruptBehavior = "cancel" | "block";

export interface RuntimeToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
  contextBudgetChars?: number;
  persistLargeResults?: boolean;
  excludeFromContextBudget?: boolean;
}

export type RuntimeToolPermissionPolicy =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | {
      kind: "prompt";
      question: string;
      choices: { key: string; label: string }[];
      allowKeys: string[];
      deniedMessage?: string;
    };

export interface ToolRuntimeContext {
  values: Record<string, unknown>;
}

export interface RuntimeToolDefinition extends UnifiedToolDefinition {
  source: RuntimeToolSource;
  capabilityId: string;
  inputSchema: Record<string, unknown>;
  accessScope?: "user" | "system";
  isConcurrencySafe: (input: Record<string, unknown>) => boolean;
  interruptBehavior: ToolInterruptBehavior;
  resultPolicy: RuntimeToolResultPolicy;
  permissionPolicy: RuntimeToolPermissionPolicy;
  resolvePermission?: (
    toolName: string,
    args: Record<string, unknown>,
    mode: ChatMode,
  ) => Promise<RuntimeToolPermissionPolicy> | RuntimeToolPermissionPolicy;
}

export interface LoopResult {
  messages: LoopMessage[];
  finalResponse: string;
  iterations: number;
  providerState?: ProviderTransportState;
  providerDebug?: ProviderTurnDebug;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
  additionalMessages?: TranscriptMessage[];
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
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
  skillsCatalog: string;
  activeSkillIds: string[];
  skillInstructionsById: Record<string, string>;
  runtimeVariables?: Record<string, string>;
  allTools: UnifiedToolDefinition[];
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  runtimeNotices?: string[];
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
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    mode: ChatMode,
    context: ToolRuntimeContext,
  ) => Promise<ToolExecutionResult>;
  toolContext?: ToolRuntimeContext;
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
    detail?: string,
    summary?: string,
  ) => void;
  resolveToolPermission?: (
    runtimeTool: RuntimeToolDefinition,
    toolName: string,
    args: Record<string, unknown>,
    mode: ChatMode,
  ) => Promise<{ allowed: boolean; reason?: string }>;
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
