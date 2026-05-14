import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createSlugId, filterToKnownIds } from "../lib/ids.js";
import { getStateDirPath } from "../lib/state.js";
import { getKnownMcpIds } from "../mcp/service.js";
import { getKnownSystemMcpIds } from "../tools/service.js";
import type { CreateSkillBody, ImportSkillResult, SkillDefinition, UpdateSkillBody, UpdateSkillLinksBody } from "./types.js";
import { loadSkillFromPath, normalizeSkillLinks, resolveSkillBundleRoot, writeSkillBundle, writeSkillLinks } from "./lib/loader.js";
import { buildSkillsCatalogSection } from "./lib/xml.js";
import { createLogger } from "../../lib/logger.js";
import { getErrorMessage } from "../../lib/error.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { setCreateSkillHandler } from "../tools/lib/skill/runtime.js";
import { DEFAULT_CREATE_SKILL_BODY, DEFAULT_CREATE_SKILL_ID } from "./lib/default-create-skill.js";

const logger = createLogger("skills");

type ImportedSkillFile = {
  path: string;
  content: Buffer;
};

let skillsRootDir = getStateDirPath("skills");
let cachedSkills: SkillDefinition[] = [];

function sanitizeToolIds(toolIds: string[] = []): string[] {
  return filterToKnownIds(toolIds, getKnownSystemMcpIds());
}

function sanitizeMcpIds(mcpIds: string[] = []): string[] {
  return filterToKnownIds(mcpIds, getKnownMcpIds());
}

function sanitizeLinks(body: UpdateSkillLinksBody): Pick<SkillDefinition, "linkedToolIds" | "linkedMcpIds"> {
  const normalized = normalizeSkillLinks({
    linkedToolIds: body.toolIds,
    linkedMcpIds: body.mcpIds,
  });
  return {
    linkedToolIds: sanitizeToolIds(normalized.linkedToolIds),
    linkedMcpIds: sanitizeMcpIds(normalized.linkedMcpIds),
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
        source: "custom",
        linkedToolIds: sanitizeToolIds(loaded.links.linkedToolIds),
        linkedMcpIds: sanitizeMcpIds(loaded.links.linkedMcpIds),
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

async function writeSkillBundleForId(
  id: string,
  body: {
    name: string;
    description: string;
    instruction: string;
    linkedToolIds?: string[];
    linkedMcpIds?: string[];
  },
): Promise<void> {
  await writeSkillBundle(join(skillsRootDir, id), {
    name: body.name,
    description: body.description,
    instruction: body.instruction,
    links: {
      linkedToolIds: sanitizeToolIds(body.linkedToolIds),
      linkedMcpIds: sanitizeMcpIds(body.linkedMcpIds),
    },
  });
}

async function ensureDefaultSkills(): Promise<void> {
  const entries = await readdir(skillsRootDir, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isDirectory() && entry.name === DEFAULT_CREATE_SKILL_ID)) return;

  await writeSkillBundleForId(DEFAULT_CREATE_SKILL_ID, {
    name: DEFAULT_CREATE_SKILL_BODY.name,
    description: DEFAULT_CREATE_SKILL_BODY.description,
    instruction: DEFAULT_CREATE_SKILL_BODY.instruction,
    linkedToolIds: [],
    linkedMcpIds: [],
  });
}

async function writeImportedFiles(tempRoot: string, files: ImportedSkillFile[]): Promise<void> {
  for (const file of files) {
    const targetPath = resolve(tempRoot, file.path);
    const parentDir = resolve(targetPath, "..");
    if (!targetPath.startsWith(tempRoot)) {
      throw new ValidationError(`Invalid skill file path "${file.path}".`);
    }
    await mkdir(parentDir, { recursive: true });
    await writeFile(targetPath, file.content);
  }
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

export function getKnownSkillIds(): string[] {
  return cachedSkills.map((skill) => skill.id);
}

export function buildActiveSkillCatalogSection(activeSkillIds: string[]): string {
  const activeSkills = activeSkillIds
    .map((id) => cachedSkills.find((skill) => skill.id === id))
    .filter((skill): skill is SkillDefinition => Boolean(skill));

  return buildSkillsCatalogSection(activeSkills);
}

export async function createSkill(body: CreateSkillBody): Promise<SkillDefinition> {
  const name = body.name?.trim();
  const description = body.description?.trim();
  const instruction = body.instruction?.trim();
  if (!name) throw new ValidationError("name is required");
  if (!description) throw new ValidationError("description is required");
  if (!instruction) throw new ValidationError("instruction is required");

  const id = buildUniqueId(name);
  await writeSkillBundleForId(id, { name, description, instruction, linkedToolIds: [], linkedMcpIds: [] });
  await reloadSkills();
  return getSkillOrThrow(id);
}

export async function updateSkill(id: string, body: UpdateSkillBody): Promise<SkillDefinition> {
  const current = getSkillOrThrow(id);
  await writeSkillBundleForId(id, {
    name: body.name?.trim() || current.name,
    description: body.description?.trim() || current.description,
    instruction: body.instruction?.trim() || current.instruction,
    linkedToolIds: current.linkedToolIds,
    linkedMcpIds: current.linkedMcpIds,
  });
  await reloadSkills();
  return getSkillOrThrow(id);
}

export async function updateSkillLinks(id: string, body: UpdateSkillLinksBody): Promise<SkillDefinition> {
  getSkillOrThrow(id);
  const links = sanitizeLinks(body);
  await writeSkillLinks(join(skillsRootDir, id), links);
  await reloadSkills();
  return getSkillOrThrow(id);
}

export async function importSkill(files: ImportedSkillFile[]): Promise<ImportSkillResult> {
  if (files.length === 0) throw new ValidationError("No skill files uploaded.");

  const tempRoot = await mkdtemp(join(tmpdir(), "kk-agent-skill-import-"));
  try {
    await writeImportedFiles(tempRoot, files);
    const bundleRoot = await resolveSkillBundleRoot(tempRoot);
    const loaded = await loadSkillFromPath(tempRoot, ".");
    const id = buildUniqueId(loaded.name);
    const targetDir = join(skillsRootDir, id);
    await cp(bundleRoot, targetDir, { recursive: true, errorOnExist: true, force: false });
    await writeSkillLinks(targetDir, { linkedToolIds: [], linkedMcpIds: [] });
    await reloadSkills();
    return { skill: getSkillOrThrow(id) };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const skillDir = join(skillsRootDir, basename(id));
  await rm(skillDir, { recursive: true, force: true });
  await reloadSkills();
  if (cachedSkills.some((skill) => skill.id === id)) {
    throw new NotFoundError("Skill", id);
  }
}
