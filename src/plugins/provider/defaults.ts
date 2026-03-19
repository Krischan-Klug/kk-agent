import type { ReasoningLevelConfig } from "./types.js";

export const REASONING_LEVEL_DEFAULTS: Record<string, ReasoningLevelConfig> = {
  off:    { temperature: 0.7 },
  low:    { temperature: 0.3, maxOutputTokens: 4096 },
  medium: { temperature: 0.5, maxOutputTokens: 8192 },
  high:   { temperature: 0.7, maxOutputTokens: 16384 },
  on:     { temperature: 0.8, maxOutputTokens: -1 },
};
