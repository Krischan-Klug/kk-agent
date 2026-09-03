import type { PreparedProviderRequest, UnifiedResponse, OnChunkFn } from "./types.js";
import type { RuntimeModelCapabilities } from "../types.js";

export interface DiscoveredModel {
  id: string;
  object: string;
  providerId: string;
  ownedBy?: string;
  loaded?: boolean;
  maxContextLength?: number;
  contextLength?: number;
  runtimeCapabilities: RuntimeModelCapabilities;
}

export interface ProviderAdapter {
  complete(request: PreparedProviderRequest, onChunk: OnChunkFn): Promise<UnifiedResponse>;
  listModels(): Promise<DiscoveredModel[]>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
