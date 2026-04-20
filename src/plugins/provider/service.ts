import { randomUUID } from "node:crypto";
import type { UnifiedRequest, UnifiedResponse, OnChunkFn, ProviderNotice, TokenStats } from "./lib/types.js";
import type {
  ContinuationMode,
  CreateProviderBody,
  EndpointType,
  ModelCapabilities,
  ModelInfo,
  ModelObservation,
  ModelSettings,
  ObservationSupportState,
  ProviderConfig,
  ProvidersState,
  UpdateProviderBody,
} from "./types.js";
import type { ProviderAdapter } from "./lib/adapter.js";
import { createLocalProviderAdapter } from "./lib/adapters/local.js";
import {
  DEFAULT_REASONING_LEVELS,
  clampNumber,
  coerceReasoningSelection,
  getEndpointCapabilities,
  getEndpointTransportProfile,
  getPreferredEndpoint,
  normalizeCanonicalReasoningLevel,
  resolveMaxOutputRange,
} from "./lib/capabilities.js";
import {
  buildResolvedLlmRequestConfig,
  compactLlmRequestConfig,
  compactModelSettings,
  mergeLlmRequestConfigs,
  sanitizeEndpointExtraBody,
} from "./lib/request-config.js";
import { estimateRequestTokens } from "./lib/token-estimator.js";
import { loadState, saveState } from "../lib/state.js";
import { getMessageReasoning } from "../lib/transcript.js";

const STATE_FILE = "providers.json";
const DEFAULT_STATE: ProvidersState = {
  providers: [],
  modelSettings: {},
  observedCapabilities: {},
};

type ObservationUpdate = {
  endpointSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  reasoningSupport?: Partial<Record<EndpointType, ObservationSupportState>>;
  responsesStatefulness?: ObservationSupportState;
  visionSupport?: ObservationSupportState;
};

let state: ProvidersState = structuredClone(DEFAULT_STATE);

let adapterFactory: (config: ProviderConfig) => ProviderAdapter = createLocalProviderAdapter;
let persistOverride: (() => Promise<void>) | undefined;

const adapterCache = new Map<string, ProviderAdapter>();
const modelsCache = new Map<string, ModelInfo[]>();

function getProviderById(providerId: string): ProviderConfig | undefined {
  return state.providers.find((provider) => provider.id === providerId);
}

