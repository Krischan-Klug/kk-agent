import type { ChatMode, ReasoningEffort } from "../agent/types.js";
import type { AttachmentCategory, TranscriptMessage } from "../lib/transcript.js";
import type { ToolExecutionStatus } from "../loop/types.js";
import type { ProviderTransportState, ProviderTurnDebug } from "../provider/lib/types.js";

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
}

export interface AttachmentDisplayMeta {
  filename: string;
  mimeType: string;
  category: AttachmentCategory;
  size: number;
  previewDataUrl?: string;
}

export type SessionMessage = TranscriptMessage;

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
  providerDebug?: ProviderTurnDebug;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord extends SessionState {
  providerState?: ProviderTransportState;
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
  | { type: "assistant_block_delta"; messageId: string; block: import("../lib/transcript.js").TranscriptBlock }
  | { type: "assistant_message_complete"; message: SessionMessage }
  | {
      type: "tool_execution_update";
      toolUseId: string;
      toolName: string;
      status: ToolExecutionStatus;
      result?: SessionMessage;
    }
  | { type: "turn_state"; state: import("../agent/types.js").AgentLoopState }
  | { type: "system_notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
