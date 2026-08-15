import type { UnifiedRequest, UnifiedResponse, OnChunkFn } from "./types.js";
import type { RuntimeModelCapabilities } from "../types.js";

export interface DiscoveredModel {
  id: string;
  object: string;
  providerId: string;
  maxContextLength?: number;
  contextLength?: number;
  publisher?: string;
  architecture?: string;
  runtimeCapabilities: RuntimeModelCapabilities;
}

/**
 * ProviderAdapter — the contract every provider must implement.
 *
 * Each adapter is created by a factory function (not a class) to keep
 * things simple and avoid `this`-binding issues.
 */
export interface ProviderAdapter {
  readonly type: string;

  /** Streaming call */
  chatStream(request: UnifiedRequest, onChunk: OnChunkFn): Promise<UnifiedResponse>;

  /** List available models from this provider */
  listModels(): Promise<DiscoveredModel[]>;

  /** Quick connectivity check */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
