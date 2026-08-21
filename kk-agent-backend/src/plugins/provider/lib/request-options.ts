import type { ModelInfo, ModelSettings } from "../types.js";
import type { UnifiedRequest } from "./types.js";
import { mergeLlmRequestConfigs } from "kk-agent-contract";
import { compileModelRequest } from "./model-profiles/compiler.js";
import { getModelProfile } from "./model-profiles/registry.js";

export function normalizeRequestOptions(
  model: ModelInfo,
  settings: ModelSettings,
  request: UnifiedRequest,
): Pick<
  UnifiedRequest,
  | "endpoint"
  | "transportProfile"
  | "resolvedLlmRequestConfig"
  | "providerRequestBody"
  | "instructions"
  | "messages"
  | "tools"
  | "modelContentByMessageId"
> {
  const profile = getModelProfile(settings.profileId);
  if (!profile || model.profile?.id !== profile.id || !model.capabilities) {
    throw new Error(`Model "${model.id}" has no valid inference profile.`);
  }
  const mergedConfig = mergeLlmRequestConfigs(settings.llmRequestConfig, request.llmRequestConfig);
  const compiled = compileModelRequest({
    profile,
    config: mergedConfig,
    instructions: request.instructions,
    messages: request.messages,
    modelContentByMessageId: request.modelContentByMessageId,
    temperatureRange: model.capabilities.endpointCapabilities.temperatureSupported
      ? model.capabilities.endpointCapabilities.temperatureRange
      : undefined,
  });
  const maxOutputTokens = typeof request.maxOutputTokens === "number" && Number.isFinite(request.maxOutputTokens)
    ? Math.max(1, Math.floor(request.maxOutputTokens))
    : undefined;
  const providerRequestBody = {
    ...compiled.body,
    ...(maxOutputTokens
      ? { [profile.endpoint === "responses" ? "max_output_tokens" : "max_tokens"]: maxOutputTokens }
      : {}),
  };

  return {
    endpoint: profile.endpoint,
    transportProfile: profile.transport,
    resolvedLlmRequestConfig: compiled.resolved,
    providerRequestBody,
    instructions: compiled.instructions,
    messages: compiled.messages,
    tools: model.capabilities.tools.mode === "native" ? request.tools : undefined,
    modelContentByMessageId: compiled.modelContentByMessageId,
  };
}
