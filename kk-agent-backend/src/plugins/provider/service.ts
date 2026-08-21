import { randomUUID } from "node:crypto";
import type {
  UnifiedRequest,
  UnifiedResponse,
  OnChunkFn,
} from "./lib/types.js";
import type {
  CreateProviderBody,
  ModelCapabilities,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  ProvidersState,
  UpdateProviderBody,
} from "./types.js";
import type { DiscoveredModel, ProviderAdapter } from "./lib/adapter.js";
import { createLocalProviderAdapter, createManualModel } from "./lib/adapters/local.js";
import { createLogger } from "../../lib/logger.js";
import { NotFoundError } from "../../lib/errors.js";
import { loadState, saveState } from "../lib/state.js";
import {
  getModelSettingsKey,
  normalizeStoredModelSettings,
} from "./lib/model-settings.js";
import { normalizeRequestOptions } from "./lib/request-options.js";
import {
  buildProfiledCapabilities,
  getModelProfile,
  getModelProfileSummary,
  listModelProfiles,
  suggestModelProfile,
} from "./lib/model-profiles/registry.js";

const logger = createLogger("provider");
const STATE_FILE = "providers.json";
const PROVIDER_SCHEMA_VERSION = 3;
const MODEL_REF_SEPARATOR = "::";
const DEFAULT_STATE: ProvidersState = {
  schemaVersion: PROVIDER_SCHEMA_VERSION,
  providers: [],
  modelSettings: {},
};

let state: ProvidersState = structuredClone(DEFAULT_STATE);
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
  if (state.providers.length === 0) throw new NotFoundError("Provider");
  if (state.providers.length === 1) return state.providers[0]!;
  throw new NotFoundError("Provider");
}

function normalizeStoredProvidersState(nextState: ProvidersState): ProvidersState {
  const modelSettings = Object.fromEntries(
    Object.entries(nextState.modelSettings ?? {}).flatMap(([key, value]) => {
      const normalized = normalizeStoredModelSettings(value);
      return normalized.profileId && getModelProfile(normalized.profileId)
        ? [[key, normalized]]
        : [];
    }),
  );
  return {
    schemaVersion: PROVIDER_SCHEMA_VERSION,
    providers: nextState.providers ?? [],
    modelSettings,
  };
}

function getSingleProviderId(): string | undefined {
  return state.providers.length === 1 ? state.providers[0]?.id : undefined;
}

function getAdapter(providerId: string): ProviderAdapter {
  const cached = adapterCache.get(providerId);
  if (cached) return cached;
  const provider = getProviderById(providerId);
  if (!provider) throw new NotFoundError("Provider", providerId);
  const adapter = createLocalProviderAdapter(provider);
  adapterCache.set(providerId, adapter);
  return adapter;
}

function invalidateProvider(providerId: string): void {
  adapterCache.delete(providerId);
  modelsCache.delete(providerId);
}

async function persist(): Promise<void> {
  await saveState(STATE_FILE, state);
}

function parseModelRef(value: string): { providerId: string; modelId: string } | undefined {
  const separatorIndex = value.indexOf(MODEL_REF_SEPARATOR);
  if (separatorIndex <= 0) return undefined;
  const providerId = value.slice(0, separatorIndex);
  const modelId = value.slice(separatorIndex + MODEL_REF_SEPARATOR.length);
  return providerId && modelId ? { providerId, modelId } : undefined;
}

function getModelSettings(providerId: string, modelId: string): ModelSettings {
  return normalizeStoredModelSettings(state.modelSettings[getModelSettingsKey(providerId, modelId)]);
}

