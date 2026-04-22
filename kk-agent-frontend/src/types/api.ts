import type {
  AgentLoopState,
  AgentPromptSections,
  AutonomousBudget,
  ModeBehavior,
  McpServerConfig,
  McpToolDefinition,
  SessionState,
  TaskStatus,
  ToolExecutionStatus,
  TranscriptBlock,
  TranscriptMessage,
} from "@krischan-klug/kk-agent-contract";

export type {
  AgentDefinition,
  AgentLoopState,
  AgentModeDefinition,
  AgentModeConfig,
  AgentModeSource,
  AgentPromptSections,
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
  SessionState,
  SkillDefinition,
  SkillMetadata,
  SkillSource,
  SystemMcpConfig,
  SystemMcpKey,
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
  instruction: string;
  active: boolean;
  source?: "system" | "custom";
  recommendedToolIds: string[];
  recommendedMcpIds: string[];
  allowedModeBehaviors: ModeBehavior[];
}

export interface SessionPromptDebug {
  systemPrompt: string;
  metaMessages: string[];
  runtimeTools: SessionRuntimeToolDebug[];
  runtimeMcps: SessionRuntimeMcpDebug[];
  runtimeSkills: SessionRuntimeSkillDebug[];
}

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
}

export interface McpListItem extends McpServerConfig {
  running: boolean;
  tools: McpToolDefinition[];
}

export interface SystemVariablesResponse {
  variables: string[];
}

export interface AppDefaults {
  agent: {
    defaultModeBehavior: ModeBehavior;
    promptSections: AgentPromptSections;
    modeTemplates: Record<ModeBehavior, {
      label: string;
      modeInstruction: string;
      autonomousBudget?: AutonomousBudget;
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
  attachment: {
    visionNotSupportedInstruction: string;
  };
}

export type StreamEvent =
  | { type: "assistant_block_delta"; messageId: string; block: TranscriptBlock }
  | { type: "assistant_message_complete"; message: SessionMessage }
  | {
      type: "tool_execution_update";
      toolUseId: string;
      toolName: string;
      status: ToolExecutionStatus;
      result?: SessionMessage;
      detail?: string;
      summary?: string;
    }
  | { type: "turn_state"; state: AgentLoopState }
  | { type: "system_notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
