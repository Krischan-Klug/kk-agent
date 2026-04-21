import type { ReasoningEffort } from "./agent.js";

export type EndpointType = "chat-completions" | "responses";
export type ReasoningControl = "none" | "effort" | "on-off";
export type ReasoningSource = "none" | "declared" | "observed" | "inferred";
export type ReasoningTransport = "none" | "chat-completions-effort" | "chat-completions-on-off" | "responses-effort";
export type ToolSchemaTransport = "chat-completions-tools" | "responses-tools";
export type StreamGrammar = "openai-chat-completions" | "openai-responses";
export type ToolCallAssemblyMode = "chat-completions-indexed" | "responses-output-state";
export type ContinuationMode = "none" | "raw-output-replay" | "previous-response-id";
export type ObservationSupportState = "supported" | "unsupported";
export type VisionSupport = "supported" | "unsupported" | "unknown";

export interface NumericRange {
  min: number;
  max: number;
  step?: number;
}

export interface EndpointCapabilities {
  temperatureSupported: boolean;
  temperatureRange?: NumericRange;
  maxOutputTokensSupported: boolean;
  maxOutputTokensRange?: NumericRange;
}

export interface EndpointTransportProfile {
  supported: boolean;
  reasoningTransport: ReasoningTransport;
  toolSchemaTransport: ToolSchemaTransport;
  streamGrammar: StreamGrammar;
  toolCallAssemblyMode: ToolCallAssemblyMode;
  supportsConcatenatedJsonSplit: boolean;
  continuationMode: ContinuationMode;
  supportsStrictTools: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface CreateProviderBody {
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface UpdateProviderBody {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ModelObservation {
  endpointSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  reasoningSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  responsesStatefulness?: ObservationSupportState;
  visionSupport?: ObservationSupportState;
  lastObservedAt: string;
}

export interface ProvidersState {
  providers: ProviderConfig[];
  modelSettings: Record<string, ModelSettings>;
  observedCapabilities: Record<string, ModelObservation>;
}

export interface ModelCapabilities {
  supportsTools: boolean;
  supportsReasoning: boolean;
  visionSupport: VisionSupport;
  reasoningSource: ReasoningSource;
  supportsStreaming: boolean;
  supportedEndpoints: EndpointType[];
  reasoningControl: ReasoningControl;
  reasoningLevels: ReasoningEffort[];
  reasoning?: {
    allowedEfforts: ReasoningEffort[];
  };
  endpointCapabilities: Partial<Record<EndpointType, EndpointCapabilities>>;
  transportProfiles: Partial<Record<EndpointType, EndpointTransportProfile>>;
}

export interface ModelInfo {
  id: string;
  object: string;
  providerId: string;
  maxContextLength?: number;
  contextLength?: number;
  capabilities: ModelCapabilities;
}

export interface CommonLlmRequestConfig {
  endpoint?: EndpointType;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmRequestConfig {
  common?: CommonLlmRequestConfig;
  extraBody?: Partial<Record<EndpointType, Record<string, unknown>>>;
}

export interface ResolvedLlmRequestConfig extends LlmRequestConfig {
  common: CommonLlmRequestConfig & { endpoint: EndpointType };
  extraBody?: Record<string, unknown>;
  omittedUnsupportedKeys: string[];
}

export interface ModelSettings {
  llmRequestConfig?: LlmRequestConfig;
}

export interface ProviderTurnDebug {
  endpoint: EndpointType;
  continuationMode?: ContinuationMode;
  responseId?: string;
  outputCount?: number;
  resolvedRequestConfig?: ResolvedLlmRequestConfig;
  attemptedEndpoints?: EndpointType[];
  endpointSelection?: "implicit" | "explicit";
  fallback?: {
    from: EndpointType;
    to: EndpointType;
    reason: string;
  };
  continuationFallback?: {
    from: ContinuationMode;
    to: ContinuationMode;
    reason: string;
  };
}
