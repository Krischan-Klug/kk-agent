import { randomUUID } from "node:crypto";
import type { UnifiedRequest, UnifiedResponse, OnChunkFn, TokenStats } from "./lib/types.js";
import type {
  EndpointType,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  ProvidersState,
} from "./types.js";
import type { ProviderAdapter } from "./lib/adapter.js";
import { createAdapter } from "./lib/adapters/index.js";
import {
  clampNumber,
  coerceReasoningSelection,
  getEndpointCapabilities,
  getPreferredEndpoint,
  resolveMaxOutputRange,
} from "./lib/capabilities.js";
import { estimateRequestTokens } from "./lib/token-estimator.js";
import { loadState, saveState } from "../lib/state.js";

const STATE_FILE = "providers.json";

let state: ProvidersState = {
  providers: [],
  activeProviderId: "",
  modelSettings: {},
  observedReasoning: {},
};

const adapterCache = new Map<string, ProviderAdapter>();
const modelsCache = new Map<string, ModelInfo[]>();

function getProviderById(providerId: string): ProviderConfig | undefined {
  return state.providers.find((provider) => provider.id === providerId);
}

function resolveProvider(providerId?: string): ProviderConfig {
  const resolvedId = providerId ?? state.activeProviderId;
  const provider = resolvedId ? getProviderById(resolvedId) : undefined;
  if (!provider) throw new Error("No provider configured");
  return provider;
}

