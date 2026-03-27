/**
 * Provider Registry Service
 *
 * Manages multiple providers (LM Studio, OpenAI, Anthropic) and delegates
 * calls to the active provider's adapter. The external API (callProvider,
 * callProviderStream) keeps the same signature — agent-loop.ts doesn't change.
 */
import { randomUUID } from "node:crypto";
import type { UnifiedRequest, UnifiedResponse, OnChunkFn, TokenStats } from "./lib/types.js";
import type { ModelInfo, ModelSettings, ProviderConfig, ProvidersState } from "./types.js";
import type { ProviderAdapter } from "./lib/adapter.js";
import { createAdapter } from "./lib/adapters/index.js";
import { estimateRequestTokens } from "./lib/token-estimator.js";
import { loadState, saveState } from "../lib/state.js";

const STATE_FILE = "providers.json";

/* ── State ── */

let state: ProvidersState = {
  providers: [],
  activeProviderId: "",
  activeModel: "",
  modelSettings: {},
};

/** Adapter cache — keyed by provider id, invalidated on config change */
const adapterCache = new Map<string, ProviderAdapter>();

/* ── Internal helpers ── */

function getActiveProvider(): ProviderConfig | undefined {
  return state.providers.find((p) => p.id === state.activeProviderId);
}

function getAdapter(providerId: string): ProviderAdapter {
  const cached = adapterCache.get(providerId);
  if (cached) return cached;

  const config = state.providers.find((p) => p.id === providerId);
  if (!config) throw new Error(`Provider not found: ${providerId}`);

  const adapter = createAdapter(config);
  adapterCache.set(providerId, adapter);
  return adapter;
}

function getActiveAdapter(): ProviderAdapter {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No active provider configured");
  return getAdapter(provider.id);
}

function invalidateAdapterCache(providerId: string): void {
  adapterCache.delete(providerId);
}

async function persist(): Promise<void> {
  await saveState(STATE_FILE, state);
}

/* ── Reasoning mapping ── */

/**
 * Map reasoning effort for the API.
 * - On/Off models (reasoningOnOff=true): off→"off", rest→"on"
 * - Standard: xhigh→"high" (Chat Completions doesn't know xhigh), rest as-is
 */
function mapReasoning(modelId: string, effort?: string): string | undefined {
  if (!effort) return undefined;
  const settings = state.modelSettings[modelId];

  if (settings?.reasoningOnOff) {
    return effort === "off" ? "off" : "on";
  }

  if (effort === "xhigh") return "high";
  return effort;
}

/* ── Public API: Init ── */

export function configure(settings: { baseUrl?: string; activeModel?: string }): void {
  // During init, if no providers exist yet, seed a default LM Studio provider
  if (state.providers.length === 0 && settings.baseUrl) {
    const defaultProvider: ProviderConfig = {
      id: randomUUID(),
      name: "LM Studio",
      type: "lmstudio",
      baseUrl: settings.baseUrl,
      authMethod: "none",
      isDefault: true,
    };
    state.providers.push(defaultProvider);
    state.activeProviderId = defaultProvider.id;
  }
  if (settings.activeModel) {
    state.activeModel = settings.activeModel;
  }
}

export async function initState(): Promise<void> {
  const loaded = await loadState<ProvidersState>(STATE_FILE, {
    providers: [],
    activeProviderId: "",
    activeModel: "",
    modelSettings: {},
  });

  if (loaded.providers.length > 0) {
    // Use persisted state
    state = loaded;
    console.log(`[provider] Loaded ${state.providers.length} provider(s), active: ${state.activeProviderId}`);
    return;
  }

  // Fresh start — persist whatever configure() seeded
  if (state.providers.length > 0) {
    await persist();
    console.log(`[provider] Seeded default provider: ${state.providers[0].name}`);
  }
}

export async function autoSelectModel(): Promise<void> {
  if (state.activeModel) return;
  try {
    const models = await getModels();
    if (models.length > 0) {
      state.activeModel = models[0].id;
      await persist();
      console.log(`[provider] Auto-selected model: ${state.activeModel}`);
    } else {
      console.warn("[provider] No models available at provider endpoint.");
    }
  } catch (err) {
    console.warn("[provider] Could not reach provider endpoint:", (err as Error).message);
  }
}

/* ── Public API: Provider CRUD ── */

export function listProviders(): ProviderConfig[] {
  return state.providers;
}

export async function addProvider(config: Omit<ProviderConfig, "id">): Promise<ProviderConfig> {
  const provider: ProviderConfig = { ...config, id: randomUUID() };
  state.providers.push(provider);

  // First provider becomes active automatically
  if (state.providers.length === 1) {
    state.activeProviderId = provider.id;
  }

  await persist();
  return provider;
}

export async function updateProvider(id: string, updates: Partial<Omit<ProviderConfig, "id">>): Promise<ProviderConfig> {
  const idx = state.providers.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Provider not found: ${id}`);

  state.providers[idx] = { ...state.providers[idx], ...updates };
  invalidateAdapterCache(id);
  await persist();
  return state.providers[idx];
}

export async function removeProvider(id: string): Promise<void> {
  state.providers = state.providers.filter((p) => p.id !== id);
  invalidateAdapterCache(id);

  // If we removed the active provider, pick the next one
  if (state.activeProviderId === id) {
    state.activeProviderId = state.providers[0]?.id ?? "";
  }

  await persist();
}

export async function setActiveProvider(id: string): Promise<void> {
  if (!state.providers.find((p) => p.id === id)) {
    throw new Error(`Provider not found: ${id}`);
  }
  state.activeProviderId = id;
  await persist();
}

export async function testProvider(id: string): Promise<{ ok: boolean; error?: string }> {
  const adapter = getAdapter(id);
  return adapter.testConnection();
}

/* ── Public API: Model operations ── */

export async function callProvider(request: UnifiedRequest): Promise<UnifiedResponse> {
  const endpoint = state.modelSettings[request.model]?.endpoint || "chat-completions";
  const mapped = { ...request, endpoint, reasoningEffort: mapReasoning(request.model, request.reasoningEffort) };
  return getActiveAdapter().chat(mapped);
}

export async function callProviderStream(
  request: UnifiedRequest,
  onChunk: OnChunkFn,
): Promise<UnifiedResponse> {
  const endpoint = state.modelSettings[request.model]?.endpoint || "chat-completions";
  const mapped = { ...request, endpoint, reasoningEffort: mapReasoning(request.model, request.reasoningEffort) };
  return getActiveAdapter().chatStream(mapped, onChunk);
}

export async function estimateProviderTokens(request: UnifiedRequest): Promise<TokenStats> {
  const mapped = { ...request, reasoningEffort: mapReasoning(request.model, request.reasoningEffort) };
  const provider = getActiveProvider();
  return estimateRequestTokens(mapped, provider?.baseUrl ?? "http://localhost:1234");
}

export async function getModels(): Promise<ModelInfo[]> {
  return getActiveAdapter().listModels();
}

export async function switchModel(modelId: string): Promise<void> {
  state.activeModel = modelId;
  await persist();
}

export function getActiveModel(): string {
  return state.activeModel;
}

export function getActiveProviderId(): string {
  return state.activeProviderId;
}

export function getModelSettings(modelId: string): ModelSettings {
  return state.modelSettings[modelId] ?? {};
}

export function getAllModelSettings(): Record<string, ModelSettings> {
  return state.modelSettings;
}

export async function setModelSettings(modelId: string, settings: ModelSettings): Promise<void> {
  state.modelSettings[modelId] = settings;
  await persist();
}
