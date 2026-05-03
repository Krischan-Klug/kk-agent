import type { SkillSource } from "./transcript.js";

export interface SkillDefinition {
  id: string;
  path: string;
  name: string;
  description: string;
  instruction: string;
  source?: SkillSource;
  linkedToolIds: string[];
  linkedMcpIds: string[];
}

export interface CreateSkillBody {
  name: string;
  description: string;
  instruction: string;
}

export interface UpdateSkillBody {
  name?: string;
  description?: string;
  instruction?: string;
}

export interface ImportSkillResult {
  skill: SkillDefinition;
}

export interface UpdateSkillLinksBody {
  toolIds?: string[];
  mcpIds?: string[];
}
