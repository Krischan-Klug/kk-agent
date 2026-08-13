import type { ProviderTurnDebug, LlmRequestConfig } from "./provider.js";
import type { AgentLoopState, AgentPromptSections, ModeBehavior } from "./agent.js";
import type { ToolExecutionStatus, TranscriptBlock, TranscriptMessage } from "./transcript.js";

export type AssetKind = "image" | "pdf" | "document" | "presentation" | "spreadsheet" | "text";
export type AssetSource = "user" | "assistant";

export interface AssetMeta {
  id: string;
  filename: string;
  mimeType: string;
  kind: AssetKind;
  source: AssetSource;
  size: number;
  textAvailable: boolean;
  previewAvailable: boolean;
  pageCount?: number;
}

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  activeModeId: string;
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: LlmRequestConfig;
  messages: TranscriptMessage[];
  runs: AgentRun[];
  assets: AssetMeta[];
  providerDebug?: ProviderTurnDebug;
  createdAt: string;
  updatedAt: string;
}

export type AgentRunStatus = "running" | "completed" | "stopped" | "failed" | "aborted";
export type RunEventSeverity = "info" | "warning" | "error";
export type RunEventKind =
  | "provider_retry"
  | "provider_notice"
  | "context_compacted"
  | "model_retry"
  | "tool_error"
  | "output_limit"
  | "run_limit"
  | "run_failed"
  | "run_aborted";

export interface RunEvent {
  id: string;
  runId: string;
  sessionId: string;
  anchorMessageId: string;
  kind: RunEventKind;
  severity: RunEventSeverity;
  message: string;
  code?: string;
  detail?: string;
  step: number;
  attempt: number;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  userMessageId: string;
  status: AgentRunStatus;
  step: number;
  attempt: number;
  toolBatch: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  events: RunEvent[];
  artifactIds: string[];
}

export interface CreateSessionBody {
  agentId: string;
  providerId?: string;
  activeModeId?: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateSessionBody {
  agentId?: string;
  providerId?: string;
  activeModeId?: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}

export interface SessionRuntimeToolDebug {
  name: string;
  description: string;
  capabilityId: string;
  source: "system" | "mcp";
  inputSchema: Record<string, unknown>;
}

export interface SessionRuntimeMcpDebug {
  id: string;
  name: string;
  instruction: string;
  emoji?: string;
  source?: "custom";
  active: boolean;
  running: boolean;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface SessionRuntimeSkillDebug {
  id: string;
  name: string;
  description: string;
  path: string;
  source: "managed" | "user" | "workspace";
  resources: string[];
  loaded: boolean;
}

export interface SessionPromptDebug {
  systemPrompt: string;
  runtimeContext: string;
  runtimeTools: SessionRuntimeToolDebug[];
  runtimeMcps: SessionRuntimeMcpDebug[];
  runtimeSkills: SessionRuntimeSkillDebug[];
}

export interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  notes?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
}

export interface AppDefaults {
  agent: {
    defaultModeBehavior: ModeBehavior;
    promptSections: AgentPromptSections;
    modeTemplates: Record<ModeBehavior, {
      label: string;
      modeInstruction: string;
      toolIds: string[];
      allowedToolNames: string[];
      toolInstructions: Record<string, string>;
    }>;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
  asset: {
    visionNotSupportedInstruction: string;
  };
}

export type StreamEvent =
  | { type: "assistant_block_delta"; messageId: string; block: TranscriptBlock }
  | { type: "assistant_message_complete"; message: TranscriptMessage }
  | { type: "assistant_attempt_discarded"; messageIds: string[] }
  | {
      type: "tool_execution_update";
      toolUseId: string;
      toolName: string;
      input?: Record<string, unknown>;
      status: ToolExecutionStatus;
      result?: TranscriptMessage;
      detail?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
    }
  | { type: "turn_state"; state: AgentLoopState }
  | { type: "run_event"; event: RunEvent }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "transport_error"; message: string };
