import type { AgentModeDefinition, ModeBehavior } from "../types.js";
import { INTERNAL_TOOL_IDS } from "../../tools/types.js";

interface BuiltInModeMeta {
  id: ModeBehavior;
  label: string;
  behavior: ModeBehavior;
  source: AgentModeDefinition["source"];
  color: string;
}

const READ_ONLY_TOOL_NAMES = [
  "Read",
  "Glob",
  "Grep",
  "Skill",
  "Terminal",
  "WebSearch",
  "WebOpen",
  "WebFind",
  "WebFetch",
  "list_assets",
  "search_asset",
  "read_asset",
  "ask_user",
];

const PLANNING_TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  "create_tasks",
  "update_tasks",
];

const EDIT_TOOL_NAMES = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Terminal",
  "WebSearch",
  "WebOpen",
  "WebFind",
  "WebFetch",
  "Skill",
  "list_assets",
  "search_asset",
  "read_asset",
  "publish_artifact",
  "ask_user",
  "create_tasks",
  "update_tasks",
  "solve_tasks",
  "remember_facts",
];

const EDIT_TOOL_IDS: string[] = [...INTERNAL_TOOL_IDS];

const PLAN_TOOL_IDS: string[] = EDIT_TOOL_IDS.filter((id) => id !== "memory");

const BUILT_IN_MODE_META: Record<ModeBehavior, BuiltInModeMeta> = {
  plan: {
    id: "plan",
    label: "Plan",
    behavior: "plan",
    source: "builtin",
    color: "#60a5fa",
  },
  edit: {
    id: "edit",
    label: "Edit",
    behavior: "edit",
    source: "builtin",
    color: "#fbbf24",
  },
};

export function getBuiltInModeBehaviors(): ModeBehavior[] {
  return ["plan", "edit"];
}

export function getBuiltInModeMeta(behavior: ModeBehavior): BuiltInModeMeta {
  return BUILT_IN_MODE_META[behavior];
}

export function isModeBehavior(value: string): value is ModeBehavior {
  return getBuiltInModeBehaviors().includes(value as ModeBehavior);
}

export function getDefaultAllowedToolNames(behavior: ModeBehavior): string[] {
  if (behavior === "plan") return [...PLANNING_TOOL_NAMES];
  return [...EDIT_TOOL_NAMES];
}

export function getDefaultToolIds(behavior: ModeBehavior): string[] {
  if (behavior === "plan") return [...PLAN_TOOL_IDS];
  return [...EDIT_TOOL_IDS];
}
