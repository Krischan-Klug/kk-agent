export type EndpointType = "chat-completions" | "responses";
export type ReasoningControl = "none" | "effort" | "on-off";
export type ReasoningSource = "none" | "declared" | "observed";
export type ReasoningTransport = "none" | "chat-completions-effort" | "chat-completions-on-off" | "responses-effort";
export type ToolSchemaTransport = "chat-completions-tools" | "responses-tools";
export type StreamGrammar = "openai-chat-completions" | "openai-responses";
export type ToolCallAssemblyMode = "chat-completions-indexed" | "responses-output-state";
export type ContinuationMode = "none" | "raw-output-replay" | "previous-response-id" | "conversations";

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
  supportsParallelToolCalls: boolean;
  supportsConcatenatedJsonSplit: boolean;
  continuationMode: ContinuationMode;
  supportsPreviousResponseId: boolean;
  supportsConversations: boolean;
  supportsStrictTools: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface ProvidersState {
  providers: ProviderConfig[];
  activeProviderId: string;
  modelSettings: Record<string, ModelSettings>;
  observedReasoning: Record<string, { observed: boolean; lastObservedAt: string }>;
}

export interface ModelCapabilities {
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  reasoningSource: ReasoningSource;
  supportsStreaming: boolean;
  supportedEndpoints: EndpointType[];
  reasoningControl: ReasoningControl;
  reasoningLevels: string[];
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

export interface ReasoningLevelConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ModelSettings {
  endpoint?: EndpointType;
  reasoningEffort?: string;
  levels?: Record<string, ReasoningLevelConfig>;
}
