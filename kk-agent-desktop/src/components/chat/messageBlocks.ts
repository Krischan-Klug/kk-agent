import type { TranscriptToolUseBlock } from "@/types/api";
import type { ActiveToolCall } from "./types";

export {
  collectAssetRefs,
  collectReasoning,
  collectText,
  collectToolResults,
  collectToolUses,
} from "kk-agent-contract";

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readRecordList(input: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = input[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function getTaskTitles(input: Record<string, unknown>): string | undefined {
  const titles = readRecordList(input, "tasks")
    .map((task) => typeof task.title === "string" ? task.title.trim() : "")
    .filter(Boolean);
  return titles.length > 0 ? titles.join(" · ") : undefined;
}

export function getToolCallDisplayText(input: Record<string, unknown>, toolName?: string): string | undefined {
  if (toolName === "remember_facts") {
    const factTexts = readRecordList(input, "facts")
      .map((fact) => typeof fact.text === "string" ? fact.text.trim() : "")
      .filter(Boolean);
    if (factTexts.length > 0) return factTexts.join(" · ");
  }

  if (toolName === "create_tasks" || toolName === "update_tasks") {
    return getTaskTitles(input);
  }

  if (toolName === "solve_tasks" && Array.isArray(input.taskIds)) {
    const taskCount = input.taskIds.filter((id) => typeof id === "string").length;
    return taskCount > 0 ? `${taskCount} task${taskCount === 1 ? "" : "s"}` : undefined;
  }

  if (toolName === "ask_user") return readString(input, "question");
  if (toolName === "Terminal") return readString(input, "command");
  if (toolName === "Skill") return readString(input, "name");

  if (toolName === "search_asset") return readString(input, "query");
  if (toolName === "read_asset") return readString(input, "assetId");
  if (toolName === "publish_artifact") return readString(input, "filename") ?? readString(input, "file_path");
  if (toolName === "list_assets") return "Session assets";

  const value = input.tool_call_description;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return toolName?.replaceAll(/[_-]+/g, " ").replaceAll(/([a-z])([A-Z])/g, "$1 $2").trim() || undefined;
}

export function buildToolCards(
  toolUses: TranscriptToolUseBlock[],
  toolResults = new Map<string, { content: string; isError: boolean; metadata?: Record<string, unknown> }>(),
): ActiveToolCall[] {
  return toolUses.map((toolUse) => {
    const result = toolResults.get(toolUse.id);
    return {
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
      status: result ? (result.isError ? "error" : "completed") : "queued",
      displayText: getToolCallDisplayText(toolUse.input, toolUse.name),
      ...(result ? { result } : {}),
      ...(result?.metadata ? { metadata: result.metadata } : {}),
    };
  });
}
