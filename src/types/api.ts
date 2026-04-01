/* Session */

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  activeToolIds: string[];
  activeMcpIds: string[];
  systemPrompt: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CreateSessionBody {
  agentId: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface UpdateSessionBody {
  agentId?: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
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
  systemKey?: "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory";
  systemConfig?: {
    rootPath?: string;
    workingDirectory?: string;
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
    rootPath?: string;
    workingDirectory?: string;
  };
}

/* Agent */

export type ReasoningEffort = string;
export type AgentLoopMode = "simple" | "plan_execute" | "full_verify";

export interface AgentPhasePrompts {
  planning?: string;
  executing?: string;
  verifying?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  maxIterations: number;
  toolIds: string[];
  mcpIds: string[];
  toolInstructions: Record<string, string>;
  mcpInstructions: Record<string, string>;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  loopMode: AgentLoopMode;
  phasePrompts: AgentPhasePrompts;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error";
  phase: "planning" | "executing" | "verifying" | "completed" | "error";
  iteration: number;
  maxIterations: number;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAgentBody {
  name: string;
  description?: string;
  systemPrompt?: string;
  maxIterations?: number;
  toolIds?: string[];
  mcpIds?: string[];
  toolInstructions?: Record<string, string>;
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  loopMode?: AgentLoopMode;
  phasePrompts?: AgentPhasePrompts;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  systemPrompt?: string;
  maxIterations?: number;
  toolIds?: string[];
  mcpIds?: string[];
  toolInstructions?: Record<string, string>;
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  loopMode?: AgentLoopMode;
  phasePrompts?: AgentPhasePrompts;
}

export interface SystemVariablesResponse {
  variables: string[];
}

/* Defaults */

export interface AppDefaults {
  agent: {
    systemPrompt: string;
    maxIterations: number;
    loopMode: AgentLoopMode;
    phasePrompts: {
      planningPrompt: string;
      executingPrompt: string;
      verifyingPrompt: string;
    };
    phaseGuidance: {
      planning: string;
      executing: string;
      verifying: string;
    };
    promptSections: {
      taskWithSession: string;
      memoryWithSession: string;
      toolRulesWithSession: string;
    };
  };
  loop: {
    verificationInstruction: string;
    verificationRetryMessage: string;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
}

/* Streaming */

export type StreamEvent =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "content_reset" }
  | { type: "retry_notice"; message: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; content: string; isError: boolean }
  | { type: "loop_state"; state: AgentLoopState }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
