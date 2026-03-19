import type { AgentLoopState, ReasoningEffort } from "../agent/types.js";

export interface SessionState {
  id: string;
  name: string;
  model: string;
  agentId: string;
  activeMcpIds: string[];
  systemPrompt: string;
  reasoningEffort?: ReasoningEffort;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  role: "user" | "assistant" | "tool";
  content: string;
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
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; content: string; isError: boolean }
  | { type: "phase_change"; from: string; to: string; reason: string }
  | { type: "loop_state"; state: AgentLoopState }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
