import type { UnifiedRequest, UnifiedResponse, OnChunkFn } from "./types.js";
import type { ModelInfo } from "../types.js";

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
  listModels(): Promise<ModelInfo[]>;

  /** Quick connectivity check */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
