import type { AgentLoopState, ModelInputDebug, RunEvent, RuntimeToolSource, SessionContextState, SessionContextUsage, ToolExecutionStatus, TranscriptMessage } from "kk-agent-contract";
import type { ModelContentPart, ProviderTransportState, ProviderTurnDebug, TokenStats, UnifiedToolDefinition } from "../provider/lib/types.js";
import type { AgentPromptSections } from "../agent/types.js";
import type { LlmRequestConfig } from "../provider/types.js";

interface RuntimeToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
  contextBudgetChars?: number;
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
      runGrantKey?: string;
      grantForRunKeys?: string[];
      deniedMessage?: string;
    };

export interface ToolRuntimeContext {
  sessionId?: string;
  values: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface RuntimeToolDefinition extends UnifiedToolDefinition {
  source: RuntimeToolSource;
  capabilityId: string;
  accessScope?: "user" | "system";
  isConcurrencySafe: (input: Record<string, unknown>) => boolean;
  resultPolicy: RuntimeToolResultPolicy;
  permissionPolicy: RuntimeToolPermissionPolicy;
  resolvePermission?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<RuntimeToolPermissionPolicy> | RuntimeToolPermissionPolicy;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
  contextModifier?: (context: ToolRuntimeContext) => ToolRuntimeContext;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeConfig {
  promptSections: AgentPromptSections;
  mcpInstructions: string;
  skillsCatalog: string;
  activeSkillIds: string[];
  runtimeVariables?: Record<string, string>;
  allTools: UnifiedToolDefinition[];
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  runtimeNotices?: string[];
}

export interface LoopOptions {
  runId: string;
  userMessageId: string;
  agentId: string;
  sessionId: string;
  providerId: string;
  model: string;
  messages: TranscriptMessage[];
  buildRuntimeContext?: (input: {
    sessionId: string;
    agentId: string;
    model: string;
    step: number;
    toolContext: ToolRuntimeContext;
  }) => string;
  runtimeConfig: AgentRuntimeConfig;
  agentVariables: Record<string, string>;
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    context: ToolRuntimeContext,
  ) => Promise<ToolExecutionResult>;
  toolContext?: ToolRuntimeContext;
  llmRequestConfig?: LlmRequestConfig;
  providerState?: ProviderTransportState;
  contextState: SessionContextState;
  resolveContextLimit: () => Promise<number | undefined>;
  modelContentByMessageId?: Record<string, ModelContentPart[]>;
  onAssistantBlockDelta?: (messageId: string, block: import("kk-agent-contract").TranscriptBlock) => void;
  onAssistantMessage?: (message: TranscriptMessage) => void;
  onAssistantAttemptDiscarded?: (messageIds: string[]) => void;
  onRunEvent?: (event: RunEvent) => void | Promise<void>;
  onModelInput?: (input: ModelInputDebug) => void | Promise<void>;
  onModelInputOutcome?: (inputId: string, outcome: NonNullable<ModelInputDebug["outcome"]>) => void | Promise<void>;
  onCheckpoint?: (checkpoint: LoopCheckpoint) => void | Promise<void>;
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
  ) => Promise<{ allowed: boolean; reason?: string }>;
  onLoopState?: (state: AgentLoopState) => void;
  onStats?: (stats: TokenStats) => void;
  onContextUsage?: (usage: SessionContextUsage) => void;
  abortSignal?: AbortSignal;
}

export interface LoopResult {
  finalResponse: string;
}

export interface LoopCheckpoint {
  messages: TranscriptMessage[];
  status: "running" | "completed" | "stopped" | "failed" | "aborted";
  step: number;
  attempt: number;
  toolBatch: number;
  toolContext: ToolRuntimeContext;
  providerState?: ProviderTransportState;
  providerDebug?: ProviderTurnDebug;
  contextState: SessionContextState;
}
