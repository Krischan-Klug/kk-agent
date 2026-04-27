export type { MemoryFact, TaskItem } from "@krischan-klug/kk-agent-contract";

export interface TaskDraft {
  title: string;
  notes?: string;
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  notes?: string;
}
