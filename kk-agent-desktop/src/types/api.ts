import type { TranscriptMessage } from "kk-agent-contract";

export type {
  AgentDefinition,
  AgentLoopState,
  AgentModeDefinition,
  AgentModeConfig,
  AgentPromptSections,
  AppDefaults,
  AutonomousBudget,
  AssetMeta,
  ModeBehavior,
  CreateAgentBody,
  CreateProviderBody,
  CreateSessionBody,
  EndpointType,
  ImportSkillResult,
  LlmRequestConfig,
  CreateMcpBody,
  MemoryFact,
  McpListItem,
  McpServerConfig,
  McpStdioConfig,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  ReasoningEffort,
  RunEvent,
  SessionPromptDebug,
  SessionRuntimeMcpDebug,
  SessionRuntimeSkillDebug,
  SessionRuntimeToolDebug,
  SessionState,
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
  UpdateProviderBody,
  UpdateSessionBody,
} from "kk-agent-contract";

export type SessionMessage = TranscriptMessage;

export interface SystemVariablesResponse {
  variables: string[];
}
