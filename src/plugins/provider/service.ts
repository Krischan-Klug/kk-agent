import type { UnifiedRequest, UnifiedResponse, OnChunkFn } from "./lib/types.js";
import type { ModelInfo, ModelSettings } from "./types.js";
import { callChatCompletions, callChatCompletionsStream } from "./lib/lmstudio.js";
import { loadState, saveState } from "../lib/state.js";

const STATE_FILE = "provider.json";

interface ProviderState {
  activeModel: string;
  modelSettings: Record<string, ModelSettings>;
}

let baseUrl = "http://localhost:1234";
let activeModel = "";
let modelSettings: Record<string, ModelSettings> = {};

export function configure(settings: { baseUrl?: string; activeModel?: string }): void {
  if (settings.baseUrl) baseUrl = settings.baseUrl;
  if (settings.activeModel) activeModel = settings.activeModel;
}

export async function initState(): Promise<void> {
  const state = await loadState<ProviderState>(STATE_FILE, { activeModel: "", modelSettings: {} });
  modelSettings = state.modelSettings ?? {};
  if (state.activeModel) {
    activeModel = state.activeModel;
    console.log(`[provider] Loaded model from state: ${activeModel}`);
  } else if (activeModel) {
    await persistState();
    console.log(`[provider] Seeded model from config: ${activeModel}`);
  }
}

export async function autoSelectModel(): Promise<void> {
  if (activeModel) return;
  try {
    const models = await getModels();
    if (models.length > 0) {
      activeModel = models[0].id;
      await persistState();
      console.log(`[provider] Auto-selected model: ${activeModel}`);
    } else {
      console.warn("[provider] No models available at provider endpoint.");
    }
  } catch (err) {
    console.warn("[provider] Could not reach provider endpoint:", (err as Error).message);
  }
}

/**
 * Map reasoning effort for the Chat Completions API.
 * - On/Off models (reasoningOnOff=true): off→"off", rest→"on"
 * - Standard: xhigh→"high" (CC kennt kein xhigh), rest direkt
 */
function mapReasoning(modelId: string, effort?: string): string | undefined {
  if (!effort) return undefined;
  const settings = modelSettings[modelId];

  if (settings?.reasoningOnOff) {
    return effort === "off" ? "off" : "on";
  }

  if (effort === "xhigh") return "high";
  return effort;
}

export async function callProvider(request: UnifiedRequest): Promise<UnifiedResponse> {
  const mapped = { ...request, reasoningEffort: mapReasoning(request.model, request.reasoningEffort) };
  return callChatCompletions(mapped, baseUrl);
}

export async function callProviderStream(
  request: UnifiedRequest,
  onChunk: OnChunkFn,
): Promise<UnifiedResponse> {
  const mapped = { ...request, reasoningEffort: mapReasoning(request.model, request.reasoningEffort) };
  return callChatCompletionsStream(mapped, baseUrl, onChunk);
}

export async function getModels(): Promise<ModelInfo[]> {
  // Use native LM Studio API for richer model info (context length)
  const res = await fetch(`${baseUrl}/api/v1/models`);
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  const data = (await res.json()) as {
    models: Array<{
      key: string;
      max_context_length?: number;
      loaded_instances?: Array<{
        id: string;
        config?: { context_length?: number };
      }>;
    }>;
  };

  return data.models.map((m) => ({
    id: m.key,
    object: "model",
    maxContextLength: m.max_context_length,
    contextLength: m.loaded_instances?.[0]?.config?.context_length,
  }));
}

async function persistState(): Promise<void> {
  await saveState(STATE_FILE, { activeModel, modelSettings });
}

export async function switchModel(modelId: string): Promise<void> {
  activeModel = modelId;
  await persistState();
}

export function getActiveModel(): string {
  return activeModel;
}

export function getModelSettings(modelId: string): ModelSettings {
  return modelSettings[modelId] ?? {};
}

export function getAllModelSettings(): Record<string, ModelSettings> {
  return modelSettings;
}

export async function setModelSettings(modelId: string, settings: ModelSettings): Promise<void> {
  modelSettings[modelId] = settings;
  await persistState();
}
