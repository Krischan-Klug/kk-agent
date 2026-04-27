import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { getCurrentSessionId } from "../user-interaction/interaction-store.js";
import { createTasks, solveTasks, updateTasks } from "../../lib/task-state.js";
import type { TaskDraft, TaskItem, TaskUpdateInput } from "../../types.js";

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for task tool.");
  return sessionId;
}

function taskSummary(tasks: TaskItem[]): string {
  if (tasks.length === 0) return "Keine Tasks gesetzt.";
  return tasks
    .map((task, index) => `- ${index + 1}. [id=${task.id}] [${task.status}] ${task.title}${task.notes ? ` (${task.notes})` : ""}`)
    .join("\n");
}

export async function executeTaskTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const sessionId = getSessionIdOrThrow();

  if (toolName === "create_tasks") {
    const tasks = await createTasks(sessionId, Array.isArray(args.tasks) ? args.tasks.filter((t): t is TaskDraft => t && typeof t === "object" && "title" in t) : []);
    return {
      content: `Tasks erstellt.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  if (toolName === "update_tasks") {
    const tasks = await updateTasks(sessionId, Array.isArray(args.tasks) ? args.tasks.filter((t): t is TaskUpdateInput => t && typeof t === "object" && "id" in t) : []);
    return {
      content: `Tasks aktualisiert.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  if (toolName === "solve_tasks") {
    const tasks = await solveTasks(sessionId, Array.isArray(args.taskIds) ? args.taskIds.filter((id): id is string => typeof id === "string") : []);
    return {
      content: `Tasks abgeschlossen.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  return null;
}
