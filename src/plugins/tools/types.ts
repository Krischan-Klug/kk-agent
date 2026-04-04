export type SystemToolKey = "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory" | "attachment";

export type TaskStatus = "pending" | "in_progress" | "completed";

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
