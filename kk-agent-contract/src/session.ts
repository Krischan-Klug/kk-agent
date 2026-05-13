import type { ProviderTurnDebug, LlmRequestConfig } from "./provider.js";
import type { AgentLoopState, AgentPromptSections, AutonomousBudget, ModeBehavior } from "./agent.js";
import type { ToolExecutionStatus, TranscriptBlock, TranscriptMessage } from "./transcript.js";

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  source: "user" | "assistant";
  size: number;
}

export interface AttachmentDisplayMeta {
  attachmentId?: string;
  filename: string;
  mimeType: string;
  category: "image" | "text" | "pdf";
  source: "user" | "assistant";
  size: number;
  previewDataUrl?: string;
}

export interface SessionState {
  id: string;
  name: string;
  providerId: string;
  model: string;
  agentId: string;
  activeModeId: string;
  activeToolIds: string[];
  activeMcpIds: string[];
  activeSkillIds: string[];
  llmRequestConfig?: LlmRequestConfig;
  messages: TranscriptMessage[];
  providerDebug?: ProviderTurnDebug;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionBody {
  agentId: string;
  providerId?: string;
  activeModeId?: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateSessionBody {
  agentId?: string;
  providerId?: string;
  activeModeId?: string;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
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
  source?: "system" | "custom";
  linkedToolIds: string[];
  linkedMcpIds: string[];
}

export interface SessionPromptDebug {
  systemPrompt: string;
  metaMessages: string[];
  runtimeTools: SessionRuntimeToolDebug[];
  runtimeMcps: SessionRuntimeMcpDebug[];
  runtimeSkills: SessionRuntimeSkillDebug[];
}

export interface TaskItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  notes?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
}

export interface AppDefaults {
  agent: {
    defaultModeBehavior: ModeBehavior;
    promptSections: AgentPromptSections;
    modeTemplates: Record<ModeBehavior, {
      label: string;
      modeInstruction: string;
      autonomousBudget?: AutonomousBudget;
      toolIds: string[];
      allowedToolNames: string[];
      toolInstructions: Record<string, string>;
    }>;
  };
  retry: {
    emptyResponseInstruction: string;
    invalidToolInstruction: string;
  };
  reasoning: {
    defaultEffort: string;
  };
  attachment: {
    visionNotSupportedInstruction: string;
  };
}

export type StreamEvent =
  | { type: "assistant_block_delta"; messageId: string; block: TranscriptBlock }
  | { type: "assistant_message_complete"; message: TranscriptMessage }
  | {
      type: "tool_execution_update";
      toolUseId: string;
      toolName: string;
      input?: Record<string, unknown>;
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
