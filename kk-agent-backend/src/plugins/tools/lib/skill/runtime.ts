import type { ToolExecutionResult, ToolRuntimeContext } from "../../../loop/types.js";
import type { McpServerConfig } from "../../../mcp/types.js";
import { loadSkillContext } from "../../../skills/service.js";
import { getErrorMessage } from "../../../../lib/error.js";

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function addLoadedSkill(context: ToolRuntimeContext, skillId: string, skillContext: string): ToolRuntimeContext {
  const loadedSkillIds = readStringArray(context.values.loadedSkillIds);
  if (loadedSkillIds.includes(skillId)) return context;
  const loadedSkillContexts = readStringArray(context.values.loadedSkillContexts);
  return {
    values: {
      ...context.values,
      loadedSkillIds: [...loadedSkillIds, skillId],
      loadedSkillContexts: [...loadedSkillContexts, skillContext],
    },
  };
}

export async function executeSkillTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolRuntimeContext = { values: {} },
): Promise<ToolExecutionResult | null> {
  if (toolName !== "Skill") return null;

  const skillId = String(args.name ?? "").trim();
  if (!skillId) {
    return { content: "Skill requires an exact name from <available_skills>.", isError: true };
  }

  const availableSkillIds = readStringArray(context.values.availableSkillIds);
  if (!availableSkillIds.includes(skillId)) {
    return { content: `Skill "${skillId}" is not available in this session.`, isError: true };
  }

  const loadedSkillIds = readStringArray(context.values.loadedSkillIds);
  if (loadedSkillIds.includes(skillId)) {
    return { content: `Skill "${skillId}" is already loaded.` };
  }

  try {
    const loaded = loadSkillContext(skillId);
    return {
      content: `Loaded skill "${loaded.skill.name}" from ${loaded.skill.path}.`,
      contextModifier: (previous) => addLoadedSkill(previous, skillId, loaded.context),
    };
  } catch (error) {
    return { content: getErrorMessage(error), isError: true };
  }
}
