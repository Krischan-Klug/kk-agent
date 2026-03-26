/**
 * Legacy Completions endpoint (/v1/completions) — STUB
 *
 * Simple text completion with no tool-calling support.
 * Will be fully implemented when needed.
 */
import type { UnifiedRequest, UnifiedResponse, OnChunkFn } from "../types.js";

export async function chat(
  _request: UnifiedRequest,
  _baseUrl: string,
  _headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  throw new Error("Completions endpoint is not yet implemented");
}

export async function chatStream(
  _request: UnifiedRequest,
  _baseUrl: string,
  _onChunk: OnChunkFn,
  _headers: Record<string, string> = {},
): Promise<UnifiedResponse> {
  throw new Error("Completions endpoint is not yet implemented");
}
