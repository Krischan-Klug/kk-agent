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
import { createLogger } from "../../lib/logger.js";
import { getErrorMessage } from "../../lib/error.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { setCreateSkillHandler } from "../tools/lib/skill/runtime.js";
import { DEFAULT_CREATE_SKILL_BODY, DEFAULT_CREATE_SKILL_ID } from "./lib/default-create-skill.js";
import { normalizeSkillMetadata as normalizeSkillMetadataBase } from "./lib/metadata.js";

const logger = createLogger("skills");

let skillsRootDir = getStateDirPath("skills");
let cachedSkills: SkillDefinition[] = [];

function sanitizeToolIds(toolIds: string[] = []): string[] {
  return filterToKnownIds(toolIds, getKnownSystemMcpIds());
}

function sanitizeMcpIds(mcpIds: string[] = []): string[] {
  return filterToKnownIds(mcpIds, getKnownMcpIds());
}

function normalizeSkillMetadata(metadata: Partial<SkillMetadata>): SkillMetadata {
  return normalizeSkillMetadataBase(metadata, {
    sanitizeToolIds,
    sanitizeMcpIds,
  });
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
      logger.warn(`Skipping invalid skill "${skillId}": ${getErrorMessage(error)}`);
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
  if (!skill) throw new NotFoundError("Skill", id);
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
  setCreateSkillHandler(createSkill);
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
  if (!name) throw new ValidationError("name is required");
  if (!description) throw new ValidationError("description is required");
  if (!instruction) throw new ValidationError("instruction is required");

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
    throw new NotFoundError("Skill", id);
  }
}
