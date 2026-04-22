import type { ModeBehavior } from "./agent.js";
import type { SkillSource } from "./transcript.js";

export interface SkillMetadata {
  active: boolean;
  source?: SkillSource;
  recommendedToolIds: string[];
  recommendedMcpIds: string[];
  allowedModeBehaviors: ModeBehavior[];
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
  allowedModeBehaviors?: ModeBehavior[];
}

export interface UpdateSkillBody {
  name?: string;
  description?: string;
  instruction?: string;
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModeBehaviors?: ModeBehavior[];
}
