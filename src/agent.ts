import type { LlmRequestConfig } from "./provider.js";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";
export type ChatMode = "plan" | "edit" | "autonomous";
export type ToolAccessScope = "user" | "system";

export interface AgentPromptSections {
  identity: string;
  system: string;
  runtime: string;
  tasks: string;
  security: string;
  toolUsage: string;
  communication: string;
}

export interface AutonomousBudget {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxWallClockMs?: number;
  maxConsecutiveAutoContinues?: number;
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
  autonomous?: boolean;
  autonomousBudget?: AutonomousBudget;
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
  autonomous?: boolean;
  autonomousBudget?: AutonomousBudget;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  defaultChatMode: ChatMode;
  modeConfigs: Record<ChatMode, AgentModeConfig>;
  variables: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error" | "aborted";
  mode: ChatMode;
  iteration: number;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAgentBody {
  name: string;
  description?: string;
  defaultChatMode?: ChatMode;
  modeConfigs?: Partial<Record<ChatMode, AgentModeConfigPatch>>;
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  defaultChatMode?: ChatMode;
  modeConfigs?: Partial<Record<ChatMode, AgentModeConfigPatch>>;
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}
