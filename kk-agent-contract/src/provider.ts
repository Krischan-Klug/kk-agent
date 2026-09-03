import type {
  ReasoningEffort,
  ReasoningHistory,
  ResolvedReasoningHistory,
} from "./common.js";

export type EndpointType = "chat-completions" | "responses" | "lmstudio-chat";
export type ReasoningControl = "none" | "binary" | "effort";
export type ModelInputModality = "text" | "image" | "audio" | "video" | "file";
export type ModelOutputModality = "text" | "image" | "audio";
export type ToolUseMode = "none" | "native";
export type ContinuationMode = "none" | "raw-output-replay" | "previous-response-id";

export interface NumericRange {
  min: number;
  max: number;
  step?: number;
}

export interface EndpointCapabilities {
  temperatureSupported: boolean;
  temperatureRange?: NumericRange;
}

export interface EndpointTransportProfile {
  supportsConcatenatedJsonSplit: boolean;
  continuationMode: ContinuationMode;
}

export interface ModelCompactionProfile {
  endpoint: EndpointType;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  inputBudgetRatio: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
}

export interface CreateProviderBody {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
}

export interface UpdateProviderBody {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
}

export interface ProvidersState {
  schemaVersion: number;
  providers: ProviderConfig[];
  modelSettings: Record<string, ModelSettings>;
}

export interface ModelReasoningCapabilities {
  control: ReasoningControl;
  allowedEfforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  defaultHistory: ResolvedReasoningHistory;
}

export interface ModelToolCapabilities {
  mode: ToolUseMode;
  protocol?: string;
}

export interface ModelCapabilities {
  inputModalities: ModelInputModality[];
  outputModalities: ModelOutputModality[];
  tools: ModelToolCapabilities;
  reasoning: ModelReasoningCapabilities;
  supportsStreaming: boolean;
  endpoint: EndpointType;
  endpointCapabilities: EndpointCapabilities;
  transport: EndpointTransportProfile;
}

export interface RuntimeModelCapabilities {
  visualInputSupported?: boolean;
}

export interface ModelCompatibilityIssue {
  code: "runtime_modality_unavailable";
  message: string;
}

export interface ModelProfileSummary {
  id: string;
  manufacturer: string;
  modelName: string;
  profileVersion: number;
  label: string;
  sourceUrl?: string;
  endpoint: EndpointType;
  inputModalities: ModelInputModality[];
  outputModalities: ModelOutputModality[];
  tools: ModelToolCapabilities;
  reasoning: ModelReasoningCapabilities;
  sampling: {
    thinking?: ResolvedSamplingConfig;
    direct?: ResolvedSamplingConfig;
  };
  compaction: ModelCompactionProfile;
}

export interface ModelInfo {
  id: string;
  object: string;
  providerId: string;
  maxContextLength?: number;
  contextLength?: number;
  runtimeCapabilities: RuntimeModelCapabilities;
  suggestedProfileId?: string;
  profile?: ModelProfileSummary;
  capabilities?: ModelCapabilities;
  compatibilityIssues: ModelCompatibilityIssue[];
}

export interface ReasoningConfig {
  effort?: ReasoningEffort;
  history?: ReasoningHistory;
}

export interface SamplingOverrides {
  temperature?: number;
  topP?: number;
}

export interface LlmRequestConfig {
  reasoning?: ReasoningConfig;
  sampling?: SamplingOverrides;
}

export interface ResolvedSamplingConfig extends SamplingOverrides {
  topK?: number;
  minP?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
}

export interface ResolvedLlmRequestConfig {
  endpoint: EndpointType;
  profileId: string;
  reasoning: {
    requestedEffort?: ReasoningEffort;
    effectiveEffort?: ReasoningEffort;
    requestedHistory: ReasoningHistory;
    effectiveHistory: ResolvedReasoningHistory;
    enabled: boolean;
  };
  sampling: ResolvedSamplingConfig;
  warnings: string[];
}

export interface ModelSettings {
  profileId?: string;
  llmRequestConfig?: LlmRequestConfig;
}

export interface ProviderTurnDebug {
  endpoint: EndpointType;
  profileId?: string;
  continuationMode?: ContinuationMode;
  responseId?: string;
  outputCount?: number;
  resolvedRequestConfig?: ResolvedLlmRequestConfig;
}

export interface ModelInputDebug {
  id: string;
  purpose: "agent" | "compaction" | "recovery";
  step: number;
  attempt: number;
  createdAt: string;
  endpoint: EndpointType;
  profileId: string;
  instructions: string;
  messages: import("./transcript.js").TranscriptMessage[];
  projectedContent: Record<string, Array<
    | { type: "text"; text: string }
    | { type: "image"; detail?: "auto" | "low" | "high"; binaryOmitted: true }
  >>;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  requestConfig: ResolvedLlmRequestConfig;
  providerRequestBody: Record<string, unknown>;
  outcome?: {
    status: "accepted" | "rejected" | "failed";
    compactionPass?: number;
    compactionStage?: "segment" | "merge" | "final" | "repair";
    evidenceChars?: number;
    finishReason?: import("./transcript.js").TranscriptStopReason;
    usage?: import("./transcript.js").TranscriptUsage;
    output?: string;
    validationErrors?: string[];
    contextBeforeTokens?: number;
    contextAfterTokens?: number;
  };
}