function resolveProvider(providerId?: string): ProviderConfig {
  if (providerId) {
    const provider = getProviderById(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider;
  }

  if (state.providers.length === 0) {
    throw new Error("No provider configured");
  }

  if (state.providers.length === 1) {
    return state.providers[0]!;
  }

  throw new Error("providerId is required when multiple providers are configured");
}

export function resolveProviderId(providerId?: string): string {
  return resolveProvider(providerId).id;
}

export function getDefaultProviderId(): string | undefined {
  return state.providers.length === 1 ? state.providers[0]?.id : undefined;
}

function normalizeStoredModelSettings(settings: ModelSettings | undefined): ModelSettings {
  const storedConfig = settings?.llmRequestConfig;
  const normalizedReasoningEffort = normalizeCanonicalReasoningLevel(storedConfig?.common?.reasoningEffort);

  return compactModelSettings({
    llmRequestConfig: compactLlmRequestConfig({
      common: {
        endpoint: storedConfig?.common?.endpoint,
        reasoningEffort: normalizedReasoningEffort,
        temperature: storedConfig?.common?.temperature,
        maxOutputTokens: storedConfig?.common?.maxOutputTokens,
      },
      extraBody: storedConfig?.extraBody,
    }),
  });
}

function normalizeObservationSupportRecord(
  value?: Partial<Record<EndpointType, ObservationSupportState>>,
): Partial<Record<EndpointType, ObservationSupportState>> | undefined {
  if (!value) return undefined;
  const next = Object.fromEntries(
    Object.entries(value).filter(([, support]) => support === "supported" || support === "unsupported"),
  ) as Partial<Record<EndpointType, ObservationSupportState>>;
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeObservation(record: ModelObservation): ModelObservation {
  return {
    endpointSupport: normalizeObservationSupportRecord(record.endpointSupport),
    reasoningSupport: normalizeObservationSupportRecord(record.reasoningSupport),
    responsesStatefulness: record.responsesStatefulness === "supported" || record.responsesStatefulness === "unsupported"
      ? record.responsesStatefulness
      : undefined,
    visionSupport: record.visionSupport === "supported" || record.visionSupport === "unsupported"
      ? record.visionSupport
      : undefined,
    lastObservedAt: record.lastObservedAt,
  };
}

function normalizeStoredProvidersState(nextState: ProvidersState): ProvidersState {
  return {
    providers: nextState.providers ?? [],
    modelSettings: Object.fromEntries(
      Object.entries(nextState.modelSettings ?? {}).map(([key, value]) => [key, normalizeStoredModelSettings(value)]),
    ),
    observedCapabilities: Object.fromEntries(
      Object.entries(nextState.observedCapabilities ?? {}).map(([key, value]) => [key, normalizeObservation(value)]),
    ),
  };
}

function getSingleProviderId(): string | undefined {
  return state.providers.length === 1 ? state.providers[0]?.id : undefined;
}

function getProviderForModelSettings(providerId?: string): ProviderConfig {
  return resolveProvider(providerId ?? getSingleProviderId());
}

function resolveProviderForModels(providerId?: string): ProviderConfig {
  return resolveProvider(providerId ?? getSingleProviderId());
}

function resolveRequestProvider(providerId?: string): ProviderConfig {
  return resolveProvider(providerId ?? getSingleProviderId());
}

function normalizeProviderStateForTests(overrides: Partial<ProvidersState>): ProvidersState {
  return normalizeStoredProvidersState({
    providers: structuredClone(overrides.providers ?? []),
    modelSettings: structuredClone(overrides.modelSettings ?? {}),
    observedCapabilities: structuredClone(overrides.observedCapabilities ?? {}),
  });
}

function getAdapter(providerId: string): ProviderAdapter {
  const cached = adapterCache.get(providerId);
  if (cached) return cached;

  const provider = getProviderById(providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const adapter = adapterFactory(provider);
  adapterCache.set(providerId, adapter);
  return adapter;
}

function invalidateProvider(providerId: string): void {
  adapterCache.delete(providerId);
  modelsCache.delete(providerId);
}

function clearObservedCapabilities(providerId: string): void {
  state.observedCapabilities = Object.fromEntries(
    Object.entries(state.observedCapabilities).filter(([key]) => !key.startsWith(`${providerId}::`)),
  );
  modelsCache.delete(providerId);
}

function getModelSettingsKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

async function persist(): Promise<void> {
  if (persistOverride) {
    await persistOverride();
    return;
  }
  await saveState(STATE_FILE, state);
}

function getObservationKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function setObservedEndpointSupport(
  update: ObservationUpdate,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    endpointSupport: {
      ...(update.endpointSupport ?? {}),
      [endpoint]: support,
    },
  };
}

function setObservedReasoningSupport(
  update: ObservationUpdate,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    reasoningSupport: {
      ...(update.reasoningSupport ?? {}),
      [endpoint]: support,
    },
  };
}

function setObservedResponsesStatefulness(
  update: ObservationUpdate,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    responsesStatefulness: support,
  };
}

function setObservedVisionSupport(
  update: ObservationUpdate,
  support: ObservationSupportState,
): ObservationUpdate {
  return {
    ...update,
    visionSupport: support,
  };
}

