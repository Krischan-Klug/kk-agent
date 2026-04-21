import type {
  EndpointType,
  LlmRequestConfig,
  ModelSettings,
  ResolvedLlmRequestConfig,
} from "./provider.js";
import { normalizeCanonicalReasoningLevel } from "./capabilities.js";

const RESERVED_EXTRA_BODY_KEYS: Record<EndpointType, Set<string>> = {
  "chat-completions": new Set([
    "model",
    "messages",
    "stream",
    "stream_options",
    "tools",
  ]),
  responses: new Set([
    "model",
    "input",
    "instructions",
    "stream",
    "tools",
    "previous_response_id",
    "conversation",
  ]),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMergeValue(target: unknown, source: unknown): unknown {
  if (source === undefined) return undefined;
  if (target === undefined) return source;

  if (Array.isArray(target) && Array.isArray(source)) {
    return [...source];
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const merged: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      merged[key] = deepMergeValue(merged[key], value);
    }
    return merged;
  }

  return source;
}

function deepMergeRecord(
  target: Record<string, unknown> | undefined,
  source: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!target && !source) return undefined;
  if (!target) return structuredClone(source);
  if (!source) return structuredClone(target);
  return deepMergeValue(target, source) as Record<string, unknown>;
}

function compactObject<T extends Record<string, unknown>>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (isPlainObject(entry)) {
      const nested = compactObject(entry);
      if (nested && Object.keys(nested).length > 0) next[key] = nested;
      continue;
    }
    next[key] = entry;
  }
  return Object.keys(next).length > 0 ? next as T : undefined;
}

export function mergeLlmRequestConfigs(...configs: Array<LlmRequestConfig | undefined>): LlmRequestConfig | undefined {
  let merged: LlmRequestConfig | undefined;

  for (const config of configs) {
    if (!config) continue;
    merged = {
      common: compactObject((deepMergeRecord(
        merged?.common ? { ...merged.common } : undefined,
        config.common ? { ...config.common } : undefined,
      ) ?? undefined) as Record<string, unknown>) as LlmRequestConfig["common"],
      extraBody: compactObject({
        "chat-completions": deepMergeRecord(
          merged?.extraBody?.["chat-completions"],
          config.extraBody?.["chat-completions"],
        ),
        responses: deepMergeRecord(
          merged?.extraBody?.responses,
          config.extraBody?.responses,
        ),
      }),
    };
  }

  return compactLlmRequestConfig(merged);
}

export function compactLlmRequestConfig(config?: LlmRequestConfig): LlmRequestConfig | undefined {
  if (!config) return undefined;
  const common = compactObject(config.common ? { ...config.common } : undefined) as LlmRequestConfig["common"];
  const extraBody = compactObject({
    "chat-completions": compactObject(config.extraBody?.["chat-completions"]),
    responses: compactObject(config.extraBody?.responses),
  });
  const next: LlmRequestConfig = {
    ...(common ? { common } : {}),
    ...(extraBody ? { extraBody } : {}),
  };

  return next.common || next.extraBody ? next : undefined;
}

export function compactModelSettings(settings: ModelSettings): ModelSettings {
  const llmRequestConfig = compactLlmRequestConfig(settings.llmRequestConfig);
  const next: ModelSettings = {
    llmRequestConfig: llmRequestConfig
      ? {
          ...llmRequestConfig,
          common: compactObject({
            ...llmRequestConfig.common,
            reasoningEffort: normalizeCanonicalReasoningLevel(
              llmRequestConfig.common?.reasoningEffort,
            ),
          }),
        }
      : undefined,
  };
  return next;
}

export function sanitizeEndpointExtraBody(
  endpoint: EndpointType,
  value?: Record<string, unknown>,
): { value?: Record<string, unknown>; omittedKeys: string[] } {
  if (!value) return { omittedKeys: [] };

  const reserved = RESERVED_EXTRA_BODY_KEYS[endpoint];
  const sanitized: Record<string, unknown> = {};
  const omittedKeys: string[] = [];

  for (const [key, entry] of Object.entries(value)) {
    if (reserved.has(key)) {
      omittedKeys.push(key);
      continue;
    }
    sanitized[key] = entry;
  }

  return {
    value: Object.keys(sanitized).length > 0 ? sanitized : undefined,
    omittedKeys,
  };
}

export function buildResolvedLlmRequestConfig(input: {
  endpoint: EndpointType;
  common?: LlmRequestConfig["common"];
  extraBody?: Record<string, unknown>;
  omittedUnsupportedKeys?: string[];
}): ResolvedLlmRequestConfig {
  return {
    common: {
      endpoint: input.endpoint,
      ...(input.common ?? {}),
    },
    extraBody: input.extraBody,
    omittedUnsupportedKeys: [...new Set(input.omittedUnsupportedKeys ?? [])],
  };
}

export function stringifyJsonValue(value: unknown): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

export function tryParseJsonObject(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("JSON must be an object");
  }
  return parsed;
}
