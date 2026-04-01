/* ── Agent Definition (persisted) ── */

export type ReasoningEffort = string;
export type AgentLoopMode = "simple" | "plan_execute" | "full_verify";
export type AgentLoopPhase = "planning" | "executing" | "verifying" | "completed" | "error";

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

/* ── Runtime Loop State (in-memory) ── */

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error";
  phase: AgentLoopPhase;
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
