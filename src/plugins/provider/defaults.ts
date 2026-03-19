import type { ReasoningLevelConfig } from "./types.js";

export const REASONING_LEVEL_DEFAULTS: Record<string, ReasoningLevelConfig> = {
  off:    { temperature: 1.0 },
  low:    { temperature: 1.0, maxOutputTokens: 4096 },
  medium: { temperature: 1.0, maxOutputTokens: 8192 },
  high:   { temperature: 1.0, maxOutputTokens: 16384 },
  on:     { temperature: 1.0, maxOutputTokens: -1 },
};