function configureModel(discovered: DiscoveredModel): ModelInfo {
  const settings = getModelSettings(discovered.providerId, discovered.id);
  const profile = getModelProfile(settings.profileId);
  if (!profile) {
    return {
      ...discovered,
      suggestedProfileId: suggestModelProfile(discovered.id),
      compatibilityIssues: [],
    };
  }
  const resolved = buildProfiledCapabilities(profile, discovered.runtimeCapabilities);
  return {
    ...discovered,
    suggestedProfileId: suggestModelProfile(discovered.id),
    profile: getModelProfileSummary(profile),
    capabilities: resolved.capabilities,
    compatibilityIssues: resolved.issues,
  };
}

export async function initState(): Promise<void> {
  const loaded = await loadState<unknown>(STATE_FILE, DEFAULT_STATE);
  const compatible = loaded
    && typeof loaded === "object"
    && (loaded as Partial<ProvidersState>).schemaVersion === PROVIDER_SCHEMA_VERSION
    ? loaded as ProvidersState
    : structuredClone(DEFAULT_STATE);
  state = normalizeStoredProvidersState(compatible);
  if (JSON.stringify(state) !== JSON.stringify(loaded)) await persist();
  if (state.providers.length > 0) logger.info(`Loaded ${state.providers.length} provider(s).`);
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

export async function updateProvider(id: string, updates: UpdateProviderBody): Promise<ProviderConfig> {
  const index = state.providers.findIndex((provider) => provider.id === id);
  if (index === -1) throw new NotFoundError("Provider", id);
  state.providers[index] = { ...state.providers[index], ...updates };
  invalidateProvider(id);
  await persist();
  return state.providers[index]!;
}

export async function removeProvider(id: string): Promise<void> {
  state.providers = state.providers.filter((provider) => provider.id !== id);
  state.modelSettings = Object.fromEntries(
    Object.entries(state.modelSettings).filter(([key]) => !key.startsWith(`${id}${MODEL_REF_SEPARATOR}`)),
  );
  invalidateProvider(id);
  await persist();
}

export async function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  return getAdapter(id).testConnection();
}

function getManualModels(provider: ProviderConfig): DiscoveredModel[] {
  return (provider.models ?? []).map((modelId) => createManualModel(provider.id, modelId));
}

async function getProviderModels(provider: ProviderConfig): Promise<ModelInfo[]> {
  const manualModels = getManualModels(provider);
  let fetchedModels: DiscoveredModel[] = [];
  try {
    fetchedModels = await getAdapter(provider.id).listModels();
  } catch {
    if (manualModels.length === 0) throw new Error(`Could not discover models for provider "${provider.name}".`);
  }
  const seenIds = new Set<string>();
  const models = [...fetchedModels, ...manualModels].flatMap((model) => {
    if (seenIds.has(model.id)) return [];
    seenIds.add(model.id);
    return [configureModel(model)];
  });
  modelsCache.set(provider.id, models);
  return models;
}

export async function getModels(providerId?: string): Promise<ModelInfo[]> {
  if (providerId) return getProviderModels(resolveProvider(providerId));
  if (state.providers.length === 0) throw new NotFoundError("Provider");
  const settled = await Promise.allSettled(state.providers.map(getProviderModels));
  const models = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (models.length > 0) return models;
  const rejection = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejection) throw rejection.reason;
  return [];
}

export async function getEffectiveContextLimit(
  providerId: string,
  modelId: string,
): Promise<number | undefined> {
  const model = (await getModels(providerId)).find((entry) => entry.id === modelId);
  const limit = model?.contextLength;
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : undefined;
}

function configuredModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter((model) => model.profile && model.capabilities);
}

function selectConfiguredModel(models: ModelInfo[], preferredModel?: string): ModelInfo {
  const configured = configuredModels(models);
  if (preferredModel) {
    const selected = configured.find((model) => model.id === preferredModel);
    if (selected) return selected;
    if (models.some((model) => model.id === preferredModel)) {
      throw new Error(`Model "${preferredModel}" has no inference profile selected.`);
    }
    throw new Error(`Configured model "${preferredModel}" was not found.`);
  }
  if (configured.length === 0) {
    throw new Error("No model has an inference profile selected. Configure one in Settings > Provider.");
  }
  return configured[0]!;
}

