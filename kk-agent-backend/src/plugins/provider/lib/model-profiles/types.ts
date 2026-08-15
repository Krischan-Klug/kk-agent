import type {
  EndpointCapabilities,
  EndpointTransportProfile,
  ModelInputModality,
  ModelOutputModality,
  ModelReasoningCapabilities,
  ModelToolCapabilities,
  ReasoningEffort,
  ReasoningHistory,
  ResolvedReasoningHistory,
  ResolvedSamplingConfig,
} from "kk-agent-contract";

export interface ModelProfile {
  id: string;
  manufacturer: string;
  modelName: string;
  profileVersion: number;
  label: string;
  sourceUrl?: string;
  aliases: string[];
  endpoint: "chat-completions" | "responses";
  endpointCapabilities: EndpointCapabilities;
  transport: EndpointTransportProfile;
  inputModalities: ModelInputModality[];
  outputModalities: ModelOutputModality[];
  tools: ModelToolCapabilities;
  modalityOrder: "preserve" | "images-first";
  reasoning: ModelReasoningCapabilities;
  sampling: {
    thinking?: ResolvedSamplingConfig;
    direct?: ResolvedSamplingConfig;
  };
  resolveEffort: (requested: ReasoningEffort | undefined) => {
    effectiveEffort?: ReasoningEffort;
    enabled: boolean;
    warning?: string;
  };
  resolveHistory: (requested: ReasoningHistory) => {
    effectiveHistory: ResolvedReasoningHistory;
    warning?: string;
  };
  buildDirectives: (input: {
    effectiveEffort?: ReasoningEffort;
    enabled: boolean;
    history: ResolvedReasoningHistory;
  }) => {
    chatTemplateKwargs?: Record<string, string | boolean | number>;
    transportReasoningEffort?: ReasoningEffort;
    systemPrefix?: string;
  };
}
