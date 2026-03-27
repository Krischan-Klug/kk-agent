import type { AgentLoopState, ReasoningEffort } from "../agent/types.js";

export interface SessionState {
  id: string;
  name: string;
  model: string;
  agentId: string;
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
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface CreateSessionBody {
  agentId: string;
  model?: string;
  activeMcpIds?: string[];
  reasoningEffort?: ReasoningEffort;
}

export interface ChatBody {
  message: string;
}

export type SSEEvent =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "retry_notice"; message: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; content: string; isError: boolean }
  | { type: "loop_state"; state: AgentLoopState }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
