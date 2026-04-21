import type { ChatMode } from "./agent.js";
import type { ProviderTurnDebug, LlmRequestConfig } from "./provider.js";
import type { TranscriptMessage } from "./transcript.js";

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
  activeMode: ChatMode;
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
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}

export interface UpdateSessionBody {
  agentId?: string;
  providerId?: string;
  activeMode?: ChatMode;
  model?: string;
  activeToolIds?: string[];
  activeMcpIds?: string[];
  activeSkillIds?: string[];
  llmRequestConfig?: LlmRequestConfig;
}
