import { randomUUID } from "node:crypto";
import type { TaskItem } from "../types.js";

const sessionTasks = new Map<string, TaskItem[]>();

function normalizeTask(task: TaskItem): TaskItem {
  return {
    id: String(task.id || randomUUID()),
    title: String(task.title ?? "").trim(),
    status: task.status,
    notes: task.notes?.trim() || undefined,
  };
}

function validateTaskStatus(status: string): status is TaskItem["status"] {
  return status === "pending" || status === "in_progress" || status === "completed";
}

export function listTasks(sessionId: string): TaskItem[] {
  return [...(sessionTasks.get(sessionId) ?? [])];
}

export function replaceTasks(sessionId: string, tasks: TaskItem[]): TaskItem[] {
  const normalized = tasks.map(normalizeTask);

  for (const task of normalized) {
    if (!task.title) throw new Error("Task title is required");
    if (!validateTaskStatus(task.status)) {
      throw new Error(`Invalid task status "${task.status}"`);
    }
  }

  sessionTasks.set(sessionId, normalized);
  return listTasks(sessionId);
}

export function clearTasks(sessionId: string): void {
  sessionTasks.delete(sessionId);
}

export function getTaskSummary(sessionId: string): string {
  const tasks = listTasks(sessionId);
  if (tasks.length === 0) return "Keine aktiven Tasks vorhanden.";

  return tasks
    .map((task, index) => {
      const note = task.notes ? ` (${task.notes})` : "";
      return `${index + 1}. [${task.status}] ${task.title}${note}`;
    })
    .join("\n");
}
