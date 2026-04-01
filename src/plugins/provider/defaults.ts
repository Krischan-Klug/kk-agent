import type { ReasoningLevelConfig } from "./types.js";

export const DEFAULT_REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export const REASONING_LEVEL_DEFAULTS: Record<string, ReasoningLevelConfig> = {
  none:   { temperature: 1.0 },
  minimal:{ temperature: 1.0, maxOutputTokens: 2048 },
  low:    { temperature: 1.0, maxOutputTokens: 4096 },
  medium: { temperature: 1.0, maxOutputTokens: 8192 },
  high:   { temperature: 1.0, maxOutputTokens: 16384 },
  xhigh:  { temperature: 1.0 },
};
