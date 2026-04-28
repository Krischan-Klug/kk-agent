import type {
  McpServerConfig,
  McpToolDefinition,
  TranscriptMessage,
} from "@krischan-klug/kk-agent-contract";

export type {
  AgentDefinition,
  AgentLoopState,
  AgentModeDefinition,
  AgentModeConfig,
  AgentPromptSections,
  AppDefaults,
  AttachmentDisplayMeta,
  AttachmentMeta,
  ModeBehavior,
  CreateAgentBody,
  CreateProviderBody,
  CreateSessionBody,
  EndpointCapabilities,
  EndpointType,
  LlmRequestConfig,
  CreateMcpBody,
  CreateSkillBody,
  MemoryFact,
  McpServerConfig,
  McpStdioConfig,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  ReasoningEffort,
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
  TranscriptAttachmentRefBlock,
  TranscriptToolResultBlock,
  TranscriptToolUseBlock,
  UpdateAgentBody,
  UpdateMcpBody,
  UpdateProviderBody,
  UpdateSessionBody,
  UpdateSkillBody,
} from "@krischan-klug/kk-agent-contract";

export type SessionMessage = TranscriptMessage;

export interface McpListItem extends McpServerConfig {
  running: boolean;
  tools: McpToolDefinition[];
}

export interface SystemVariablesResponse {
  variables: string[];
}
