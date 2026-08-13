import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { getStateDirPath } from "../lib/state.js";
import type { ImportSkillResult, SkillDefinition, SkillSource } from "./types.js";
import { loadSkillDirectory, resolveImportedSkillRoot, type LoadedSkill } from "./lib/loader.js";
import { buildSkillContextXml, buildSkillsCatalogSection } from "./lib/xml.js";
import { createLogger } from "../../lib/logger.js";
import { getErrorMessage } from "../../lib/error.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";

const logger = createLogger("skills");

type ImportedSkillFile = {
  path: string;
  content: Buffer;
};

interface DiscoveryRoot {
  path: string;
  source: SkillSource;
  mutable: boolean;
}

let managedSkillsRoot = resolve(getStateDirPath("agent-skills"));
let workspaceRoot = resolve(process.cwd());
let cachedSkills: LoadedSkill[] = [];

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const rel = relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function toDefinition(skill: LoadedSkill): SkillDefinition {
  const { instruction: _instruction, ...definition } = skill;
  return definition;
}

function findRepositoryRoot(startPath: string): string | undefined {
  let current = resolve(startPath);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function getWorkspaceDiscoveryRoots(): DiscoveryRoot[] {
  const repositoryRoot = findRepositoryRoot(workspaceRoot);
  const roots: DiscoveryRoot[] = [];
  let current = workspaceRoot;

  while (true) {
    roots.push({ path: join(current, ".agents", "skills"), source: "workspace", mutable: false });
    if (!repositoryRoot || current === repositoryRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

function getDiscoveryRoots(): DiscoveryRoot[] {
  const roots = [
    ...getWorkspaceDiscoveryRoots(),
    { path: managedSkillsRoot, source: "managed" as const, mutable: true },
    { path: join(homedir(), ".agents", "skills"), source: "user" as const, mutable: false },
  ];
  const seen = new Set<string>();
  return roots.filter((entry) => {
    const key = resolve(entry.path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadDiscoveryRoot(root: DiscoveryRoot): Promise<LoadedSkill[]> {
  const entries = await readdir(root.path, { withFileTypes: true }).catch(() => []);
  const skills: LoadedSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillDir = join(root.path, entry.name);
    try {
      if (entry.isSymbolicLink() && !(await stat(skillDir)).isDirectory()) continue;
      skills.push(await loadSkillDirectory(skillDir, root.source, root.mutable));
    } catch (error) {
      logger.warn(`Skipping invalid skill at "${skillDir}": ${getErrorMessage(error)}`);
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function reloadSkills(): Promise<void> {
  await mkdir(managedSkillsRoot, { recursive: true });
  const resolved: LoadedSkill[] = [];
  const claimedNames = new Map<string, LoadedSkill>();

  for (const root of getDiscoveryRoots()) {
    for (const skill of await loadDiscoveryRoot(root)) {
      const winner = claimedNames.get(skill.name);
      if (winner) {
        logger.warn(`Skill "${skill.name}" at "${skill.rootPath}" is shadowed by "${winner.rootPath}".`);
        continue;
      }
      claimedNames.set(skill.name, skill);
      resolved.push(skill);
    }
  }

  cachedSkills = resolved.sort((left, right) => left.name.localeCompare(right.name));
}

function getSkillOrThrow(id: string): LoadedSkill {
  const skill = cachedSkills.find((entry) => entry.id === id);
  if (!skill) throw new NotFoundError("Skill", id);
  return skill;
}

async function writeImportedFiles(tempRoot: string, files: ImportedSkillFile[]): Promise<void> {
  for (const file of files) {
    const normalizedPath = file.path.replaceAll("\\", "/").replace(/^\/+/, "");
    const targetPath = resolve(tempRoot, normalizedPath);
    if (!isWithinRoot(tempRoot, targetPath)) {
      throw new ValidationError(`Invalid skill file path "${file.path}".`);
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content);
  }
}

export async function initSkillService(nextManagedRoot?: string, nextWorkspaceRoot?: string): Promise<void> {
  managedSkillsRoot = resolve(nextManagedRoot ?? getStateDirPath("agent-skills"));
  workspaceRoot = resolve(nextWorkspaceRoot ?? process.cwd());
  await reloadSkills();
}

export async function refreshSkills(): Promise<void> {
  await reloadSkills();
}

export function listSkills(): SkillDefinition[] {
  return cachedSkills.map(toDefinition);
}

export function getKnownSkillIds(): string[] {
  return cachedSkills.map((skill) => skill.id);
}

export function buildActiveSkillCatalogSection(activeSkillIds: string[]): string {
  const active = new Set(activeSkillIds);
  return buildSkillsCatalogSection(cachedSkills.filter((skill) => active.has(skill.id)).map(toDefinition));
}

export function buildLoadedSkillContexts(
  loadedSkillIds: string[],
  activeSkillIds: string[],
): { loadedSkillIds: string[]; loadedSkillContexts: string[] } {
  const active = new Set(activeSkillIds);
  const loaded = loadedSkillIds
    .filter((id) => active.has(id))
    .map((id) => cachedSkills.find((skill) => skill.id === id))
    .filter((skill): skill is LoadedSkill => Boolean(skill));
  return {
    loadedSkillIds: loaded.map((skill) => skill.id),
    loadedSkillContexts: loaded.map((skill) => buildSkillContextXml(toDefinition(skill), skill.instruction)),
  };
}

export function loadSkillContext(id: string): { skill: SkillDefinition; context: string } {
  const skill = getSkillOrThrow(id);
  return {
    skill: toDefinition(skill),
    context: buildSkillContextXml(toDefinition(skill), skill.instruction),
  };
}

export async function importSkill(files: ImportedSkillFile[]): Promise<ImportSkillResult> {
  if (files.length === 0) throw new ValidationError("No skill files uploaded.");

  const tempRoot = await mkdtemp(join(tmpdir(), "kk-agent-skill-import-"));
  try {
    await writeImportedFiles(tempRoot, files);
    const bundleRoot = await resolveImportedSkillRoot(tempRoot);
    const loaded = await loadSkillDirectory(bundleRoot, "managed", true);
    if (cachedSkills.some((skill) => skill.name === loaded.name)) {
      throw new ConflictError(`Skill "${loaded.name}" already exists.`);
    }
    const targetDir = join(managedSkillsRoot, loaded.name);
    if (existsSync(targetDir)) throw new ConflictError(`Managed skill "${loaded.name}" already exists.`);
    await cp(bundleRoot, targetDir, { recursive: true, errorOnExist: true, force: false });
    await reloadSkills();
    const installed = getSkillOrThrow(loaded.name);
    return { skill: toDefinition(installed) };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const skill = getSkillOrThrow(id);
  if (!skill.mutable || skill.source !== "managed" || !isWithinRoot(managedSkillsRoot, skill.rootPath)) {
    throw new ValidationError(`Skill "${id}" is read-only because it is not managed by KK-Agent.`);
  }
  await rm(skill.rootPath, { recursive: true, force: true });
  await reloadSkills();
}
