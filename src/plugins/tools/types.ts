export type SystemToolKey = "filesystem" | "web-search" | "terminal" | "user-interaction" | "task" | "memory" | "attachment";

export interface ToolResultOptions {
  maxContextChars?: number;
}

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  notes?: string;
}

export interface MemoryFact {
  id: string;
  text: string;
}
