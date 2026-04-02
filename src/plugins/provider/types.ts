export type EndpointType = "chat-completions" | "responses";
export type ReasoningControl = "none" | "effort" | "on-off";
export type ReasoningSource = "none" | "declared" | "observed";

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
