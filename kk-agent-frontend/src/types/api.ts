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
  AgentModeSource,
  AgentPromptSections,
  AppDefaults,
  AttachmentDisplayMeta,
  AttachmentMeta,
  AutonomousBudget,
  ModeBehavior,
  ContinuationMode,
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
  McpSource,
  McpSseConfig,
  McpStdioConfig,
  McpToolDefinition,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  ProviderTurnDebug,
  ReasoningEffort,
  ResolvedLlmRequestConfig,
  RuntimeToolSource,
  SessionPromptDebug,
  SessionRuntimeMcpDebug,
  SessionRuntimeSkillDebug,
  SessionRuntimeToolDebug,
  SessionState,
  SkillDefinition,
  SkillMetadata,
  SkillSource,
  SystemMcpConfig,
  SystemMcpKey,
  StreamEvent,
  TaskItem,
  TaskStatus,
  ToolAccessScope,
  ToolExecutionStatus,
  TranscriptBlock,
  TranscriptAttachmentRefBlock,
  TranscriptMessage,
  TranscriptReasoningBlock,
  TranscriptTextBlock,
  TranscriptToolResultBlock,
  TranscriptToolUseBlock,
  UpdateAgentBody,
  UpdateMcpBody,
  UpdateProviderBody,
  UpdateSessionBody,
  UpdateSkillBody,
  VisionSupport,
} from "@krischan-klug/kk-agent-contract";

export type SessionMessage = TranscriptMessage;

export interface McpListItem extends McpServerConfig {
  running: boolean;
  tools: McpToolDefinition[];
}

export interface SystemVariablesResponse {
  variables: string[];
}
