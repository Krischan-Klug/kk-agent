import type { LlmRequestConfig } from "./provider.js";
export type ToolAccessScope = "user" | "system";

export interface AgentPromptSections {
  identity: string;
  system: string;
  runtime: string;
  security: string;
  toolUsage: string;
  communication: string;
}

export interface AgentConfig {
  color: string;
  promptSections: AgentPromptSections;
  toolIds: string[];
  mcpIds: string[];
  skillIds: string[];
  toolAccessScopes: Record<string, ToolAccessScope>;
  toolInstructions: Record<string, string>;
  mcpInstructions: Record<string, string>;
  allowedToolNames: string[];
}

export interface AgentDefinition extends AgentConfig {
  id: string;
  name: string;
  description: string;
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
  step: number;
  attempt: number;
  toolBatch: number;
  startedAt: string;
  updatedAt: string;
}

export interface CreateAgentBody extends Partial<AgentConfig> {
  name: string;
  description?: string;
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateAgentBody extends Partial<AgentConfig> {
  name?: string;
  description?: string;
  variables?: Record<string, string>;
  defaultProviderId?: string;
  defaultModel?: string;
  llmRequestConfig?: LlmRequestConfig;
}
