import type { TaskDraft, TaskItem, TaskUpdateInput } from "../types.js";

const sessionTasks = new Map<string, TaskItem[]>();

function createTaskId(index: number): string {
  return String(index + 1);
}

function normalizeTask(task: TaskItem, index: number): TaskItem {
  return {
    id: String(task.id || createTaskId(index)),
    title: String(task.title ?? "").trim(),
    status: task.status,
    notes: task.notes?.trim() || undefined,
  };
}

function validateTaskStatus(status: string): status is TaskItem["status"] {
  return status === "pending" || status === "in_progress" || status === "completed";
}

function reconcileTaskStatuses(tasks: TaskItem[]): TaskItem[] {
  let activeOpenTaskAssigned = false;

  return tasks.map((task) => {
    if (task.status === "completed") return task;
    if (!activeOpenTaskAssigned) {
      activeOpenTaskAssigned = true;
      return { ...task, status: "in_progress" };
    }
    return { ...task, status: "pending" };
  });
}

export function listTasks(sessionId: string): TaskItem[] {
  return [...(sessionTasks.get(sessionId) ?? [])];
}

export function replaceTasks(sessionId: string, tasks: TaskItem[]): TaskItem[] {
  const normalized = tasks.map((task, index) => normalizeTask(task, index));

  for (const task of normalized) {
    if (!task.title) throw new Error("Task title is required");
    if (!validateTaskStatus(task.status)) {
      throw new Error(`Invalid task status "${task.status}"`);
    }
  }

  sessionTasks.set(sessionId, reconcileTaskStatuses(normalized));
  return listTasks(sessionId);
}

export function createTasks(sessionId: string, drafts: TaskDraft[]): TaskItem[] {
  const created = drafts.map((draft, index) => {
    const title = String(draft.title ?? "").trim();
    const notes = draft.notes?.trim() || undefined;
    if (!title) throw new Error("Task title is required");
    return {
      id: createTaskId(index),
      title,
      notes,
      status: "pending" as const,
    };
  });

  sessionTasks.set(sessionId, reconcileTaskStatuses(created));
  return listTasks(sessionId);
}

function resolveTaskReference(current: TaskItem[], rawId: string): TaskItem | undefined {
  const id = String(rawId ?? "").trim();
  if (!id) return undefined;
  const direct = current.find((task) => task.id === id);
  if (direct) return direct;

  const asIndex = Number.parseInt(id, 10);
  if (!Number.isNaN(asIndex) && asIndex >= 1 && asIndex <= current.length) {
    return current[asIndex - 1];
  }

  return undefined;
}

export function updateTasks(sessionId: string, updates: TaskUpdateInput[]): TaskItem[] {
  const current = listTasks(sessionId);

  for (const update of updates) {
    const id = String(update.id ?? "").trim();
    if (!id) throw new Error("Task id is required");
    const existing = resolveTaskReference(current, id);
    if (!existing) throw new Error(`Task "${id}" not found`);

    if (update.title !== undefined) {
      const title = String(update.title).trim();
      if (!title) throw new Error("Task title must not be empty");
      existing.title = title;
    }

    if (update.notes !== undefined) {
      existing.notes = update.notes.trim() || undefined;
    }
  }

  sessionTasks.set(sessionId, reconcileTaskStatuses(current));
  return listTasks(sessionId);
}

export function solveTasks(sessionId: string, taskIds: string[]): TaskItem[] {
  const current = listTasks(sessionId);
  const ids = taskIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("At least one task id is required");

  const resolvedTasks = ids.map((id) => {
    const task = resolveTaskReference(current, id);
    if (!task) throw new Error(`Task "${id}" not found`);
    return task;
  });
  const idSet = new Set(resolvedTasks.map((task) => task.id));

  const next = current.map((task) => (
    idSet.has(task.id)
      ? { ...task, status: "completed" as const }
      : task
  ));

  sessionTasks.set(sessionId, reconcileTaskStatuses(next));
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
      return `${index + 1}. [id=${task.id}] [${task.status}] ${task.title}${note}`;
    })
    .join("\n");
}
