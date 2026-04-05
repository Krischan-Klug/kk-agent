import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createSlugId } from "../lib/ids.js";
import { getStateDirPath } from "../lib/state.js";
import { getKnownMcpIds } from "../mcp/service.js";
import { getKnownSystemMcpIds } from "../tools/service.js";
import type { ChatMode } from "../agent/types.js";
import type { CreateSkillBody, SkillDefinition, SkillMetadata, UpdateSkillBody } from "./types.js";
import { loadSkillFromPath, writeSkillBundle } from "./lib/loader.js";
import { buildSkillsCatalogSection } from "./lib/xml.js";

const DEFAULT_ALLOWED_MODES: ChatMode[] = ["plan", "edit"];

let skillsRootDir = getStateDirPath("skills");
let cachedSkills: SkillDefinition[] = [];

function normalizeModes(modes?: ChatMode[]): ChatMode[] {
  const normalized = [...new Set((modes ?? DEFAULT_ALLOWED_MODES).filter((mode): mode is ChatMode => mode === "plan" || mode === "edit"))];
  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_MODES];
}

function sanitizeToolIds(toolIds: string[] = []): string[] {
  const known = new Set(getKnownSystemMcpIds());
  return [...new Set(toolIds)].filter((id) => known.has(id));
}

function sanitizeMcpIds(mcpIds: string[] = []): string[] {
  const known = new Set(getKnownMcpIds());
  return [...new Set(mcpIds)].filter((id) => known.has(id));
}

function normalizeSkillMetadata(metadata: Partial<SkillMetadata>): SkillMetadata {
  return {
    active: metadata.active ?? true,
    source: "custom",
    recommendedToolIds: sanitizeToolIds(metadata.recommendedToolIds),
    recommendedMcpIds: sanitizeMcpIds(metadata.recommendedMcpIds),
    allowedModes: normalizeModes(metadata.allowedModes),
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
  allowedModes?: ChatMode[];
}): SkillMetadata {
  return normalizeSkillMetadata({
    active: body.active,
    recommendedToolIds: body.recommendedToolIds,
    recommendedMcpIds: body.recommendedMcpIds,
    allowedModes: body.allowedModes,
  });
}

export async function initSkillService(nextRootDir?: string): Promise<void> {
  skillsRootDir = resolve(nextRootDir ?? getStateDirPath("skills"));
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

export function getKnownSkillIds(options: { activeOnly?: boolean; mode?: ChatMode } = {}): string[] {
  return cachedSkills
    .filter((skill) => {
      if (options.activeOnly && !skill.active) return false;
      if (options.mode && !skill.allowedModes.includes(options.mode)) return false;
      return true;
    })
    .map((skill) => skill.id);
}

export function buildSkillCatalogSection(skills: SkillDefinition[]): string {
  return buildSkillsCatalogSection(skills);
}

export function buildActiveSkillCatalogSection(
  activeSkillIds: string[],
  mode?: ChatMode,
): string {
  const activeSkills = activeSkillIds
    .map((id) => cachedSkills.find((skill) => skill.id === id))
    .filter((skill): skill is SkillDefinition => Boolean(skill))
    .filter((skill) => skill.active)
    .filter((skill) => !mode || skill.allowedModes.includes(mode));

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
  const skillDir = join(skillsRootDir, id);
  await writeSkillBundle(skillDir, {
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
  const skillDir = join(skillsRootDir, id);
  await writeSkillBundle(skillDir, {
    name: body.name?.trim() || current.name,
    description: body.description?.trim() || current.description,
    instruction: body.instruction?.trim() || current.instruction,
    metadata: normalizeSkillMetadata({
      active: body.active ?? current.active,
      recommendedToolIds: body.recommendedToolIds ?? current.recommendedToolIds,
      recommendedMcpIds: body.recommendedMcpIds ?? current.recommendedMcpIds,
      allowedModes: body.allowedModes ?? current.allowedModes,
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
