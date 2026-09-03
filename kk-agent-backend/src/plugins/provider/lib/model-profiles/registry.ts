import type {
  ModelCapabilities,
  ModelCompatibilityIssue,
  ModelProfileSummary,
  ReasoningHistory,
  ResolvedReasoningHistory,
  RuntimeModelCapabilities,
} from "kk-agent-contract";
import type { ModelProfile } from "./types.js";

const CHAT_TRANSPORT = {
  supportsConcatenatedJsonSplit: true,
  continuationMode: "none",
  streamMode: "sse",
  instructionRole: "system",
  includeUsageInStream: true,
  maxOutputTokensField: "max_tokens",
  reasoningHistoryField: "reasoning_content",
  parallelToolCalls: true,
  samplingFields: {
    topK: "top_k",
    minP: "min_p",
    repetitionPenalty: "repetition_penalty",
  },
} as const;

const RESPONSES_TRANSPORT = {
  supportsConcatenatedJsonSplit: true,
  continuationMode: "previous-response-id",
  streamMode: "sse",
  maxOutputTokensField: "max_output_tokens",
  strictToolSchemas: false,
  parallelToolCalls: true,
  samplingFields: {
    topK: "top_k",
    minP: "min_p",
    repetitionPenalty: "repetition_penalty",
  },
} as const;

const CHAT_JSON_TRANSPORT = { ...CHAT_TRANSPORT, streamMode: "json" } as const;
const RESPONSES_JSON_TRANSPORT = { ...RESPONSES_TRANSPORT, streamMode: "json" } as const;

const STANDARD_SAMPLING_CAPABILITIES = {
  temperatureSupported: true,
  temperatureRange: { min: 0, max: 2, step: 0.1 },
} as const;

function resolveHistoryWithDefault(
  requested: ReasoningHistory,
  defaultHistory: ResolvedReasoningHistory,
) {
  return { effectiveHistory: requested === "auto" ? defaultHistory : requested };
}

type Qwen38ProfileIdentity = Pick<
  ModelProfile,
  "id" | "modelName" | "label" | "sourceUrl" | "aliases"
>;

function createQwen38Profile(identity: Qwen38ProfileIdentity): ModelProfile {
  return {
    ...identity,
    manufacturer: "Qwen",
    endpoint: "chat-completions",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: CHAT_TRANSPORT,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "qwen" },
    modalityOrder: "preserve",
    reasoning: {
      control: "effort",
      allowedEfforts: ["none", "low", "medium", "xhigh"],
      defaultEffort: "xhigh",
      defaultHistory: "latest",
    },
    sampling: {
      thinking: {
        temperature: 1,
        topP: 0.95,
        topK: 20,
        minP: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
      },
      direct: {
        temperature: 0.7,
        topP: 0.8,
        topK: 20,
        minP: 0,
        presencePenalty: 1.5,
        repetitionPenalty: 1,
      },
    },
    compaction: {
      reasoningEffort: "none",
      maxOutputTokens: 8_000,
      inputBudgetRatio: 0.85,
    },
    resolveEffort(requested) {
      const effort = requested ?? "xhigh";
      if (effort === "none") return { effectiveEffort: "none", enabled: false };
      if (effort === "high") {
        return {
          effectiveEffort: "xhigh",
          enabled: true,
          warning: "Qwen 3.8 does not define high; resolved high to xhigh.",
        };
      }
      if (effort === "low" || effort === "medium" || effort === "xhigh") {
        return { effectiveEffort: effort, enabled: true };
      }
      return { effectiveEffort: "xhigh", enabled: true };
    },
    resolveHistory(requested) {
      return resolveHistoryWithDefault(requested, "latest");
    },
    buildDirectives({ effectiveEffort, enabled, history }) {
      return {
        chatTemplateKwargs: {
          enable_thinking: enabled,
          preserve_thinking: history !== "discard",
        },
        transportReasoningEffort: enabled && effectiveEffort !== "none"
          ? effectiveEffort
          : undefined,
      };
    },
  };
}

