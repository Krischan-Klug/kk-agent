import type { TranscriptBlock, TranscriptMessage, TranscriptStopReason } from "kk-agent-contract";
import type {
  ContinuationMode,
  EndpointTransportProfile,
  EndpointType,
  LlmRequestConfig,
  ProviderTurnDebug,
  ResolvedLlmRequestConfig,
} from "../types.js";

export type { ProviderTurnDebug } from "../types.js";

export type ModelContentPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string; detail?: "auto" | "low" | "high" };

export interface UnifiedRequest {
  providerId?: string;
  model: string;
  instructions: string;
  messages: TranscriptMessage[];
  tools?: UnifiedToolDefinition[];
  endpoint?: EndpointType;
  llmRequestConfig?: LlmRequestConfig;
  resolvedLlmRequestConfig?: ResolvedLlmRequestConfig;
  providerRequestBody?: Record<string, unknown>;
  maxOutputTokens?: number;
  transportProfile?: EndpointTransportProfile;
  transportState?: ProviderTransportState;
  modelContentByMessageId?: Record<string, ModelContentPart[]>;
}

export interface UnifiedToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  source: "provider" | "estimated" | "unknown";
}

export interface ToolCallParseIssue {
  id: string;
  callId?: string;
  toolName?: string;
  code:
    | "missing_tool_name"
    | "unknown_tool_name"
    | "invalid_arguments"
    | "incomplete_arguments"
    | "non_object_arguments"
    | "split_arguments"
    | "duplicate_call_collapsed";
  message: string;
  rawArguments?: string;
  severity: "warning" | "error";
}

export interface ProviderNotice {
  level: "info" | "warning" | "error";
  message: string;
  code?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments: string;
  index: number;
}

export interface AssembledOutputItem extends Record<string, unknown> {
  type: string;
  content?: Array<Record<string, unknown>>;
  summary?: Array<Record<string, unknown>>;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface AssembledAssistantTurn {
  messageId: string;
  text: string;
  reasoning: string;
  toolCalls: NormalizedToolCall[];
  finishReason: TranscriptStopReason;
  usage?: TokenStats;
  output?: AssembledOutputItem[];
  notices: ProviderNotice[];
  parseIssues: ToolCallParseIssue[];
}

interface ChatCompletionsTransportState {
  endpoint: "chat-completions";
}

export interface ResponsesConversationItem extends Record<string, unknown> {
  type?: string;
}

export interface ResponsesTransportState {
  endpoint: "responses";
  continuationMode: ContinuationMode;
  syncedMessageIds: string[];
  callIdByToolUseId: Record<string, string>;
  lastResponseId?: string;
}

export type ProviderTransportState = ChatCompletionsTransportState | ResponsesTransportState;

export interface UnifiedResponse {
  message: TranscriptMessage;
  finishReason: TranscriptStopReason;
  stats?: TokenStats;
  notices?: ProviderNotice[];
  parseIssues?: ToolCallParseIssue[];
  transportState?: ProviderTransportState;
  debug?: ProviderTurnDebug;
}

type StreamChunk =
  | { type: "assistant_block_delta"; messageId: string; block: TranscriptBlock }
  | { type: "assistant_message"; message: TranscriptMessage; finishReason: TranscriptStopReason }
  | { type: "done"; finishReason: TranscriptStopReason }
  | { type: "stats"; stats: TokenStats };

export type OnChunkFn = (chunk: StreamChunk) => void;