export async function resolveProviderModel(
  providerId?: string,
  preferredModel?: string,
): Promise<{ providerId: string; model: string }> {
  if (!providerId && preferredModel) {
    const modelRef = parseModelRef(preferredModel);
    if (modelRef) {
      const selected = selectConfiguredModel(await getModels(modelRef.providerId), modelRef.modelId);
      return { providerId: selected.providerId, model: selected.id };
    }
  }
  if (providerId) {
    const provider = resolveProvider(providerId);
    const selected = selectConfiguredModel(await getModels(provider.id), preferredModel);
    return { providerId: provider.id, model: selected.id };
  }
  const selected = selectConfiguredModel(await getModels(), preferredModel);
  return { providerId: selected.providerId, model: selected.id };
}

async function prepareRequest(request: UnifiedRequest) {
  const provider = resolveProvider(request.providerId ?? getSingleProviderId());
  const model = (await getModels(provider.id)).find((entry) => entry.id === request.model);
  if (!model) throw new Error(`Model "${request.model}" was not found for provider "${provider.name}".`);
  const settings = getModelSettings(provider.id, request.model);
  const normalized = normalizeRequestOptions(model, settings, request);
  return {
    provider,
    prepared: { ...request, providerId: provider.id, ...normalized },
  };
}

function attachProviderDebug(response: UnifiedResponse, prepared: UnifiedRequest): void {
  const resolutionNotices = (prepared.resolvedLlmRequestConfig?.warnings ?? []).map((message) => ({
    level: "warning" as const,
    code: "model_profile_resolution",
    message,
  }));
  if (resolutionNotices.length > 0) {
    response.notices = [...resolutionNotices, ...(response.notices ?? [])];
  }
  response.debug = {
    ...(response.debug ?? { endpoint: prepared.endpoint! }),
    profileId: prepared.resolvedLlmRequestConfig?.profileId,
    resolvedRequestConfig: prepared.resolvedLlmRequestConfig,
  };
}

export async function callProviderStream(
  request: UnifiedRequest,
  onChunk: OnChunkFn,
  onPrepared?: (request: UnifiedRequest) => void | Promise<void>,
): Promise<UnifiedResponse> {
  const { provider, prepared } = await prepareRequest(request);
  await onPrepared?.(prepared);
  const response = await getAdapter(provider.id).chatStream(prepared, onChunk);
  attachProviderDebug(response, prepared);
  return response;
}

export function getModelCapabilities(
  providerId: string,
  modelId: string,
): ModelCapabilities | undefined {
  const cached = modelsCache.get(providerId)?.find((model) => model.id === modelId)?.capabilities;
  if (cached) return cached;
  const profile = getModelProfile(getModelSettings(providerId, modelId).profileId);
  return profile ? buildProfiledCapabilities(profile, {}).capabilities : undefined;
}

export function getAllModelSettings(providerId?: string): Record<string, ModelSettings> {
  return Object.fromEntries(
    Object.entries(state.modelSettings)
      .filter(([key]) => !providerId || key.startsWith(`${providerId}${MODEL_REF_SEPARATOR}`))
      .map(([key, value]) => [key, normalizeStoredModelSettings(value)]),
  );
}

export function getAvailableModelProfiles() {
  return listModelProfiles();
}

export async function setModelSettings(
  providerId: string,
  modelId: string,
  settings: ModelSettings,
): Promise<ModelSettings> {
  resolveProvider(providerId);
  const normalized = normalizeStoredModelSettings(settings);
  if (normalized.profileId && !getModelProfile(normalized.profileId)) {
    throw new Error(`Unknown model profile "${normalized.profileId}".`);
  }
  const key = getModelSettingsKey(providerId, modelId);
  if (normalized.profileId) state.modelSettings[key] = normalized;
  else delete state.modelSettings[key];
  modelsCache.delete(providerId);
  await persist();
  return normalized;
}
