import type { ChatMode, AgentLoopState } from "../agent/types.js";
import type { TranscriptBlock, TranscriptMessage } from "../lib/transcript.js";
import type { ToolExecutionStatus } from "@krischan-klug/kk-agent-contract";
import type { ProviderTransportState, ProviderTurnDebug } from "../provider/lib/types.js";
import type { SessionState } from "@krischan-klug/kk-agent-contract";

export type {
  AttachmentDisplayMeta,
  AttachmentMeta,
  CreateSessionBody,
  SessionState,
  UpdateSessionBody,
} from "@krischan-klug/kk-agent-contract";

export interface SessionRecord extends SessionState {
  providerState?: ProviderTransportState;
}

export interface ChatBody {
  message: string;
  attachmentIds?: string[];
}

export interface SessionRuntimeToolDebug {
  name: string;
  description: string;
  capabilityId: string;
  source: "system" | "mcp";
  inputSchema: Record<string, unknown>;
}

export interface SessionRuntimeMcpDebug {
  id: string;
  name: string;
  instruction: string;
  emoji?: string;
  source?: "custom";
  active: boolean;
  running: boolean;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface SessionRuntimeSkillDebug {
  id: string;
  name: string;
  description: string;
  instruction: string;
  active: boolean;
  source?: "system" | "custom";
  recommendedToolIds: string[];
  recommendedMcpIds: string[];
  allowedModes: ChatMode[];
}

export interface SessionPromptDebug {
  systemPrompt: string;
  metaMessages: string[];
  runtimeTools: SessionRuntimeToolDebug[];
  runtimeMcps: SessionRuntimeMcpDebug[];
  runtimeSkills: SessionRuntimeSkillDebug[];
}

export type SSEEvent =
  | { type: "assistant_block_delta"; messageId: string; block: TranscriptBlock }
  | { type: "assistant_message_complete"; message: TranscriptMessage }
  | {
      type: "tool_execution_update";
      toolUseId: string;
      toolName: string;
      status: ToolExecutionStatus;
      result?: TranscriptMessage;
      detail?: string;
      summary?: string;
    }
  | { type: "turn_state"; state: AgentLoopState }
  | { type: "system_notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "stats"; inputTokens: number; outputTokens: number; reasoningTokens: number; source: "provider" | "estimated" | "unknown" }
  | { type: "user_prompt"; promptId: string; question: string; choices: { key: string; label: string }[] }
  | { type: "done"; session: SessionState }
  | { type: "error"; message: string };
