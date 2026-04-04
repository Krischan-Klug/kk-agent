import type { TranscriptBlock, TranscriptMessage, TranscriptStopReason } from "../../lib/transcript.js";
import type { ContinuationMode, EndpointTransportProfile, EndpointType } from "../types.js";

export type ProviderMessage = TranscriptMessage;
export type ProviderBlock = TranscriptBlock;
export type UnifiedMessage = ProviderMessage;

export interface UnifiedRequest {
  providerId?: string;
  model: string;
  messages: ProviderMessage[];
  tools?: UnifiedToolDefinition[];
  stream?: boolean;
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
  endpoint?: EndpointType;
  transportProfile?: EndpointTransportProfile;
  transportState?: ProviderTransportState;
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

export interface ChatCompletionsTransportState {
  endpoint: "chat-completions";
}

export interface ResponsesConversationItem extends Record<string, unknown> {
  type?: string;
}

export interface ResponsesTransportState {
  endpoint: "responses";
  continuationMode: ContinuationMode;
  syncedMessageIds: string[];
  historyItems: ResponsesConversationItem[];
  callIdByToolUseId: Record<string, string>;
}

export type ProviderTransportState = ChatCompletionsTransportState | ResponsesTransportState;

export interface ProviderTurnDebug {
  endpoint: EndpointType;
  continuationMode?: ContinuationMode;
  responseId?: string;
  outputCount?: number;
}

export interface UnifiedResponse {
  message: ProviderMessage;
  finishReason: TranscriptStopReason;
  stats?: TokenStats;
  notices?: ProviderNotice[];
  parseIssues?: ToolCallParseIssue[];
  transportState?: ProviderTransportState;
  debug?: ProviderTurnDebug;
}

export type StreamChunk =
  | { type: "assistant_block_delta"; messageId: string; block: ProviderBlock }
  | { type: "assistant_message"; message: ProviderMessage; finishReason: TranscriptStopReason }
  | { type: "done"; finishReason: TranscriptStopReason }
  | { type: "stats"; stats: TokenStats };

export type OnChunkFn = (chunk: StreamChunk) => void;