function mergeObservation(existing: ModelObservation | undefined, update: ObservationUpdate): ModelObservation {
  return normalizeObservation({
    endpointSupport: {
      ...(existing?.endpointSupport ?? {}),
      ...(update.endpointSupport ?? {}),
    },
    reasoningSupport: {
      ...(existing?.reasoningSupport ?? {}),
      ...(update.reasoningSupport ?? {}),
    },
    responsesStatefulness: update.responsesStatefulness ?? existing?.responsesStatefulness,
    visionSupport: update.visionSupport ?? existing?.visionSupport,
    lastObservedAt: new Date().toISOString(),
  });
}

function hasObservationUpdate(update: ObservationUpdate): boolean {
  return Object.keys(update.endpointSupport ?? {}).length > 0
    || Object.keys(update.reasoningSupport ?? {}).length > 0
    || update.responsesStatefulness !== undefined
    || update.visionSupport !== undefined;
}

function applyEndpointSupport(
  capabilities: ModelCapabilities,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    supportedEndpoints: capabilities.supportedEndpoints.includes(endpoint)
      ? capabilities.supportedEndpoints
      : [...capabilities.supportedEndpoints, endpoint],
    endpointCapabilities: {
      ...capabilities.endpointCapabilities,
      [endpoint]: capabilities.endpointCapabilities[endpoint] ?? getEndpointCapabilities(capabilities, endpoint),
    },
    transportProfiles: {
      ...capabilities.transportProfiles,
      [endpoint]: {
        ...getEndpointTransportProfile(capabilities, endpoint),
        supported: support !== "unsupported",
      },
    },
  };
}

function applyReasoningSupport(
  capabilities: ModelCapabilities,
  endpoint: EndpointType,
  support: ObservationSupportState,
): ModelCapabilities {
  if (support !== "supported") return capabilities;

  const allowedEfforts = (capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels).length > 0
    ? (capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels)
    : [...DEFAULT_REASONING_LEVELS];

  const nextCapabilities: ModelCapabilities = {
    ...capabilities,
    supportsReasoning: true,
    reasoningSource: "observed",
    reasoningControl: capabilities.reasoningControl === "none" ? "effort" : capabilities.reasoningControl,
    reasoningLevels: allowedEfforts,
    reasoning: {
      ...capabilities.reasoning,
      allowedEfforts,
    },
  };

  return {
    ...nextCapabilities,
    transportProfiles: {
      ...nextCapabilities.transportProfiles,
      "chat-completions": {
        ...getEndpointTransportProfile(nextCapabilities, "chat-completions"),
        reasoningTransport: nextCapabilities.reasoningControl === "on-off"
          ? "chat-completions-on-off"
          : "chat-completions-effort",
      },
      responses: {
        ...getEndpointTransportProfile(nextCapabilities, "responses"),
        reasoningTransport: "responses-effort",
      },
      [endpoint]: {
        ...getEndpointTransportProfile(nextCapabilities, endpoint),
        reasoningTransport: endpoint === "responses"
          ? "responses-effort"
          : nextCapabilities.reasoningControl === "on-off"
            ? "chat-completions-on-off"
            : "chat-completions-effort",
      },
    },
  };
}

function applyResponsesStatefulness(
  capabilities: ModelCapabilities,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    transportProfiles: {
      ...capabilities.transportProfiles,
      responses: {
        ...getEndpointTransportProfile(capabilities, "responses"),
        continuationMode: support === "supported" ? "previous-response-id" : "raw-output-replay",
      },
    },
  };
}

function applyVisionSupport(
  capabilities: ModelCapabilities,
  support: ObservationSupportState,
): ModelCapabilities {
  return {
    ...capabilities,
    visionSupport: support === "supported" ? "supported" : "unsupported",
  };
}