const profiles: readonly ModelProfile[] = [
  createQwen38Profile({
    id: "qwen/qwen3.8-27b",
    modelName: "Qwen3.8 27B",
    label: "Qwen / Qwen3.8 27B",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3.8-27B",
    aliases: ["qwen/qwen3.8-27b", "unsloth/qwen3.8-27b-gguf"],
  }),
  createQwen38Profile({
    id: "qwen/qwen3.8-flash-next",
    modelName: "Qwen3.8 Flash Next",
    label: "Qwen / Qwen3.8 Flash Next",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3.8-Flash-Next",
    aliases: ["qwen/qwen3.8-flash-next", "unsloth/qwen3.8-flash-next-gguf"],
  }),
  {
    id: "google/gemma-4-31b-it",
    manufacturer: "Google",
    modelName: "Gemma 4 31B IT",
    label: "Google / Gemma 4 31B IT",
    sourceUrl: "https://huggingface.co/google/gemma-4-31B-it",
    aliases: ["google/gemma-4-31b-it"],
    endpoint: "chat-completions",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: CHAT_TRANSPORT,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "gemma" },
    modalityOrder: "images-first",
    reasoning: {
      control: "binary",
      allowedEfforts: ["none", "high"],
      defaultEffort: "none",
      defaultHistory: "tool-turns",
    },
    sampling: {
      thinking: { temperature: 1, topP: 0.95, topK: 64 },
      direct: { temperature: 1, topP: 0.95, topK: 64 },
    },
    compaction: {
      reasoningEffort: "none",
      maxOutputTokens: 6_000,
      inputBudgetRatio: 0.8,
    },
    resolveEffort(requested) {
      const effort = requested ?? "none";
      if (effort === "none") return { effectiveEffort: "none", enabled: false };
      if (effort === "high") return { effectiveEffort: "high", enabled: true };
      return {
        effectiveEffort: "high",
        enabled: true,
        warning: `Gemma 4 exposes binary reasoning; resolved ${effort} to thinking on.`,
      };
    },
    resolveHistory(requested) {
      if (requested === "all") {
        return {
          effectiveHistory: "tool-turns",
          warning: "Gemma 4 only preserves historical reasoning for tool-call turns; resolved all to tool-turns.",
        };
      }
      return resolveHistoryWithDefault(requested, "tool-turns");
    },
    buildDirectives({ enabled }) {
      return { systemPrefix: enabled ? "<|think|>" : undefined };
    },
  },
  {
    id: "meta/muse-glimmer-30b",
    manufacturer: "Meta",
    modelName: "Muse Glimmer 30B",
    label: "Meta / Muse Glimmer 30B",
    sourceUrl: "https://huggingface.co/meta-models/Muse-Glimmer-30B",
    aliases: ["meta/muse-glimmer", "meta-models/muse-glimmer-30b"],
    endpoint: "chat-completions",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: CHAT_TRANSPORT,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "atem" },
    modalityOrder: "preserve",
    reasoning: {
      control: "effort",
      allowedEfforts: ["low", "medium", "high", "xhigh"],
      defaultEffort: "high",
      defaultHistory: "discard",
    },
    sampling: {
      thinking: { temperature: 1, topP: 0.95, topK: 64 },
    },
    compaction: {
      reasoningEffort: "low",
      maxOutputTokens: 8_000,
      inputBudgetRatio: 0.8,
    },
    resolveEffort(requested) {
      const effort = requested ?? "high";
      if (effort === "none") {
        return {
          effectiveEffort: "low",
          enabled: true,
          warning: "Muse Glimmer does not document a no-reasoning mode; resolved none to low.",
        };
      }
      return { effectiveEffort: effort, enabled: true };
    },
    resolveHistory(requested) {
      if (requested === "auto" || requested === "discard") {
        return { effectiveHistory: "discard" };
      }
      return {
        effectiveHistory: "discard",
        warning: "Muse Glimmer does not document historical reasoning replay; resolved history to discard.",
      };
    },
    buildDirectives({ effectiveEffort }) {
      const strength = effectiveEffort === "none" || !effectiveEffort ? "high" : effectiveEffort;
      return { systemPrefix: `Reasoning strength: ${strength}` };
    },
  },
  {
    id: "generic/openai-chat-text",
    manufacturer: "Generic",
    modelName: "OpenAI-compatible Chat Text",
    label: "Generic / OpenAI Chat Text",
    aliases: [],
    endpoint: "chat-completions",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: CHAT_TRANSPORT,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "openai" },
    modalityOrder: "preserve",
    reasoning: {
      control: "none",
      allowedEfforts: [],
      defaultHistory: "discard",
    },
    sampling: {},
    compaction: {
      reasoningEffort: "none",
      maxOutputTokens: 6_000,
      inputBudgetRatio: 0.8,
    },
    resolveEffort() {
      return { enabled: false };
    },
    resolveHistory(requested) {
      return resolveHistoryWithDefault(requested, "discard");
    },
    buildDirectives() {
      return {};
    },
  },
  {
    id: "generic/openai-responses-text",
    manufacturer: "Generic",
    modelName: "OpenAI-compatible Responses Text",
    label: "Generic / OpenAI Responses Text",
    aliases: [],
    endpoint: "responses",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: RESPONSES_TRANSPORT,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "openai" },
    modalityOrder: "preserve",
    reasoning: {
      control: "none",
      allowedEfforts: [],
      defaultHistory: "discard",
    },
    sampling: {},
    compaction: {
      reasoningEffort: "none",
      maxOutputTokens: 6_000,
      inputBudgetRatio: 0.8,
    },
    resolveEffort() {
      return { enabled: false };
    },
    resolveHistory(requested) {
      return resolveHistoryWithDefault(requested, "discard");
    },
    buildDirectives() {
      return {};
    },
  },
  {
    id: "generic/openai-chat-json-text",
    manufacturer: "Generic",
    modelName: "OpenAI-compatible Chat JSON Text",
    label: "Generic / OpenAI Chat JSON Text",
    aliases: [],
    endpoint: "chat-completions",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: CHAT_JSON_TRANSPORT,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "openai" },
    modalityOrder: "preserve",
    reasoning: { control: "none", allowedEfforts: [], defaultHistory: "discard" },
    sampling: {},
    compaction: { reasoningEffort: "none", maxOutputTokens: 6_000, inputBudgetRatio: 0.8 },
    resolveEffort() { return { enabled: false }; },
    resolveHistory(requested) { return resolveHistoryWithDefault(requested, "discard"); },
    buildDirectives() { return {}; },
  },
  {
    id: "generic/openai-responses-json-text",
    manufacturer: "Generic",
    modelName: "OpenAI-compatible Responses JSON Text",
    label: "Generic / OpenAI Responses JSON Text",
    aliases: [],
    endpoint: "responses",
    endpointCapabilities: STANDARD_SAMPLING_CAPABILITIES,
    transport: RESPONSES_JSON_TRANSPORT,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tools: { mode: "native", protocol: "openai" },
    modalityOrder: "preserve",
    reasoning: { control: "none", allowedEfforts: [], defaultHistory: "discard" },
    sampling: {},
    compaction: { reasoningEffort: "none", maxOutputTokens: 6_000, inputBudgetRatio: 0.8 },
    resolveEffort() { return { enabled: false }; },
    resolveHistory(requested) { return resolveHistoryWithDefault(requested, "discard"); },
    buildDirectives() { return {}; },
  },
] as const;

