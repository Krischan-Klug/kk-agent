import type { ChatMode, ReasoningEffort } from "../agent/types.js";

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  size: number;
}

export interface AttachmentDisplayMeta {
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  size: number;
  previewDataUrl?: string;
}

export interface SessionMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  isError?: boolean;
  reasoning?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }[];
  attachments?: AttachmentDisplayMeta[];
}

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  activeMode: ChatMode;
  activeToolIds: string[];
  activeMcpIds: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionBody {
  agentId: string;
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface UpdateSessionBody {
  agentId?: string;
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
}

export interface ChatBody {
  message: string;
  attachmentIds?: string[];
}

export type PatchSessionBody = UpdateSessionBody;

export type SSEEvent =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "content_reset" }
  | { type: "retry_notice"; message: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean }
  | { type: "loop_state"; state: import("../agent/types.js").AgentLoopState }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
