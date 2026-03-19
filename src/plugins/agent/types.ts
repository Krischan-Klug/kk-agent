/* ── Agent Definition (persisted) ── */

export type ReasoningEffort = string;

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  loopStrategy: LoopStrategy;
  promptTemplates: PromptTemplates;
  mcpIds: string[];
  mcpInstructions: Record<string, string>; // agent-specific overrides per mcpId
  variables: Record<string, string>;       // custom template variables (e.g. PROJECT_NAME)
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  compactionPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplates {
  base: string;
  phases: Record<string, string>;
}

/* ── Loop Strategy ── */

export interface LoopStrategy {
  initialPhase: string;
  maxTotalIterations: number;
  phases: LoopPhase[];
}

export interface LoopPhase {
  name: string;
  description: string;
  maxIterations: number;
  toolFilter?: ToolFilter;
  transitions: PhaseTransition[];
  autoAdvance: boolean;
}

export interface ToolFilter {
  mode: "include" | "exclude";
  toolNames: string[];
}

export interface PhaseTransition {
  to: string;
  condition: TransitionCondition;
}

export type TransitionCondition =
  | { type: "max_iterations" }
  | { type: "no_tool_calls" }
  | { type: "tool_called"; toolName: string }
  | { type: "keyword"; keyword: string }
  | { type: "always" };

/* ── Runtime Loop State (in-memory) ── */

export interface AgentLoopState {
  sessionId: string;
  agentId: string;
  status: "idle" | "running" | "completed" | "error";
  currentPhase: string;
  phaseIteration: number;
  totalIteration: number;
  phaseHistory: PhaseHistoryEntry[];
  startedAt: string;
  updatedAt: string;
}

export interface PhaseHistoryEntry {
  phase: string;
  iterations: number;
  toolCallCount: number;
  transitionReason: string;
  startedAt: string;
  endedAt: string;
}

/* ── API Bodies ── */

export interface CreateAgentBody {
  name: string;
  description?: string;
  loopStrategy: LoopStrategy;
  promptTemplates: PromptTemplates;
  mcpIds?: string[];
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  compactionPrompt?: string;
}

export interface UpdateAgentBody {
  name?: string;
  description?: string;
  loopStrategy?: LoopStrategy;
  promptTemplates?: PromptTemplates;
  mcpIds?: string[];
  mcpInstructions?: Record<string, string>;
  variables?: Record<string, string>;
  defaultModel?: string;
  reasoningEffort?: ReasoningEffort;
  compactionPrompt?: string;
}
