import type { TaskStatus } from "kk-agent-contract";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
}

export interface TaskDraft {
  title: string;
  notes?: string;
}

export interface TaskUpdateInput {
  id: string;
  title?: string;
  notes?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
}
