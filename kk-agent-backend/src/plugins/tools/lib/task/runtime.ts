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
    const tasks = createTasks(sessionId, Array.isArray(args.tasks) ? args.tasks as TaskDraft[] : []);
    return {
      content: `Tasks erstellt.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  if (toolName === "update_tasks") {
    const tasks = updateTasks(sessionId, Array.isArray(args.tasks) ? args.tasks as TaskUpdateInput[] : []);
    return {
      content: `Tasks aktualisiert.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  if (toolName === "solve_tasks") {
    const tasks = solveTasks(sessionId, Array.isArray(args.taskIds) ? args.taskIds as string[] : []);
    return {
      content: `Tasks abgeschlossen.\n${taskSummary(tasks)}`,
      isError: false,
    };
  }

  return null;
}