function mergeObservedCapabilities(provider: ProviderConfig, model: ModelInfo): ModelInfo {
  const observation = state.observedCapabilities[getObservationKey(provider.id, model.id)];
  let capabilities = model.capabilities;

  if (observation) {
    for (const [endpoint, support] of Object.entries(observation.endpointSupport ?? {}) as Array<
      [EndpointType, ObservationSupportState]
    >) {
      capabilities = applyEndpointSupport(capabilities, endpoint, support);
    }

    for (const [endpoint, support] of Object.entries(observation.reasoningSupport ?? {}) as Array<
      [EndpointType, ObservationSupportState]
    >) {
      capabilities = applyReasoningSupport(capabilities, endpoint, support);
    }

    if (observation.responsesStatefulness) {
      capabilities = applyResponsesStatefulness(capabilities, observation.responsesStatefulness);
    }

    if (observation.visionSupport) {
      capabilities = applyVisionSupport(capabilities, observation.visionSupport);
    }
  }

  const nextCapabilities: ModelCapabilities = {
    ...capabilities,
    reasoning: {
      allowedEfforts: capabilities.reasoning?.allowedEfforts ?? capabilities.reasoningLevels,
    },
  };

  return {
    ...model,
    capabilities: nextCapabilities,
  };
}

async function markObservedCapabilities(
  providerId: string,
  modelId: string,
  update: ObservationUpdate,
): Promise<void> {
  if (!hasObservationUpdate(update)) return;

  const key = getObservationKey(providerId, modelId);
  const existing = state.observedCapabilities[key];
  const merged = mergeObservation(existing, update);
  const before = JSON.stringify(normalizeObservation(existing ?? { lastObservedAt: "" }));
  const after = JSON.stringify(normalizeObservation(merged));
  if (before === after) return;

  state.observedCapabilities[key] = merged;
  modelsCache.delete(providerId);
  await persist();
}

function hasObservedReasoning(response: UnifiedResponse): boolean {
  return getMessageReasoning(response.message).trim().length > 0 || (response.stats?.reasoningTokens ?? 0) > 0;
}

function requestContainsImageInputs(request: UnifiedRequest): boolean {
  return request.messages.some((message) =>
    message.content.some((block) => block.type === "attachment_ref" && block.category === "image"));
}

function isUnsupportedVisionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (message.includes("image") || message.includes("vision") || message.includes("multimodal"))
    && (message.includes("unsupported") || message.includes("not support") || message.includes("invalid"));
}

function mergeModelAndRequestConfig(settings: ModelSettings, request: UnifiedRequest) {
  return mergeLlmRequestConfigs(
    settings.llmRequestConfig,
    request.llmRequestConfig,
  );
}

function normalizeRequestOptions(
  model: ModelInfo | undefined,
  settings: ModelSettings,
  request: UnifiedRequest,
  forcedEndpoint?: EndpointType,
): Pick<
  UnifiedRequest,
  "endpoint" | "transportProfile" | "resolvedLlmRequestConfig"
> & { explicitEndpointSelection: boolean } {
  const mergedConfig = mergeModelAndRequestConfig(settings, request);
  const explicitEndpointSelection = mergedConfig?.common?.endpoint !== undefined;
  const endpoint = forcedEndpoint ?? getPreferredEndpoint(model?.capabilities, mergedConfig?.common?.endpoint);
  const endpointCapabilities = getEndpointCapabilities(model?.capabilities, endpoint);
  const continuationMode: ContinuationMode = endpoint === "responses"
    ? getEndpointTransportProfile(model?.capabilities, endpoint).continuationMode
    : "none";
  const transportProfile = endpoint === "responses"
    ? {
        ...getEndpointTransportProfile(model?.capabilities, endpoint),
        continuationMode,
      }
    : getEndpointTransportProfile(model?.capabilities, endpoint);
  const maxOutputRange = resolveMaxOutputRange(model, endpoint);
  const omittedUnsupportedKeys: string[] = [];
  const rawReasoningSelection = mergedConfig?.common?.reasoningEffort;
  const reasoningEffort = coerceReasoningSelection(model?.capabilities, endpoint, rawReasoningSelection);
  const temperature = endpointCapabilities.temperatureSupported
    ? clampNumber(mergedConfig?.common?.temperature, endpointCapabilities.temperatureRange)
    : undefined;
  const maxOutputTokens = endpointCapabilities.maxOutputTokensSupported
    ? clampNumber(mergedConfig?.common?.maxOutputTokens, maxOutputRange)
    : undefined;

  const sanitizedExtraBody = sanitizeEndpointExtraBody(endpoint, mergedConfig?.extraBody?.[endpoint]);
  omittedUnsupportedKeys.push(...sanitizedExtraBody.omittedKeys.map((key) => `extraBody.${endpoint}.${key}`));
  const resolvedLlmRequestConfig = buildResolvedLlmRequestConfig({
    endpoint,
    common: {
      endpoint,
      reasoningEffort,
      temperature,
      maxOutputTokens,
    },
    extraBody: sanitizedExtraBody.value,
    omittedUnsupportedKeys,
  });

  return {
    endpoint,
    transportProfile,
    resolvedLlmRequestConfig,
    explicitEndpointSelection,
  };
}

