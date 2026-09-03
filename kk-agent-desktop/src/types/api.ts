import type { TranscriptMessage } from "kk-agent-contract";

export type {
  AgentDefinition,
  AgentLoopState,
  AgentModeDefinition,
  AgentModeConfig,
  AgentPromptSections,
  ApprovalMode,
  AppDefaults,
  SecuritySettings,
  AssetMeta,
  ModeBehavior,
  CreateAgentBody,
  CreateProviderBody,
  CreateSessionBody,
  ImportSkillResult,
  LlmRequestConfig,
  CreateMcpBody,
  MemoryFact,
  ModelInputDebug,
  HarnessInstructionDebug,
  McpListItem,
  McpServerConfig,
  McpStdioConfig,
  ModelInfo,
  ModelProfileSummary,
  ModelSettings,
  ProviderConfig,
  ReasoningEffort,
  RunEvent,
  SessionPromptDebug,
  SessionState,
  SessionSummary,
  SkillDefinition,
  StreamEvent,
  TaskItem,
  ToolAccessScope,
  ToolExecutionStatus,
  TranscriptBlock,
  TranscriptAssetRefBlock,
  TranscriptToolResultBlock,
  TranscriptToolUseBlock,
  UpdateAgentBody,
  UpdateMcpBody,
  InternalToolListItem,
  InternalToolDefinition,
  UpdateInternalToolBody,
  UpdateProviderBody,
  UpdateSessionBody,
} from "kk-agent-contract";

export type SessionMessage = TranscriptMessage;

export interface RuntimeCapability {
  id: string;
  name: string;
  instruction: string;
  emoji?: string;
  runtime: { status: "running" | "stopped" | "unavailable"; error?: string };
  tools: Array<{ name: string; description: string }>;
}

export interface SystemVariablesResponse {
  variables: string[];
}
