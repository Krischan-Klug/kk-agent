export const INTERNAL_TOOL_IDS = [
  "filesystem",
  "web-search",
  "terminal",
  "user-interaction",
  "task",
  "memory",
  "attachment",
  "skill",
] as const;

export type InternalToolId = (typeof INTERNAL_TOOL_IDS)[number];
export type AccessScope = "user" | "system";
export type ApprovalMode = "ask_approval" | "full_access";

export interface SecuritySettings {
  accessScope: AccessScope;
  approvalMode: ApprovalMode;
}

export interface ToolResultPolicy {
  previewThresholdChars?: number;
  previewChars?: number;
}

export interface InternalToolConfig {
  /** Effective runtime values. Security owns access and approval defaults. */
  accessScope?: AccessScope;
  approvalMode?: ApprovalMode;
  basePath?: string;
  workingDirectory?: string;
  resultPolicy?: ToolResultPolicy;
}

export interface InternalToolDefinition {
  id: string;
  name: string;
  active: boolean;
  instruction: string;
  emoji?: string;
  driver?: "native" | "mcp";
  config?: InternalToolConfig;
}

export interface InternalToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type InternalToolRuntimeStatus = "running" | "stopped" | "unavailable";

export interface InternalToolRuntimeState {
  status: InternalToolRuntimeStatus;
  error?: string;
}

export interface InternalToolListItem extends InternalToolDefinition {
  runtime: InternalToolRuntimeState;
  tools: InternalToolDescriptor[];
  credentials?: Array<{
    id: string;
    label: string;
    description?: string;
    required: boolean;
    configured: boolean;
    credentialId: string;
  }>;
}

export interface UpdateInternalToolBody {
  name?: string;
  active?: boolean;
  instruction?: string;
  emoji?: string;
  config?: Pick<InternalToolConfig, "resultPolicy">;
}
