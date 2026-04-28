import type { ModeBehavior } from "../../agent/types.js";
import { isModeBehavior } from "../../agent/lib/modes.js";
import type { SkillMetadata } from "../types.js";

const DEFAULT_ALLOWED_MODE_BEHAVIORS: ModeBehavior[] = ["plan", "edit"];

interface SkillMetadataInput {
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModeBehaviors?: ModeBehavior[];
}

interface NormalizeSkillMetadataOptions {
  sanitizeToolIds?: (ids: string[]) => string[];
  sanitizeMcpIds?: (ids: string[]) => string[];
}

function normalizeSkillModeBehaviors(modeBehaviors?: ModeBehavior[]): ModeBehavior[] {
  const normalized = [...new Set((modeBehaviors ?? DEFAULT_ALLOWED_MODE_BEHAVIORS).filter((mode): mode is ModeBehavior =>
    typeof mode === "string" && isModeBehavior(mode)
  ))];
  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_MODE_BEHAVIORS];
}

export function normalizeSkillMetadata(
  metadata: SkillMetadataInput = {},
  options: NormalizeSkillMetadataOptions = {},
): SkillMetadata {
  const recommendedToolIds = [...new Set(metadata.recommendedToolIds ?? [])];
  const recommendedMcpIds = [...new Set(metadata.recommendedMcpIds ?? [])];

  return {
    active: metadata.active ?? true,
    source: "custom",
    recommendedToolIds: options.sanitizeToolIds ? options.sanitizeToolIds(recommendedToolIds) : recommendedToolIds,
    recommendedMcpIds: options.sanitizeMcpIds ? options.sanitizeMcpIds(recommendedMcpIds) : recommendedMcpIds,
    allowedModeBehaviors: normalizeSkillModeBehaviors(metadata.allowedModeBehaviors),
  };
}
