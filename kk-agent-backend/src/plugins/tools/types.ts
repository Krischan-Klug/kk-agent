export { INTERNAL_TOOL_IDS } from "kk-agent-contract";
export type {
  AccessScope,
  ApprovalMode,
  InternalToolConfig,
  InternalToolDefinition,
  InternalToolDescriptor,
  InternalToolId,
  MemoryFact,
  TaskItem,
  ToolResultPolicy,
  UpdateInternalToolBody,
} from "kk-agent-contract";

export interface TaskDraft {
  title: string;
  notes?: string;
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  notes?: string;
}

export interface ToolCallResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}
