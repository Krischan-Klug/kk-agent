import type { RuntimeToolSource, ToolExecutionStatus, TranscriptMessage } from "@krischan-klug/kk-agent-contract";
import type { ProviderTransportState, ProviderTurnDebug, TokenStats, UnifiedToolDefinition } from "../provider/lib/types.js";
import type { ModeBehavior, AgentPromptSections } from "../agent/types.js";
import type { LlmRequestConfig } from "../provider/types.js";

type ToolInterruptBehavior = "cancel" | "block";

interface RuntimeToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
  contextBudgetChars?: number;
  persistLargeResults?: boolean;
  excludeFromContextBudget?: boolean;
}

type RuntimeToolPermissionPolicy =
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

export interface ModeRuntimeRef {
  id: string;
  behavior: ModeBehavior;
}

export interface RuntimeToolDisplayMeta {
  title?: string;
  summaryInputKeys?: string[];
  redactInputKeys?: string[];
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
    mode: ModeRuntimeRef,
  ) => Promise<RuntimeToolPermissionPolicy> | RuntimeToolPermissionPolicy;
  category?: "filesystem" | "search" | "web" | "other";
  operationKind?: "read" | "write" | "search" | "fetch";
  display?: RuntimeToolDisplayMeta;
  selfBoundedResult?: boolean;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
  assistantBlocks?: import("../lib/transcript.js").TranscriptBlock[];
  additionalMessages?: TranscriptMessage[];
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
  metadata?: Record<string, unknown>;
}

export interface ModeRuntimeConfig {
  modeId: string;
  modeLabel: string;
  modePromptName: string;
  modeBehavior: ModeBehavior;
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
  messages: TranscriptMessage[];
  buildEphemeralMetaMessages?: (input: {
    sessionId: string;
    agentId: string;
    modeId: string;
    modeName?: string;
    model: string;
    iteration: number;
  }) => TranscriptMessage[];
  modeConfigs: Record<string, ModeRuntimeConfig>;
  activeModeId: string;
  agentVariables: Record<string, string>;
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    mode: ModeRuntimeRef,
    context: ToolRuntimeContext,
  ) => Promise<ToolExecutionResult>;
  toolContext?: ToolRuntimeContext;
  llmRequestConfig?: LlmRequestConfig;
  providerState?: ProviderTransportState;
  modelPassRunner?: (
    opts: LoopOptions,
    messages: TranscriptMessage[],
    providerState: LoopOptions["providerState"],
    onToolUseBlock?: (toolUse: import("../lib/transcript.js").TranscriptToolUseBlock) => void,
    retryInstruction?: string,
    metaMessages?: TranscriptMessage[],
  ) => Promise<{
    message: TranscriptMessage;
    finishReason: import("../lib/transcript.js").TranscriptStopReason;
    stats?: TokenStats;
    notices?: import("../provider/lib/types.js").ProviderNotice[];
    parseIssues?: import("../provider/lib/types.js").ToolCallParseIssue[];
    transportState?: ProviderTransportState;
    debug?: ProviderTurnDebug;
  }>;
  onAssistantBlockDelta?: (messageId: string, block: import("../lib/transcript.js").TranscriptBlock) => void;
  onAssistantMessage?: (message: TranscriptMessage) => void;
  onSystemNotice?: (level: "info" | "warning" | "error", message: string) => void;
  onToolExecutionUpdate?: (
    toolUseId: string,
    toolName: string,
    status: ToolExecutionStatus,
    result?: TranscriptMessage,
    detail?: string,
    summary?: string,
    input?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) => void;
  resolveToolPermission?: (
    runtimeTool: RuntimeToolDefinition,
    toolName: string,
    args: Record<string, unknown>,
    mode: ModeRuntimeRef,
  ) => Promise<{ allowed: boolean; reason?: string }>;
  onLoopState?: (state: {
    sessionId: string;
    agentId: string;
    status: "idle" | "running" | "completed" | "error" | "aborted";
    modeId: string;
    modeBehavior: ModeBehavior;
    iteration: number;
    startedAt: string;
    updatedAt: string;
  }) => void;
  onStats?: (stats: TokenStats) => void;
  abortSignal?: AbortSignal;
  autonomous?: boolean;
  autonomousBudget?: {
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxWallClockMs?: number;
    maxConsecutiveAutoContinues?: number;
  };
}

export interface LoopResult {
  messages: TranscriptMessage[];
  finalResponse: string;
  iterations: number;
  providerState?: ProviderTransportState;
  providerDebug?: ProviderTurnDebug;
  aborted?: boolean;
}
