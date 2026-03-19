import type { UnifiedRequest, UnifiedResponse, OnChunkFn } from "./lib/types.js";
import type { ModelInfo, ModelSettings } from "./types.js";
import { callLmStudio, callLmStudioStream } from "./lib/lmstudio.js";
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
  // activeModel aus Config wird nur als Seed benutzt (siehe initState)
  if (settings.activeModel) activeModel = settings.activeModel;
}

export async function initState(): Promise<void> {
  // State > Config > Code-Default
  const state = await loadState<ProviderState>(STATE_FILE, { activeModel: "", modelSettings: {} });
  modelSettings = state.modelSettings ?? {};
  if (state.activeModel) {
    activeModel = state.activeModel;
    console.log(`[provider] Loaded model from state: ${activeModel}`);
  } else if (activeModel) {
    // Config-Seed: in State speichern damit er ab jetzt Source of Truth ist
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

export async function callProvider(request: UnifiedRequest): Promise<UnifiedResponse> {
  return callLmStudio(request, baseUrl);
}

export async function callProviderStream(
  request: UnifiedRequest,
  onChunk: OnChunkFn,
): Promise<UnifiedResponse> {
  return callLmStudioStream(request, baseUrl, onChunk);
}

export async function getModels(): Promise<ModelInfo[]> {
  // Fetch from OpenAI-compatible endpoint
  const res = await fetch(`${baseUrl}/v1/models`);
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  const data = (await res.json()) as { data: ModelInfo[] };
  const models = data.data;

  // Try to enrich with native LM Studio API for context length info
  try {
    const nativeRes = await fetch(`${baseUrl}/api/v1/models`);
    if (nativeRes.ok) {
      const nativeData = (await nativeRes.json()) as {
        models: Array<{
          key: string;
          max_context_length?: number;
          loaded_instances?: Array<{
            id: string;
            config?: { context_length?: number };
          }>;
        }>;
      };
      const nativeMap = new Map(nativeData.models.map((m) => [m.key, m]));
      for (const model of models) {
        const native = nativeMap.get(model.id);
        if (native) {
          model.maxContextLength = native.max_context_length;
          const loaded = native.loaded_instances?.[0];
          if (loaded?.config?.context_length) {
            model.contextLength = loaded.config.context_length;
          }
        }
      }
    }
  } catch {
    // Native API not available, context info stays undefined
  }

  return models;
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
