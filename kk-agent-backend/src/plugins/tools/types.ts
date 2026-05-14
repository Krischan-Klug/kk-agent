export type { MemoryFact, TaskItem } from "kk-agent-contract";

export interface TaskDraft {
  title: string;
  notes?: string;
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  notes?: string;
}
