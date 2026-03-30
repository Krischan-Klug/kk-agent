/* ── Agent Definition (persisted) ── */

export type ReasoningEffort = string;

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  maxIterations: number;
  mcpIds: string[];
  mcpInstructions: Record<string, string>;
  variables: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
}

/* ── Runtime Loop State (in-memory) ── */

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error";
  iteration: number;
  maxIterations: number;
  startedAt: string;
  updatedAt: string;
}

/* ── API Bodies ── */

export interface CreateAgentBody {
  name: string;
  description?: string;
  systemPrompt?: string;
  maxIterations?: number;
  mcpIds?: string[];
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  systemPrompt?: string;
  maxIterations?: number;
  mcpIds?: string[];
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}
