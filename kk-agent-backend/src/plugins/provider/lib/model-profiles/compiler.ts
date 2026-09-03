import {
  clampNumber,
  getToolUses,
  type LlmRequestConfig,
  type ResolvedLlmRequestConfig,
  type ResolvedReasoningHistory,
  type TranscriptMessage,
} from "kk-agent-contract";
import type { ModelProfile } from "./types.js";
import type { ModelContentPart } from "../types.js";

export interface CompiledModelRequest {
  instructions: string;
  messages: TranscriptMessage[];
  body: Record<string, unknown>;
  resolved: ResolvedLlmRequestConfig;
  modelContentByMessageId?: Record<string, ModelContentPart[]>;
}

function projectReasoningHistory(
  messages: TranscriptMessage[],
  history: ResolvedReasoningHistory,
): TranscriptMessage[] {
  if (history === "all") return structuredClone(messages);
  let latestAssistantIndex = -1;
  messages.forEach((message, index) => {
    if (message.role === "assistant") latestAssistantIndex = index;
  });
  return messages.map((message, index) => {
    if (message.role !== "assistant") return structuredClone(message);
    const cloned = structuredClone(message);
    const keepReasoning = history === "latest"
      ? index === latestAssistantIndex
      : history === "tool-turns" && getToolUses(message).length > 0;
    return {
      ...cloned,
      content: cloned.content.filter((block) => block.type !== "reasoning" || keepReasoning),
    };
  });
}

export function compileModelRequest(input: {
  profile: ModelProfile;
  config?: LlmRequestConfig;
  instructions: string;
  messages: TranscriptMessage[];
  modelContentByMessageId?: Record<string, ModelContentPart[]>;
  temperatureRange?: { min: number; max: number; step?: number };
  reasoningSupported?: boolean;
}): CompiledModelRequest {
  const requestedEffort = input.config?.reasoning?.effort;
  const requestedHistory = input.config?.reasoning?.history ?? "auto";
  const reasoningUnavailable = input.reasoningSupported === false
    && input.profile.reasoning.control !== "none";
  const history = reasoningUnavailable
    ? { effectiveHistory: "discard" as const }
    : input.profile.resolveHistory(requestedHistory);
  const effectiveHistory = history.effectiveHistory;
  const effort = reasoningUnavailable
    ? {
        effectiveEffort: undefined,
        enabled: false,
        warning: "The provider runtime reports reasoning unavailable; profile reasoning was disabled.",
      }
    : input.profile.resolveEffort(requestedEffort);
  const preset = effort.enabled
    ? input.profile.sampling.thinking
    : input.profile.sampling.direct;
  const sampling = {
    ...(preset ?? {}),
    ...(input.config?.sampling?.temperature !== undefined
      ? { temperature: clampNumber(input.config.sampling.temperature, input.temperatureRange) }
      : {}),
    ...(input.config?.sampling?.topP !== undefined
      ? { topP: clampNumber(input.config.sampling.topP, { min: 0, max: 1 }) }
      : {}),
  };
  const directives = reasoningUnavailable
    ? {}
    : input.profile.buildDirectives({
        effectiveEffort: effort.effectiveEffort,
        enabled: effort.enabled,
        history: effectiveHistory,
      });
  const instructions = directives.systemPrefix
    ? [directives.systemPrefix, input.instructions].filter(Boolean).join("\n")
    : input.instructions;
  const body: Record<string, unknown> = {};

  if (directives.transportReasoningEffort) {
    if (input.profile.endpoint === "responses") {
      body.reasoning = { effort: directives.transportReasoningEffort };
    } else {
      body.reasoning_effort = directives.transportReasoningEffort;
    }
  }
  if (directives.chatTemplateKwargs && Object.keys(directives.chatTemplateKwargs).length > 0) {
    body.chat_template_kwargs = directives.chatTemplateKwargs;
  }
  if (sampling.temperature !== undefined) body.temperature = sampling.temperature;
  if (sampling.topP !== undefined) body.top_p = sampling.topP;
  const samplingFields = input.profile.transport.samplingFields;
  if (sampling.topK !== undefined && samplingFields?.topK) body[samplingFields.topK] = sampling.topK;
  if (sampling.minP !== undefined && samplingFields?.minP) body[samplingFields.minP] = sampling.minP;
  if (sampling.presencePenalty !== undefined) body.presence_penalty = sampling.presencePenalty;
  if (sampling.repetitionPenalty !== undefined && samplingFields?.repetitionPenalty) {
    body[samplingFields.repetitionPenalty] = sampling.repetitionPenalty;
  }

  return {
    instructions,
    messages: projectReasoningHistory(input.messages, effectiveHistory),
    body,
    modelContentByMessageId: input.modelContentByMessageId
      ? Object.fromEntries(Object.entries(input.modelContentByMessageId).map(([messageId, parts]) => [
          messageId,
          input.profile.modalityOrder === "images-first"
            ? [...parts.filter((part) => part.type === "image"), ...parts.filter((part) => part.type !== "image")]
            : structuredClone(parts),
        ]))
      : undefined,
    resolved: {
      endpoint: input.profile.endpoint,
      profileId: input.profile.id,
      reasoning: {
        requestedEffort,
        effectiveEffort: effort.effectiveEffort,
        requestedHistory,
        effectiveHistory,
        enabled: effort.enabled,
      },
      sampling,
      warnings: [effort.warning, history.warning].filter(
        (warning): warning is string => Boolean(warning),
      ),
    },
  };
}