export function configure(settings: { baseUrl?: string }): void {
  if (state.providers.length > 0 || !settings.baseUrl) return;

  const provider: ProviderConfig = {
    id: randomUUID(),
    name: "Local LLM",
    baseUrl: settings.baseUrl,
  };

  state.providers.push(provider);
}

export async function initState(): Promise<void> {
  const loaded = await loadState<ProvidersState>(STATE_FILE, DEFAULT_STATE);
  state = normalizeStoredProvidersState(loaded);

  if (state.providers.length > 0) {
    console.log(`[provider] Loaded ${state.providers.length} provider(s).`);
  }
}

export function listProviders(): ProviderConfig[] {
  return state.providers;
}

export async function addProvider(config: CreateProviderBody): Promise<ProviderConfig> {
  const provider: ProviderConfig = { ...config, id: randomUUID() };
  state.providers.push(provider);
  await persist();
  return provider;
}

function credentialsChanged(
  current: ProviderConfig,
  updates: UpdateProviderBody,
): boolean {
  return (updates.baseUrl !== undefined && updates.baseUrl !== current.baseUrl)
    || (updates.apiKey !== undefined && updates.apiKey !== current.apiKey);
}

export async function updateProvider(id: string, updates: UpdateProviderBody): Promise<ProviderConfig> {
  const index = state.providers.findIndex((provider) => provider.id === id);
  if (index === -1) throw new Error(`Provider not found: ${id}`);

  const current = state.providers[index];
  state.providers[index] = { ...current, ...updates };
  invalidateProvider(id);
  if (credentialsChanged(current, updates)) {
    clearObservedCapabilities(id);
  }
  await persist();
  return state.providers[index];
}

export async function removeProvider(id: string): Promise<void> {
  state.providers = state.providers.filter((provider) => provider.id !== id);
  invalidateProvider(id);
  clearObservedCapabilities(id);
  await persist();
}

export async function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  return getAdapter(id).testConnection();
}

export async function getModels(providerId?: string): Promise<ModelInfo[]> {
  const provider = resolveProviderForModels(providerId);
  const models = (await getAdapter(provider.id).listModels()).map((model) => mergeObservedCapabilities(provider, model));
  modelsCache.set(provider.id, models);
  return models;
}

export async function resolveProviderModel(
  providerId?: string,
  preferredModel?: string,
): Promise<{ providerId: string; model: string }> {
  const provider = resolveRequestProvider(providerId);
  const models = await getModels(provider.id);
  if (models.length === 0) throw new Error("No models available for the selected provider");

  const resolvedModel = preferredModel && models.some((model) => model.id === preferredModel)
    ? preferredModel
    : models[0].id;

  return { providerId: provider.id, model: resolvedModel };
}

async function prepareRequest(request: UnifiedRequest, forcedEndpoint?: EndpointType) {
  const provider = resolveRequestProvider(request.providerId);
  const models = await getModels(provider.id);
  const model = models.find((entry) => entry.id === request.model);
  const settings = getModelSettings(provider.id, request.model);
  const normalized = normalizeRequestOptions(model, settings, request, forcedEndpoint);
  const prepared = { ...request, providerId: provider.id, ...normalized };
  return { provider, model, prepared, explicitEndpointSelection: normalized.explicitEndpointSelection };
}