function getAdapter(providerId: string): ProviderAdapter {
  const cached = adapterCache.get(providerId);
  if (cached) return cached;

  const provider = getProviderById(providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const adapter = createAdapter(provider);
  adapterCache.set(providerId, adapter);
  return adapter;
}

function invalidateProvider(providerId: string): void {
  adapterCache.delete(providerId);
  modelsCache.delete(providerId);
}

function getModelSettingsKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

async function persist(): Promise<void> {
  await saveState(STATE_FILE, state);
}

function getObservedReasoningKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function mergeObservedReasoning(providerId: string, model: ModelInfo): ModelInfo {
  const observation = state.observedReasoning[getObservedReasoningKey(providerId, model.id)];
  if (!observation?.observed || model.capabilities.supportsReasoning) return model;

  return {
    ...model,
    capabilities: {
      ...model.capabilities,
      supportsReasoning: true,
      reasoningSource: "observed",
      reasoningControl: "effort",
      reasoningLevels: model.capabilities.reasoningLevels.length > 0
        ? model.capabilities.reasoningLevels
        : ["none", "minimal", "low", "medium", "high", "xhigh"],
    },
  };
}

async function markObservedReasoning(providerId: string, modelId: string): Promise<void> {
  const key = getObservedReasoningKey(providerId, modelId);
  if (state.observedReasoning[key]?.observed) return;

  state.observedReasoning[key] = {
    observed: true,
    lastObservedAt: new Date().toISOString(),
  };
  modelsCache.delete(providerId);
  await persist();
}

function hasObservedReasoning(response: UnifiedResponse): boolean {
  return Boolean(response.reasoning?.trim()) || (response.stats?.reasoningTokens ?? 0) > 0;
}

function normalizeRequestOptions(
  model: ModelInfo | undefined,
  settings: ModelSettings,
  request: UnifiedRequest,
): Pick<UnifiedRequest, "endpoint" | "reasoningEffort" | "temperature" | "maxOutputTokens"> {
  const endpoint = getPreferredEndpoint(model?.capabilities, settings.endpoint as EndpointType | undefined);
  const endpointCapabilities = getEndpointCapabilities(model?.capabilities, endpoint);
  const maxOutputRange = resolveMaxOutputRange(model, endpoint);

  return {
    endpoint,
    reasoningEffort: coerceReasoningSelection(model?.capabilities, request.reasoningEffort),
    temperature: endpointCapabilities.temperatureSupported
      ? clampNumber(request.temperature, endpointCapabilities.temperatureRange)
      : undefined,
    maxOutputTokens: endpointCapabilities.maxOutputTokensSupported
      ? clampNumber(request.maxOutputTokens, maxOutputRange)
      : undefined,
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
  state.activeProviderId = provider.id;
}

export async function initState(): Promise<void> {
  const loaded = await loadState<ProvidersState>(STATE_FILE, {
    providers: [],
    activeProviderId: "",
    modelSettings: {},
    observedReasoning: {},
  });

  if (loaded.providers.length > 0) {
    state = {
      ...loaded,
      observedReasoning: loaded.observedReasoning ?? {},
    };
    console.log(`[provider] Loaded ${state.providers.length} provider(s), active: ${state.activeProviderId}`);
    return;
  }

  if (state.providers.length > 0) {
    await persist();
    console.log(`[provider] Seeded default provider: ${state.providers[0].name}`);
  }
}

export function listProviders(): ProviderConfig[] {
  return state.providers;
}

export async function addProvider(config: Omit<ProviderConfig, "id">): Promise<ProviderConfig> {
  const provider: ProviderConfig = { ...config, id: randomUUID() };
  state.providers.push(provider);
  if (state.providers.length === 1) {
    state.activeProviderId = provider.id;
  }
  await persist();
  return provider;
}

export async function updateProvider(id: string, updates: Partial<Omit<ProviderConfig, "id">>): Promise<ProviderConfig> {
  const index = state.providers.findIndex((provider) => provider.id === id);
  if (index === -1) throw new Error(`Provider not found: ${id}`);

  state.providers[index] = { ...state.providers[index], ...updates };
  invalidateProvider(id);
  await persist();
  return state.providers[index];
}

export async function removeProvider(id: string): Promise<void> {
  state.providers = state.providers.filter((provider) => provider.id !== id);
  invalidateProvider(id);

  if (state.activeProviderId === id) {
    state.activeProviderId = state.providers[0]?.id ?? "";
  }

  await persist();
}

export async function setActiveProvider(id: string): Promise<void> {
  if (!getProviderById(id)) throw new Error(`Provider not found: ${id}`);
  state.activeProviderId = id;
  await persist();
}

export async function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  return getAdapter(id).testConnection();
}

export async function getModels(providerId?: string): Promise<ModelInfo[]> {
  const provider = resolveProvider(providerId);
  const models = (await getAdapter(provider.id).listModels()).map((model) => mergeObservedReasoning(provider.id, model));
  modelsCache.set(provider.id, models);
  return models;
}

export async function resolveProviderModel(
  providerId?: string,
  preferredModel?: string,
): Promise<{ providerId: string; model: string }> {
  const provider = resolveProvider(providerId);
  const models = await getModels(provider.id);
  if (models.length === 0) throw new Error("No models available for the selected provider");

  const resolvedModel = preferredModel && models.some((model) => model.id === preferredModel)
    ? preferredModel
    : models[0].id;

  return { providerId: provider.id, model: resolvedModel };
}

export async function callProvider(request: UnifiedRequest): Promise<UnifiedResponse> {
  const provider = resolveProvider(request.providerId);
  const models = await getModels(provider.id);
  const model = models.find((entry) => entry.id === request.model);
  const settings = getModelSettings(provider.id, request.model);
  const normalized = normalizeRequestOptions(model, settings, request);

  const response = await getAdapter(provider.id).chat({
    ...request,
    providerId: provider.id,
    ...normalized,
  });
  if (hasObservedReasoning(response)) {
    await markObservedReasoning(provider.id, request.model);
  }
  return response;
}

export async function callProviderStream(request: UnifiedRequest, onChunk: OnChunkFn): Promise<UnifiedResponse> {
  const provider = resolveProvider(request.providerId);
  const models = await getModels(provider.id);
  const model = models.find((entry) => entry.id === request.model);
  const settings = getModelSettings(provider.id, request.model);
  const normalized = normalizeRequestOptions(model, settings, request);

  const response = await getAdapter(provider.id).chatStream(
    {
      ...request,
      providerId: provider.id,
      ...normalized,
    },
    onChunk,
  );
  if (hasObservedReasoning(response)) {
    await markObservedReasoning(provider.id, request.model);
  }
  return response;
}

export async function estimateProviderTokens(request: UnifiedRequest): Promise<TokenStats> {
  const provider = resolveProvider(request.providerId);
  const models = await getModels(provider.id);
  const model = models.find((entry) => entry.id === request.model);
  const settings = getModelSettings(provider.id, request.model);
  const mapped = {
    ...request,
    providerId: provider.id,
    ...normalizeRequestOptions(model, settings, request),
  };
  return estimateRequestTokens(mapped, provider.baseUrl);
}

export function getActiveProviderId(): string {
  return state.activeProviderId;
}

export function getModelSettings(providerId: string, modelId: string): ModelSettings {
  return state.modelSettings[getModelSettingsKey(providerId, modelId)] ?? {};
}

export function getAllModelSettings(providerId?: string): Record<string, ModelSettings> {
  const provider = resolveProvider(providerId);
  return Object.fromEntries(
    Object.entries(state.modelSettings)
      .filter(([key]) => key.startsWith(`${provider.id}::`))
      .map(([key, value]) => [key.slice(provider.id.length + 2), value]),
  );
}

export async function setModelSettings(providerId: string, modelId: string, settings: ModelSettings): Promise<void> {
  state.modelSettings[getModelSettingsKey(providerId, modelId)] = settings;
  await persist();
}
