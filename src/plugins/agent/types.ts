export type ReasoningEffort = string;
export type ChatMode = "plan" | "edit";
export type ToolAccessScope = "user" | "system";

export interface AgentPromptSections {
  identity: string;
  system: string;
  riskyActions: string;
  toolUsage: string;
  communication: string;
}

export interface AgentModeConfig {
  promptSections: AgentPromptSections;
  modeInstruction: string;
  toolIds: string[];
  mcpIds: string[];
  toolAccessScopes: Record<string, ToolAccessScope>;
  toolInstructions: Record<string, string>;
  mcpInstructions: Record<string, string>;
  allowedToolNames: string[];
}

export interface AgentModeConfigPatch {
  promptSections?: Partial<AgentPromptSections>;
  modeInstruction?: string;
  toolIds?: string[];
  mcpIds?: string[];
  toolAccessScopes?: Record<string, ToolAccessScope>;
  toolInstructions?: Record<string, string>;
  mcpInstructions?: Record<string, string>;
  allowedToolNames?: string[];
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
