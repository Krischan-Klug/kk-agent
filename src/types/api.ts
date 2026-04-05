/* Session */

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  activeMode: ChatMode;
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  messages: SessionMessage[];
  providerDebug?: ProviderTurnDebug;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderTurnDebug {
  endpoint: EndpointType;
  continuationMode?: "none" | "raw-output-replay";
  responseId?: string;
  outputCount?: number;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  size: number;
}

export interface AttachmentDisplayMeta {
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  size: number;
  previewDataUrl?: string;
}

export interface TranscriptTextBlock {
  type: "text";
  text: string;
}

export interface TranscriptReasoningBlock {
  type: "reasoning";
  text: string;
}

export interface TranscriptToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TranscriptToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TranscriptAttachmentRefBlock extends AttachmentDisplayMeta {
  type: "attachment_ref";
  attachmentId?: string;
}

export type TranscriptBlock =
  | TranscriptTextBlock
  | TranscriptReasoningBlock
  | TranscriptToolUseBlock
  | TranscriptToolResultBlock
  | TranscriptAttachmentRefBlock;

export interface TranscriptUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: TranscriptBlock[];
  timestamp: string;
  requestId?: string;
  stopReason?: "stop" | "tool_use" | "length";
  isMeta?: boolean;
  isApiError?: boolean;
  usage?: TranscriptUsage;
}

export interface CreateSessionBody {
  agentId: string;
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface UpdateSessionBody {
  agentId?: string;
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface SessionPromptDebug {
  systemPrompt: string;
  metaMessages: string[];
}

export type TaskStatus = "pending" | "in_progress" | "completed";

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

/* MCP */

export interface McpServerConfig {
  id: string;
  name: string;
  active: boolean;
  instruction: string;
  emoji?: string;
  source?: "system" | "custom";
  systemKey?: "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory" | "attachment" | "skill";
  systemConfig?: {
    accessScope?: "user" | "system";
    basePath?: string;
    workingDirectory?: string;
    resultPolicy?: {
      previewThresholdChars?: number;
      previewChars?: number;
    };
  };
  transport: "stdio" | "sse";
  server: McpStdioConfig | McpSseConfig;
}

export interface McpStdioConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpSseConfig {
  url: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mcpId: string;
}

export interface McpListItem extends McpServerConfig {
  running: boolean;
  tools: McpToolDefinition[];
}

export type EndpointType = "chat-completions" | "responses";

export interface ModelInfo {
  id: string;
  object: string;
  providerId: string;
  maxContextLength?: number;
  contextLength?: number;
  capabilities: {
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsVision: boolean;
    reasoningSource: "none" | "declared" | "observed";
    supportsStreaming: boolean;
    supportedEndpoints: EndpointType[];
    reasoningControl: "none" | "effort" | "on-off";
    reasoningLevels: string[];
    endpointCapabilities: Partial<Record<EndpointType, {
      temperatureSupported: boolean;
      temperatureRange?: { min: number; max: number; step?: number };
      maxOutputTokensSupported: boolean;
      maxOutputTokensRange?: { min: number; max: number; step?: number };
    }>>;
    transportProfiles?: Partial<Record<EndpointType, {
      supported: boolean;
    }>>;
  };
}

export interface ReasoningLevelConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelSettings {
  endpoint?: EndpointType;
  reasoningEffort?: ReasoningEffort;
  levels?: Record<string, ReasoningLevelConfig>;
}

/* Provider */

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface CreateProviderBody {
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface UpdateProviderBody {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface CreateMcpBody {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  instruction?: string;
  emoji?: string;
}

export interface UpdateMcpBody {
  name?: string;
  active?: boolean;
  transport?: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  instruction?: string;
  emoji?: string;
  systemConfig?: {
    accessScope?: "user" | "system";
    basePath?: string;
    workingDirectory?: string;
    resultPolicy?: {
      previewThresholdChars?: number;
      previewChars?: number;
    };
  };
}

/* Agent */

export type ReasoningEffort = string;
export type ChatMode = "plan" | "edit";
export type ToolAccessScope = "user" | "system";
export type ToolExecutionStatus = "queued" | "executing" | "yielded" | "completed" | "error" | "discarded" | "invalid";

export interface AgentPromptSections {
  identity: string;
  system: string;
  runtime: string;
  tasks: string;
  security: string;
  toolUsage: string;
  communication: string;
}

export interface AgentModeConfig {
  promptSections: AgentPromptSections;
  modeInstruction: string;
  toolIds: string[];
  mcpIds: string[];
  skillIds: string[];
  toolAccessScopes: Record<string, ToolAccessScope>;
  toolInstructions: Record<string, string>;
  mcpInstructions: Record<string, string>;
  skillInstructions: Record<string, string>;
  allowedToolNames: string[];
}

export interface AgentModeConfigPatch {
  promptSections?: Partial<AgentPromptSections>;
  modeInstruction?: string;
  toolIds?: string[];
  mcpIds?: string[];
  skillIds?: string[];
  toolAccessScopes?: Record<string, ToolAccessScope>;
  toolInstructions?: Record<string, string>;
  mcpInstructions?: Record<string, string>;
  skillInstructions?: Record<string, string>;
  allowedToolNames?: string[];
}

export type SkillSource = "system" | "custom";

export interface SkillDefinition {
  id: string;
  path: string;
  active: boolean;
  source?: SkillSource;
  recommendedToolIds: string[];
  recommendedMcpIds: string[];
  allowedModes: ChatMode[];
  name: string;
  description: string;
  instruction: string;
}

export interface CreateSkillBody {
  name: string;
  description: string;
  instruction: string;
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModes?: ChatMode[];
}

export interface UpdateSkillBody {
  name?: string;
  description?: string;
  instruction?: string;
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModes?: ChatMode[];
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  defaultChatMode: ChatMode;
  modeConfigs: Record<ChatMode, AgentModeConfig>;
  maxIterations: number;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error";
  mode: ChatMode;
  iteration: number;
  maxIterations: number;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAgentBody {
  name: string;
  description?: string;
  defaultChatMode?: ChatMode;
  modeConfigs?: Partial<Record<ChatMode, AgentModeConfigPatch>>;
  maxIterations?: number;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  defaultChatMode?: ChatMode;
  modeConfigs?: Partial<Record<ChatMode, AgentModeConfigPatch>>;
  maxIterations?: number;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface SystemVariablesResponse {
  variables: string[];
}

/* Defaults */

export interface AppDefaults {
  agent: {
    defaultChatMode: ChatMode;
    maxIterations: number;
    promptSections: AgentPromptSections;
    modeInstructions: Record<ChatMode, string>;
    modeToolIds: Record<ChatMode, string[]>;
    modeAllowedToolNames: Record<ChatMode, string[]>;
    modeToolInstructions: Record<ChatMode, Record<string, string>>;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
  };
  misc: {
    noTasksInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
  attachment: {
    visionNotSupportedInstruction: string;
  };
}

/* Streaming */

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
