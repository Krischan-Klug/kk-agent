import { getStateDirPath } from "../../../lib/state.js";
import type { ToolExecutionResult, ToolRuntimeContext } from "../../../loop/types.js";
import type { McpServerConfig } from "../../../mcp/types.js";
import { createSkill } from "../../../skills/service.js";
import { loadSkillFromPath } from "../../../skills/lib/loader.js";
import { createSkillContextMessage } from "../../../skills/lib/xml.js";
import type { CreateSkillBody, SkillDefinition } from "../../../skills/types.js";

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function readInstructionOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
  );
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return readStringArray(value);
}

function buildLoadedSkillSummary(skill: SkillDefinition): string {
  const lines = [`Loaded skill "${skill.id}" (${skill.name}).`];
  if (skill.recommendedToolIds.length > 0) {
    lines.push(`Recommended tools: ${skill.recommendedToolIds.join(", ")}`);
  }
  if (skill.recommendedMcpIds.length > 0) {
    lines.push(`Recommended MCPs: ${skill.recommendedMcpIds.join(", ")}`);
  }
  return lines.join("\n");
}

function addLoadedSkillId(context: ToolRuntimeContext, skillId: string): ToolRuntimeContext {
  const loadedSkillIds = readStringArray(context.values.loadedSkillIds);
  if (loadedSkillIds.includes(skillId)) return context;
  return {
    values: {
      ...context.values,
      loadedSkillIds: [...loadedSkillIds, skillId],
    },
  };
}

function buildCreatedSkillSummary(skill: SkillDefinition): string {
  const lines = [`Created skill "${skill.id}" (${skill.name}).`, `Path: ${skill.path}`];
  if (skill.allowedModeBehaviors.length > 0) {
    lines.push(`Allowed mode behaviors: ${skill.allowedModeBehaviors.join(", ")}`);
  }
  return lines.join("\n");
}

export async function executeSkillTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolRuntimeContext = { values: {} },
): Promise<ToolExecutionResult | null> {
  if (toolName === "CreateSkill") {
    try {
      const created = await createSkill({
        name: String(args.name ?? ""),
        description: String(args.description ?? ""),
        instruction: String(args.instruction ?? ""),
        active: readBoolean(args.active),
        allowedModeBehaviors: readOptionalStringArray(args.allowedModeBehaviors) as CreateSkillBody["allowedModeBehaviors"],
        recommendedToolIds: readOptionalStringArray(args.recommendedToolIds),
        recommendedMcpIds: readOptionalStringArray(args.recommendedMcpIds),
      });
      return {
        content: buildCreatedSkillSummary(created),
      };
    } catch (error) {
      return {
        content: (error as Error).message,
        isError: true,
      };
    }
  }

  if (toolName !== "Skill") return null;

  const skillId = String(args.skill ?? "").trim();
  if (!skillId) {
    return {
      content: "Skill requires a non-empty skill id from <skills_catalog>.",
      isError: true,
    };
  }

  const availableSkillIds = readStringArray(context.values.availableSkillIds);
  if (!availableSkillIds.includes(skillId)) {
    return {
      content: `Skill "${skillId}" is not available in the current mode or session skills catalog.`,
      isError: true,
    };
  }

  const loadedSkillIds = readStringArray(context.values.loadedSkillIds);
  if (loadedSkillIds.includes(skillId)) {
    return {
      content: `Skill "${skillId}" is already loaded in this conversation.`,
    };
  }

  const skillsRootDir = typeof context.values.skillsRootDir === "string"
    ? context.values.skillsRootDir
    : getStateDirPath("skills");

  try {
    const loaded = await loadSkillFromPath(skillsRootDir, skillId);
    if (!loaded.metadata.active) {
      return {
        content: `Skill "${skillId}" is inactive and cannot be loaded.`,
        isError: true,
      };
    }

    const skill: SkillDefinition = {
      id: skillId,
      path: loaded.resolvedPath,
      name: loaded.name,
      description: loaded.description,
      instruction: loaded.instruction,
      ...loaded.metadata,
    };
    const instructionOverrides = readInstructionOverrides(context.values.skillInstructionsById);
    const instruction = instructionOverrides[skillId] ?? skill.instruction;

    return {
      content: buildLoadedSkillSummary(skill),
      additionalMessages: [createSkillContextMessage(skill, instruction)],
      contextModifier: (previous) => addLoadedSkillId(previous, skillId),
    };
  } catch (error) {
    return {
      content: (error as Error).message,
      isError: true,
    };
  }
}
