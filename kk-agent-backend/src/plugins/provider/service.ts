import { randomUUID } from "node:crypto";
import type { UnifiedRequest, UnifiedResponse, OnChunkFn, ProviderNotice } from "./lib/types.js";
import type {
  CreateProviderBody,
  EndpointType,
  ModelCapabilities,
  ModelInfo,
  ModelSettings,
  ObservationSupportState,
  ProviderConfig,
  ProvidersState,
  UpdateProviderBody,
} from "./types.js";
import type { ProviderAdapter } from "./lib/adapter.js";
import { createLocalProviderAdapter } from "./lib/adapters/local.js";
import { createLogger } from "../../lib/logger.js";
import { NotFoundError } from "../../lib/errors.js";

const logger = createLogger("provider");
import { loadState, saveState } from "../lib/state.js";
import { getMessageReasoning } from "../lib/transcript.js";
import { getModelSettingsKey, normalizeStoredModelSettings } from "./lib/model-settings.js";
import { normalizeRequestOptions } from "./lib/request-options.js";
import {
  applyEndpointSupport,
  applyReasoningSupport,
  applyResponsesStatefulness,
  applyVisionSupport,
  hasObservationUpdate,
  mergeObservation,
  normalizeObservation,
  setObservedEndpointSupport,
  setObservedReasoningSupport,
  setObservedResponsesStatefulness,
  setObservedVisionSupport,
  type ObservationUpdate,
} from "./lib/observations.js";

const STATE_FILE = "providers.json";
const MODEL_REF_SEPARATOR = "::";
const DEFAULT_STATE: ProvidersState = {
  providers: [],
  modelSettings: {},
  observedCapabilities: {},
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
    if (!provider) throw new NotFoundError("Provider", providerId);
    return provider;
  }

  if (state.providers.length === 0) {
    throw new NotFoundError("Provider");
  }

  if (state.providers.length === 1) {
    return state.providers[0]!;
  }

  throw new NotFoundError("Provider");
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
  if (!provider) throw new NotFoundError("Provider", providerId);

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

async function persist(): Promise<void> {
  if (persistOverride) {
    await persistOverride();
    return;
  }
  await saveState(STATE_FILE, state);
}

function getObservationKey(providerId: string, modelId: string): string {
  return getModelRef(providerId, modelId);
}

function getModelRef(providerId: string, modelId: string): string {
  return `${providerId}${MODEL_REF_SEPARATOR}${modelId}`;
}

function parseModelRef(value: string): { providerId: string; modelId: string } | undefined {
  const separatorIndex = value.indexOf(MODEL_REF_SEPARATOR);
  if (separatorIndex <= 0) return undefined;
  const providerId = value.slice(0, separatorIndex);
  const modelId = value.slice(separatorIndex + MODEL_REF_SEPARATOR.length);
  return providerId && modelId ? { providerId, modelId } : undefined;
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
    logger.info(`Loaded ${state.providers.length} provider(s).`);
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
  if (index === -1) throw new NotFoundError("Provider", id);

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

async function getProviderModels(provider: ProviderConfig): Promise<ModelInfo[]> {
  const models = (await getAdapter(provider.id).listModels()).map((model) => mergeObservedCapabilities(provider, model));
  modelsCache.set(provider.id, models);
  return models;
}

export async function getModels(providerId?: string): Promise<ModelInfo[]> {
  if (!providerId) {
    if (state.providers.length === 0) throw new NotFoundError("Provider");

    const settled = await Promise.allSettled(state.providers.map((provider) => getProviderModels(provider)));
    const models = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (models.length > 0) return models;

    const firstRejection = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (firstRejection) throw firstRejection.reason;
    return [];
  }

  const provider = resolveProviderForModels(providerId);
  return getProviderModels(provider);
}

export async function resolveProviderModel(
  providerId?: string,
  preferredModel?: string,
): Promise<{ providerId: string; model: string }> {
  if (!providerId) {
    if (preferredModel) {
      const modelRef = parseModelRef(preferredModel);
      if (modelRef) {
        const models = await getModels(modelRef.providerId);
        if (models.some((model) => model.id === modelRef.modelId)) {
          return { providerId: modelRef.providerId, model: modelRef.modelId };
        }
      }
    }

    const models = await getModels();
    if (models.length === 0) throw new Error("No models available from configured providers");
    const resolvedModel = preferredModel
      ? models.find((model) => model.id === preferredModel) ?? models[0]!
      : models[0]!;
    return { providerId: resolvedModel.providerId, model: resolvedModel.id };
  }

  const provider = resolveRequestProvider(providerId);
  const models = await getModels(provider.id);
  if (models.length === 0) throw new Error("No models available for the provider");

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

export function getModelCapabilities(providerId: string, modelId: string): ModelCapabilities | undefined {
  const models = modelsCache.get(providerId);
  return models?.find((m) => m.id === modelId)?.capabilities;
}

export function getModelSettings(providerId: string, modelId: string): ModelSettings {
  return normalizeStoredModelSettings(state.modelSettings[getModelSettingsKey(providerId, modelId)]);
}

export function getAllModelSettings(providerId?: string): Record<string, ModelSettings> {
  return Object.fromEntries(
    Object.entries(state.modelSettings)
      .filter(([key]) => !providerId || key.startsWith(`${providerId}${MODEL_REF_SEPARATOR}`))
      .map(([key, value]) => [
        key,
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

export function __getProviderStateForTests(): ProvidersState {
  return structuredClone(state);
}