function cloneProfileSummary(profile: ModelProfile): ModelProfileSummary {
  return {
    id: profile.id,
    manufacturer: profile.manufacturer,
    modelName: profile.modelName,
    label: profile.label,
    sourceUrl: profile.sourceUrl,
    endpoint: profile.endpoint,
    inputModalities: [...profile.inputModalities],
    outputModalities: [...profile.outputModalities],
    tools: { ...profile.tools },
    reasoning: {
      ...profile.reasoning,
      allowedEfforts: [...profile.reasoning.allowedEfforts],
    },
    sampling: structuredClone(profile.sampling),
    compaction: structuredClone(profile.compaction),
  };
}

export function listModelProfiles(): ModelProfileSummary[] {
  return profiles.map(cloneProfileSummary);
}

export function getModelProfile(profileId: string | undefined): ModelProfile | undefined {
  return profileId ? profiles.find((profile) => profile.id === profileId) : undefined;
}

export function suggestModelProfile(modelId: string): string | undefined {
  const normalized = modelId.trim().toLowerCase();
  return profiles.find((profile) => profile.aliases.includes(normalized))?.id;
}

export function buildProfiledCapabilities(
  profile: ModelProfile,
  runtime: RuntimeModelCapabilities,
): { capabilities: ModelCapabilities; issues: ModelCompatibilityIssue[] } {
  const unavailableVisualModalities = runtime.visualInputSupported === false
    ? profile.inputModalities.filter((modality) => modality === "image" || modality === "video")
    : [];
  const inputModalities = profile.inputModalities.filter(
    (modality) => !unavailableVisualModalities.some((unavailable) => unavailable === modality),
  );
  const issues: ModelCompatibilityIssue[] = unavailableVisualModalities
    .map((modality): ModelCompatibilityIssue => ({
      code: "runtime_modality_unavailable",
      message: `${profile.label} supports ${modality}, but the provider reports it unavailable for this model artifact.`,
    }));
  if (profile.tools.mode === "native" && runtime.nativeToolsSupported === false) {
    issues.push({
      code: "runtime_tools_unavailable",
      message: `${profile.label} supports native tools, but the provider reports them unavailable for this model artifact.`,
    });
  }
  if (profile.reasoning.control !== "none" && runtime.reasoningSupported === false) {
    issues.push({
      code: "runtime_reasoning_unavailable",
      message: `${profile.label} supports reasoning, but the provider reports it unavailable for this model artifact.`,
    });
  }
  return {
    capabilities: {
      inputModalities,
      outputModalities: [...profile.outputModalities],
      tools: runtime.nativeToolsSupported === false ? { mode: "none" } : { ...profile.tools },
      reasoning: runtime.reasoningSupported === false
        ? { control: "none", allowedEfforts: [], defaultHistory: "discard" }
        : {
            ...profile.reasoning,
            allowedEfforts: [...profile.reasoning.allowedEfforts],
          },
      endpoint: profile.endpoint,
      endpointCapabilities: structuredClone(profile.endpointCapabilities),
      transport: structuredClone(profile.transport),
    },
    issues,
  };
}

export function getModelProfileSummary(profile: ModelProfile): ModelProfileSummary {
  return cloneProfileSummary(profile);
}
