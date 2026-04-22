import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createSlugId, filterToKnownIds } from "../lib/ids.js";
import { getStateDirPath } from "../lib/state.js";
import { getKnownMcpIds } from "../mcp/service.js";
import { getKnownSystemMcpIds } from "../tools/service.js";
import type { ModeBehavior } from "../agent/types.js";
import type { CreateSkillBody, SkillDefinition, SkillMetadata, UpdateSkillBody } from "./types.js";
import { loadSkillFromPath, writeSkillBundle } from "./lib/loader.js";
import { buildSkillsCatalogSection } from "./lib/xml.js";
import { isModeBehavior } from "../agent/lib/modes.js";

const DEFAULT_ALLOWED_MODE_BEHAVIORS: ModeBehavior[] = ["plan", "edit"];
const DEFAULT_CREATE_SKILL_ID = "create-skill";

const DEFAULT_CREATE_SKILL_BODY: CreateSkillBody = {
  name: "Create Skill",
  description: "Create or rewrite a reusable KK-Agent skill bundle in state/skills. Use when the user wants a local skill that should follow the KK-Agent SKILL.md format and trigger reliably for a specific workflow.",
  instruction: [
    "Treat KK-Agent skills as reusable instruction bundles for the agent. Do not model timers, schedules, background jobs, providers, or MCP/tool definitions as skills.",
    "If `create-skill` is available in <skills_catalog> and the user wants a skill created or rewritten, load `create-skill` with Skill before you ask follow-up questions, draft content, or call CreateSkill.",
    "When you create or rewrite a skill through the agent workflow, always use CreateSkill. Do not manually write SKILL.md or kk-agent.skill.json unless the user explicitly asks for direct file editing.",
    "Focus on the content fields only: name, description, instruction, and optional metadata. Let CreateSkill handle skill id generation, YAML frontmatter serialization, and kk-agent.skill.json writing.",
    "The resulting bundle must contain exactly one SKILL.md in the bundle root. It must start with YAML frontmatter. Do not put a markdown heading or any other text before the opening ---.",
    "Frontmatter must contain a non-empty name and description. Write the description as a trigger-oriented sentence that states what the skill does and when it should be used.",
    "Use this SKILL.md frontmatter pattern exactly:",
    "```md\n---\nname: Repo Analysis\ndescription: Analyze a repository before editing and surface the files, risks, and likely change points. Use when the user wants implementation planning or codebase orientation.\n---\n```",
    "Do not encode trigger lists as `Trigger:` mini-syntax inside description. Prefer one natural sentence such as `Use when the user wants repository analysis, code review, or codebase orientation.`",
    "Write the instruction body as lean markdown with short imperative lines or compact sections. Capture the workflow, key decisions, constraints, and expected output shape.",
    "A valid compact body can look like this:",
    "```md\nRead the relevant files before proposing changes.\nList the main modules involved and the likely edit points.\nCall out risks, missing context, and required verification.\nKeep the final summary short and file-oriented.\n```",
    "Omit filler, generic AI advice, and duplicate explanation. Keep only information that is specific and reusable for this workflow.",
    "Create kk-agent.skill.json only for KK-Agent metadata. Default active to true and allowedModeBehaviors to plan and edit. Add autonomous only when the user explicitly wants autonomous usage.",
    "Use this kk-agent.skill.json pattern when metadata is needed:",
    "```json\n{\n  \"active\": true,\n  \"recommendedToolIds\": [\"skill\", \"user-interaction\"],\n  \"recommendedMcpIds\": [],\n  \"allowedModeBehaviors\": [\"plan\", \"edit\"]\n}\n```",
    "Add recommendedToolIds and recommendedMcpIds only when they materially help the workflow and you know the correct ids.",
    "Keep the bundle minimal. Do not add extra files unless the workflow genuinely needs bundled references or assets.",
    "Use ask_user for targeted follow-up questions when examples, policy choices, or missing constraints are needed to make the skill correct. When helpful, ask as multiple choice so the user can answer quickly.",
    "Before calling CreateSkill, make sure the content can be written directly as a valid KK-Agent bundle and would pass the loader.",
    "If the user wants to use the skill immediately after creation, call Skill with the created id.",
  ].join("\n"),
  active: true,
  allowedModeBehaviors: ["plan", "edit"],
  recommendedToolIds: ["skill", "user-interaction"],
  recommendedMcpIds: [],
};

let skillsRootDir = getStateDirPath("skills");
let cachedSkills: SkillDefinition[] = [];

function normalizeModeBehaviors(modeBehaviors?: ModeBehavior[]): ModeBehavior[] {
  const normalized = [...new Set((modeBehaviors ?? DEFAULT_ALLOWED_MODE_BEHAVIORS).filter((mode): mode is ModeBehavior =>
    typeof mode === "string" && isModeBehavior(mode)
  ))];
  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_MODE_BEHAVIORS];
}

function sanitizeToolIds(toolIds: string[] = []): string[] {
  return filterToKnownIds(toolIds, getKnownSystemMcpIds());
}

function sanitizeMcpIds(mcpIds: string[] = []): string[] {
  return filterToKnownIds(mcpIds, getKnownMcpIds());
}

function normalizeSkillMetadata(metadata: Partial<SkillMetadata>): SkillMetadata {
  return {
    active: metadata.active ?? true,
    source: "custom",
    recommendedToolIds: sanitizeToolIds(metadata.recommendedToolIds),
    recommendedMcpIds: sanitizeMcpIds(metadata.recommendedMcpIds),
    allowedModeBehaviors: normalizeModeBehaviors(metadata.allowedModeBehaviors),
  };
}

async function ensureSkillsRoot(): Promise<void> {
  await mkdir(skillsRootDir, { recursive: true });
}

