export type SkillSource = "managed" | "user" | "workspace";

export interface SkillDiagnostic {
  level: "warning" | "error";
  message: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  path: string;
  rootPath: string;
  source: SkillSource;
  mutable: boolean;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools?: string;
  resources: string[];
  diagnostics: SkillDiagnostic[];
}

export interface ImportSkillResult {
  skill: SkillDefinition;
}
