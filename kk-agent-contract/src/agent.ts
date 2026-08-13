import type { LlmRequestConfig } from "./provider.js";
export type ModeBehavior = "plan" | "edit" | "autonomous";
export type AgentModeSource = "builtin" | "custom";
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
  allowedToolNames: string[];
  autonomousBudget?: AutonomousBudget;
}

export interface AgentModeDefinition {
  id: string;
  label: string;
  behavior: ModeBehavior;
  source: AgentModeSource;
  enabled: boolean;
  config: AgentModeConfig;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  defaultModeId: string;
  modes: AgentModeDefinition[];
  variables: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AgentLoopState {
  runId: string;
  sessionId: string;
  agentId: string;
  status: "running" | "completed" | "stopped" | "failed" | "aborted";
  modeId: string;
  modeBehavior: ModeBehavior;
  step: number;
  attempt: number;
  toolBatch: number;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAgentBody {
  name: string;
  description?: string;
  defaultModeId?: string;
  modes?: AgentModeDefinition[];
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  defaultModeId?: string;
  modes?: AgentModeDefinition[];
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}