async function reloadSkills(): Promise<void> {
  await ensureSkillsRoot();
  const entries = await readdir(skillsRootDir, { withFileTypes: true });
  const resolvedSkills: SkillDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillId = entry.name;
    try {
      const loaded = await loadSkillFromPath(skillsRootDir, skillId);
      resolvedSkills.push({
        id: skillId,
        path: loaded.resolvedPath,
        name: loaded.name,
        description: loaded.description,
        instruction: loaded.instruction,
        ...normalizeSkillMetadata(loaded.metadata),
      });
    } catch (error) {
      console.warn(`[skills] Skipping invalid skill "${skillId}": ${(error as Error).message}`);
    }
  }

  cachedSkills = resolvedSkills.sort((left, right) => left.name.localeCompare(right.name));
}

function buildUniqueId(name: string): string {
  const base = createSlugId(name) || "skill";
  const existing = new Set(cachedSkills.map((skill) => skill.id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function getSkillOrThrow(id: string): SkillDefinition {
  const skill = cachedSkills.find((entry) => entry.id === id);
  if (!skill) throw new Error(`Skill "${id}" not found`);
  return skill;
}

function buildSkillMetadataFromBody(body: {
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModeBehaviors?: ModeBehavior[];
}): SkillMetadata {
  return normalizeSkillMetadata({
    active: body.active,
    recommendedToolIds: body.recommendedToolIds,
    recommendedMcpIds: body.recommendedMcpIds,
    allowedModeBehaviors: body.allowedModeBehaviors,
  });
}

async function writeSkillBundleForId(
  id: string,
  body: {
    name: string;
    description: string;
    instruction: string;
    metadata: SkillMetadata;
  },
): Promise<void> {
  await writeSkillBundle(join(skillsRootDir, id), body);
}

async function ensureDefaultSkills(): Promise<void> {
  const skillDir = join(skillsRootDir, DEFAULT_CREATE_SKILL_ID);
  if (existsSync(skillDir)) return;

  await writeSkillBundleForId(DEFAULT_CREATE_SKILL_ID, {
    name: DEFAULT_CREATE_SKILL_BODY.name,
    description: DEFAULT_CREATE_SKILL_BODY.description,
    instruction: DEFAULT_CREATE_SKILL_BODY.instruction,
    metadata: buildSkillMetadataFromBody(DEFAULT_CREATE_SKILL_BODY),
  });
}

export async function initSkillService(nextRootDir?: string): Promise<void> {
  skillsRootDir = resolve(nextRootDir ?? getStateDirPath("skills"));
  await ensureSkillsRoot();
  await ensureDefaultSkills();
  await reloadSkills();
}

export function getSkillsRootDir(): string {
  return skillsRootDir;
}

export async function refreshSkills(): Promise<void> {
  await reloadSkills();
}

export function listSkills(): SkillDefinition[] {
  return [...cachedSkills];
}

export function getSkillById(id: string): SkillDefinition | undefined {
  return cachedSkills.find((skill) => skill.id === id);
}

export function getKnownSkillIds(options: { activeOnly?: boolean; behavior?: ModeBehavior } = {}): string[] {
  return cachedSkills
    .filter((skill) => {
      if (options.activeOnly && !skill.active) return false;
      if (options.behavior && !skill.allowedModeBehaviors.includes(options.behavior)) return false;
      return true;
    })
    .map((skill) => skill.id);
}

export function buildSkillCatalogSection(skills: SkillDefinition[]): string {
  return buildSkillsCatalogSection(skills);
}

export function buildActiveSkillCatalogSection(
  activeSkillIds: string[],
  behavior?: ModeBehavior,
): string {
  const activeSkills = activeSkillIds
    .map((id) => cachedSkills.find((skill) => skill.id === id))
    .filter((skill): skill is SkillDefinition => Boolean(skill))
    .filter((skill) => skill.active)
    .filter((skill) => !behavior || skill.allowedModeBehaviors.includes(behavior));

  return buildSkillCatalogSection(activeSkills);
}

export async function createSkill(body: CreateSkillBody): Promise<SkillDefinition> {
  const name = body.name?.trim();
  const description = body.description?.trim();
  const instruction = body.instruction?.trim();
  if (!name) throw new Error("name is required");
  if (!description) throw new Error("description is required");
  if (!instruction) throw new Error("instruction is required");

  const id = buildUniqueId(name);
  await writeSkillBundleForId(id, {
    name,
    description,
    instruction,
    metadata: buildSkillMetadataFromBody(body),
  });
  await reloadSkills();
  return getSkillOrThrow(id);
}

export async function updateSkill(id: string, body: UpdateSkillBody): Promise<SkillDefinition> {
  const current = getSkillOrThrow(id);
  await writeSkillBundleForId(id, {
    name: body.name?.trim() || current.name,
    description: body.description?.trim() || current.description,
    instruction: body.instruction?.trim() || current.instruction,
    metadata: normalizeSkillMetadata({
      active: body.active ?? current.active,
      recommendedToolIds: body.recommendedToolIds ?? current.recommendedToolIds,
      recommendedMcpIds: body.recommendedMcpIds ?? current.recommendedMcpIds,
      allowedModeBehaviors: body.allowedModeBehaviors ?? current.allowedModeBehaviors,
    }),
  });
  await reloadSkills();
  return getSkillOrThrow(id);
}

export async function deleteSkill(id: string): Promise<void> {
  const skillDir = join(skillsRootDir, basename(id));
  await rm(skillDir, { recursive: true, force: true });
  await reloadSkills();
  if (cachedSkills.some((skill) => skill.id === id)) {
    throw new Error(`Skill "${id}" could not be deleted`);
  }
}
