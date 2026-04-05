import type { ChatMode } from "../agent/types.js";

export type SkillSource = "system" | "custom";

export interface SkillMetadata {
  active: boolean;
  source?: SkillSource;
  recommendedToolIds: string[];
  recommendedMcpIds: string[];
  allowedModes: ChatMode[];
}

export interface SkillDefinition extends SkillMetadata {
  id: string;
  path: string;
  name: string;
  description: string;
  instruction: string;
}

export interface CreateSkillBody {
  name: string;
  description: string;
  instruction: string;
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModes?: ChatMode[];
}

export interface UpdateSkillBody {
  name?: string;
  description?: string;
  instruction?: string;
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModes?: ChatMode[];
}