function collectObservedCapabilities(
  prepared: UnifiedRequest,
  response: UnifiedResponse,
): ObservationUpdate {
  const endpoint = response.debug?.endpoint ?? prepared.endpoint ?? "chat-completions";
  let update = setObservedEndpointSupport({}, endpoint, "supported");

  if (hasObservedReasoning(response)) {
    update = setObservedReasoningSupport(update, endpoint, "supported");
  }
  if (endpoint === "responses" && response.debug?.continuationMode === "previous-response-id") {
    update = setObservedResponsesStatefulness(update, "supported");
  }
  if (endpoint === "responses" && response.debug?.continuationFallback?.from === "previous-response-id") {
    update = setObservedResponsesStatefulness(update, "unsupported");
  }
  if (requestContainsImageInputs(prepared)) {
    update = setObservedVisionSupport(update, "supported");
  }

  return update;
}

async function trackObservedSuccess(
  providerId: string,
  modelId: string,
  prepared: UnifiedRequest,
  response: UnifiedResponse,
) {
  await markObservedCapabilities(providerId, modelId, collectObservedCapabilities(prepared, response));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getHttpStatusFromError(error: unknown): number | undefined {
  const match = getErrorMessage(error).match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function isUnsupportedEndpointError(error: unknown): boolean {
  const status = getHttpStatusFromError(error);
  if (status === 404 || status === 405 || status === 501) return true;

  const message = getErrorMessage(error).toLowerCase();
  return message.includes("unsupported endpoint")
    || message.includes("unknown endpoint")
    || message.includes("not implemented")
    || message.includes("no route")
    || message.includes("not found");
}

function buildFallbackReason(error: unknown, endpoint: EndpointType): string {
  const status = getHttpStatusFromError(error);
  const message = getErrorMessage(error);
  return status
    ? `${endpoint} failed with HTTP ${status}: ${message}`
    : `${endpoint} failed: ${message}`;
}

function attachProviderDebug(
  response: UnifiedResponse,
  prepared: UnifiedRequest,
  input: {
    attemptedEndpoints: EndpointType[];
    endpointSelection: "implicit" | "explicit";
    fallback?: {
      from: EndpointType;
      to: EndpointType;
      reason: string;
    };
  },
): void {
  response.debug = {
    ...(response.debug ?? { endpoint: prepared.endpoint ?? "chat-completions" }),
    resolvedRequestConfig: prepared.resolvedLlmRequestConfig,
    attemptedEndpoints: input.attemptedEndpoints,
    endpointSelection: input.endpointSelection,
    ...(input.fallback ? { fallback: input.fallback } : {}),
  };
}

async function executeWithEndpointFallback(
  request: UnifiedRequest,
  invoke: (prepared: UnifiedRequest, provider: ProviderConfig) => Promise<UnifiedResponse>,
): Promise<UnifiedResponse> {
  const primary = await prepareRequest(request);
  const attemptedEndpoints: EndpointType[] = [primary.prepared.endpoint ?? "chat-completions"];
  const endpointSelection = primary.explicitEndpointSelection ? "explicit" : "implicit";

  try {
    const response = await invoke(primary.prepared, primary.provider);
    attachProviderDebug(response, primary.prepared, { attemptedEndpoints, endpointSelection });
    await trackObservedSuccess(primary.provider.id, request.model, primary.prepared, response);
    return response;
  } catch (error) {
    const primaryEndpoint = primary.prepared.endpoint ?? "chat-completions";
    const unsupportedEndpoint = isUnsupportedEndpointError(error);
    const unsupportedVision = requestContainsImageInputs(primary.prepared) && isUnsupportedVisionError(error);

    if (unsupportedEndpoint) {
      await markObservedCapabilities(primary.provider.id, request.model, {
        endpointSupport: { [primaryEndpoint]: "unsupported" },
      });
    }
    if (unsupportedVision) {
      await markObservedCapabilities(primary.provider.id, request.model, {
        visionSupport: "unsupported",
      });
    }

    if (primary.explicitEndpointSelection || primaryEndpoint !== "responses" || !unsupportedEndpoint) {
      throw error;
    }

    const fallbackEndpoint: EndpointType = "chat-completions";
    const fallback = await prepareRequest(request, fallbackEndpoint);
    const fallbackReason = buildFallbackReason(error, primaryEndpoint);
    attemptedEndpoints.push(fallbackEndpoint);

    const response = await invoke(fallback.prepared, fallback.provider);
    const fallbackNotice: ProviderNotice = {
      level: "warning",
      code: "endpoint_fallback",
      message: `Provider rejected /v1/responses. Retried with /v1/chat/completions.`,
    };
    response.notices = [fallbackNotice, ...(response.notices ?? [])];
    attachProviderDebug(response, fallback.prepared, {
      attemptedEndpoints,
      endpointSelection: "implicit",
      fallback: {
        from: primaryEndpoint,
        to: fallbackEndpoint,
        reason: fallbackReason,
      },
    });
    await trackObservedSuccess(fallback.provider.id, request.model, fallback.prepared, response);
    return response;
  }
}

export async function callProvider(request: UnifiedRequest): Promise<UnifiedResponse> {
  return executeWithEndpointFallback(request, async (prepared, provider) => getAdapter(provider.id).chat(prepared));
}

export async function callProviderStream(request: UnifiedRequest, onChunk: OnChunkFn): Promise<UnifiedResponse> {
  return executeWithEndpointFallback(request, async (prepared, provider) => getAdapter(provider.id).chatStream(prepared, onChunk));
}

export async function estimateProviderTokens(request: UnifiedRequest): Promise<TokenStats> {
  const { provider, prepared } = await prepareRequest(request);
  return estimateRequestTokens(prepared, provider.baseUrl);
}

export function getModelCapabilities(providerId: string, modelId: string): ModelCapabilities | undefined {
  const models = modelsCache.get(providerId);
  return models?.find((m) => m.id === modelId)?.capabilities;
}

export function getModelSettings(providerId: string, modelId: string): ModelSettings {
  return normalizeStoredModelSettings(state.modelSettings[getModelSettingsKey(providerId, modelId)]);
}

export function getAllModelSettings(providerId?: string): Record<string, ModelSettings> {
  const provider = getProviderForModelSettings(providerId);
  return Object.fromEntries(
    Object.entries(state.modelSettings)
      .filter(([key]) => key.startsWith(`${provider.id}::`))
      .map(([key, value]) => [
        key.slice(provider.id.length + 2),
        normalizeStoredModelSettings(value),
      ]),
  );
}

export async function setModelSettings(providerId: string, modelId: string, settings: ModelSettings): Promise<void> {
  state.modelSettings[getModelSettingsKey(providerId, modelId)] = normalizeStoredModelSettings(settings);
  await persist();
}

export function __resetProviderServiceForTests(overrides: Partial<ProvidersState> = {}): void {
  state = normalizeProviderStateForTests(overrides);
  adapterFactory = createLocalProviderAdapter;
  persistOverride = async () => {};
  adapterCache.clear();
  modelsCache.clear();
}

export function __setProviderAdapterFactoryForTests(factory?: (config: ProviderConfig) => ProviderAdapter): void {
  adapterFactory = factory ?? createLocalProviderAdapter;
  adapterCache.clear();
  modelsCache.clear();
}

export function __setProviderPersistOverrideForTests(override?: () => Promise<void>): void {
  persistOverride = override;
}

export function __getProviderStateForTests(): ProvidersState {
  return structuredClone(state);
}
