import type { ModelInputDebug, ProviderTurnDebug, LlmRequestConfig } from "./provider.js";
import type { AgentLoopState, AgentPromptSections, ToolAccessScope } from "./agent.js";
import type { ApprovalMode } from "./tool.js";
import type { ToolExecutionStatus, TranscriptBlock, TranscriptMessage } from "./transcript.js";

export type AssetKind =
  | "image"
  | "pdf"
  | "document"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "model"
  | "archive"
  | "binary";
export type AssetSource = "user" | "assistant";

export const ASSET_EXTENSION_KINDS = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
  ".pdf": "pdf", ".docx": "document", ".odt": "document", ".rtf": "document",
  ".pptx": "presentation", ".odp": "presentation",
  ".xlsx": "spreadsheet", ".ods": "spreadsheet", ".csv": "spreadsheet", ".tsv": "spreadsheet",
  ".txt": "text", ".md": "text", ".json": "text", ".xml": "text", ".yaml": "text",
  ".yml": "text", ".html": "text", ".css": "text", ".js": "text", ".ts": "text",
  ".tsx": "text", ".jsx": "text", ".py": "text", ".rs": "text", ".go": "text",
  ".java": "text", ".c": "text", ".cpp": "text", ".h": "text", ".sh": "text",
  ".sql": "text", ".toml": "text", ".ini": "text", ".log": "text", ".env": "text",
  ".svg": "text", ".geojson": "text",
  ".obj": "model", ".stl": "model", ".ply": "model", ".gltf": "model", ".glb": "model",
  ".zip": "archive", ".gz": "archive",
  ".npy": "binary", ".npz": "binary", ".parquet": "binary", ".bin": "binary",
} as const satisfies Record<string, AssetKind>;

export const SUPPORTED_ASSET_EXTENSIONS = Object.keys(ASSET_EXTENSION_KINDS);

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

export type ContextUsageSource = "provider" | "estimated" | "unknown";

export interface SessionContextUsage {
  limitTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  usedTokens: number;
  remainingTokens: number;
  source: ContextUsageSource;
  updatedAt: string;
}

export interface SessionContextCompaction {
  id: string;
  summary: string;
  throughMessageId: string;
  beforeTokens: number;
  afterTokens: number;
  createdAt: string;
}

export interface SessionContextState {
  usage?: SessionContextUsage;
  activeCompaction?: SessionContextCompaction;
  consecutiveCompactionFailures: number;
}

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  approvalMode: ApprovalMode;
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: LlmRequestConfig;
  messages: TranscriptMessage[];
  runs: AgentRun[];
  assets: AssetMeta[];
  contextState: SessionContextState;
  providerDebug?: ProviderTurnDebug;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  agentId: string;
  model: string;
  status: AgentRunStatus | "idle";
  createdAt: string;
  updatedAt: string;
}

export type AgentRunStatus = "running" | "completed" | "stopped" | "failed" | "aborted";
export type RunEventSeverity = "info" | "warning" | "error";
export type RunEventVisibility = "debug" | "user";
export type RunErrorCategory =
  | "tool"
  | "provider_transient"
  | "provider_fatal"
  | "configuration"
  | "abort"
  | "limit"
  | "internal";
export type RunEventKind =
  | "provider_retry"
  | "provider_notice"
  | "context_compacted"
  | "model_retry"
  | "tool_error"
  | "tool_approval"
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
  visibility: RunEventVisibility;
  terminal: boolean;
  errorCategory?: RunErrorCategory;
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
  approvalMode?: ApprovalMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateSessionBody {
  agentId?: string;
  providerId?: string;
  approvalMode?: ApprovalMode;
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
  source: "internal" | "mcp";
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
  modelInputs: ModelInputDebug[];
  harnessInstructions: HarnessInstructionDebug[];
  runtimeDiagnostics: Record<string, unknown>;
}

export interface HarnessInstructionDebug {
  id: string;
  source: string;
  activation: string;
  text: string;
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
    color: string;
    promptSections: AgentPromptSections;
    toolIds: string[];
    mcpIds: string[];
    skillIds: string[];
    toolAccessScopes: Record<string, ToolAccessScope>;
    toolInstructions: Record<string, string>;
    mcpInstructions: Record<string, string>;
    allowedToolNames: string[];
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
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
  | { type: "context_usage"; usage: SessionContextUsage }
  | {
      type: "user_prompt";
      purpose: "question" | "approval";
      promptId: string;
      question: string;
      choices: { key: string; label: string }[];
    }
  | { type: "done"; session: SessionState }
  | { type: "transport_error"; message: string };
