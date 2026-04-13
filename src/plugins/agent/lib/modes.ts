import type { ChatMode } from "../types.js";

export interface ChatModeMeta {
  mode: ChatMode;
  label: string;
}

export const READ_ONLY_TOOL_NAMES = [
  "Read",
  "Glob",
  "Grep",
  "Skill",
  "Bash",
  "WebSearch",
  "WebFetch",
  "list_attachments",
  "read_attachment",
  "provide_attachment",
  "ask_user",
];

export const PLANNING_TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  "create_tasks",
  "update_tasks",
];

export const EDIT_TOOL_NAMES = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "WebSearch",
  "WebFetch",
  "Skill",
  "list_attachments",
  "read_attachment",
  "provide_attachment",
  "ask_user",
  "create_tasks",
  "update_tasks",
  "solve_tasks",
  "remember_facts",
];

export const PLAN_TOOL_IDS = ["filesystem", "web-search", "terminal", "user-interaction", "task", "attachment", "skill"];

export const EDIT_TOOL_IDS = ["filesystem", "web-search", "terminal", "user-interaction", "task", "memory", "attachment", "skill"];

export const CHAT_MODE_META: Record<ChatMode, ChatModeMeta> = {
  plan: {
    mode: "plan",
    label: "Plan",
  },
  edit: {
    mode: "edit",
    label: "Edit",
  },
  autonomous: {
    mode: "autonomous",
    label: "Autonomous",
  },
};

export function getChatModes(): ChatMode[] {
  return ["plan", "edit", "autonomous"];
}

export function getChatModeMeta(mode: ChatMode): ChatModeMeta {
  return CHAT_MODE_META[mode];
}

export function getDefaultAllowedToolNames(mode: ChatMode): string[] {
  if (mode === "plan") return [...PLANNING_TOOL_NAMES];
  return [...EDIT_TOOL_NAMES];
}

export function getDefaultToolIds(mode: ChatMode): string[] {
  if (mode === "plan") return [...PLAN_TOOL_IDS];
  return [...EDIT_TOOL_IDS];
}
