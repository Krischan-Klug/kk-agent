import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import type { SkillDefinition, SkillDiagnostic, SkillSource } from "../types.js";

const SKILL_FILE = "SKILL.md";
const MAX_RESOURCE_FILES = 2_000;
const MAX_RESOURCE_DIRECTORIES = 2_000;
const MAX_RESOURCE_DEPTH = 8;
const STANDARD_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface LoadedSkill extends SkillDefinition {
  instruction: string;
}

type LoadSkillOptions = {
  requireMatchingDirectoryName?: boolean;
};

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const rel = relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function parseFrontmatter(rawInput: string): { frontmatter: Record<string, unknown>; body: string } {
  const raw = rawInput.replace(/^\uFEFF/, "");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new SkillValidationError("SKILL.md must start with YAML frontmatter.");

  let parsed: unknown;
  try {
    parsed = YAML.parse(match[1]!);
  } catch {
    throw new SkillValidationError("SKILL.md frontmatter must contain valid YAML.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SkillValidationError("SKILL.md frontmatter must be a YAML mapping.");
  }

  return {
    frontmatter: parsed as Record<string, unknown>,
    body: match[2]!.trim(),
  };
}

function readOptionalString(
  frontmatter: Record<string, unknown>,
  key: string,
  maxLength?: number,
): string | undefined {
  const value = frontmatter[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SkillValidationError(`Skill frontmatter field "${key}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (maxLength && normalized.length > maxLength) {
    throw new SkillValidationError(`Skill frontmatter field "${key}" must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function readMetadata(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SkillValidationError("Skill frontmatter field \"metadata\" must be a string-to-string mapping.");
  }
  const entries = Object.entries(value);
  if (entries.some(([, entry]) => typeof entry !== "string")) {
    throw new SkillValidationError("Skill frontmatter field \"metadata\" must contain only string values.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

async function listResources(rootDir: string): Promise<{ resources: string[]; diagnostics: SkillDiagnostic[] }> {
  const resources: string[] = [];
  const diagnostics: SkillDiagnostic[] = [];
  let visitedDirectories = 0;
  let listingCapped = false;

  async function walk(directory: string, depth: number): Promise<void> {
    if (resources.length >= MAX_RESOURCE_FILES || visitedDirectories >= MAX_RESOURCE_DIRECTORIES) {
      listingCapped = true;
      return;
    }
    visitedDirectories += 1;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (resources.length >= MAX_RESOURCE_FILES || visitedDirectories >= MAX_RESOURCE_DIRECTORIES) {
        listingCapped = true;
        return;
      }
      const absolutePath = resolve(directory, entry.name);
      if (!isWithinRoot(rootDir, absolutePath)) continue;
      const relativePath = relative(rootDir, absolutePath).replaceAll("\\", "/");
      if (relativePath === SKILL_FILE) continue;
      if (entry.isSymbolicLink()) {
        diagnostics.push({ level: "warning", message: `Skipped symbolic-link resource: ${relativePath}` });
        continue;
      }
      if (entry.isDirectory()) {
        if (depth >= MAX_RESOURCE_DEPTH) {
          listingCapped = true;
          continue;
        }
        await walk(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        resources.push(relativePath);
      }
    }
  }

  await walk(rootDir, 0);
  if (listingCapped) {
    diagnostics.push({
      level: "warning",
      message: `Resource listing was bounded to ${MAX_RESOURCE_FILES} files, ${MAX_RESOURCE_DIRECTORIES} directories, and depth ${MAX_RESOURCE_DEPTH}.`,
    });
  }
  return { resources: resources.sort(), diagnostics };
}

export async function loadSkillDirectory(
  skillDir: string,
  source: SkillSource,
  mutable: boolean,
  options: LoadSkillOptions = {},
): Promise<LoadedSkill> {
  const rootPath = resolve(skillDir);
  const path = join(rootPath, SKILL_FILE);
  const info = await lstat(path);
  if (!info.isFile()) throw new SkillValidationError(`${SKILL_FILE} must be a regular file.`);

  const raw = await readFile(path, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = readOptionalString(frontmatter, "name", 64);
  const description = readOptionalString(frontmatter, "description", 1024);
  if (!name) throw new SkillValidationError("Skill frontmatter requires a non-empty name.");
  if (!description) throw new SkillValidationError("Skill frontmatter requires a non-empty description.");
  if (!STANDARD_NAME_PATTERN.test(name)) {
    throw new SkillValidationError("Skill name must contain only lowercase letters, numbers, and single hyphens.");
  }
  if (options.requireMatchingDirectoryName !== false && basename(rootPath) !== name) {
    throw new SkillValidationError(`Skill name "${name}" must match its parent directory name "${basename(rootPath)}".`);
  }

  const license = readOptionalString(frontmatter, "license");
  const compatibility = readOptionalString(frontmatter, "compatibility", 500);
  const allowedTools = readOptionalString(frontmatter, "allowed-tools");
  const metadata = readMetadata(frontmatter.metadata);
  const { resources, diagnostics } = await listResources(rootPath);

  return {
    id: name,
    name,
    description,
    path,
    rootPath,
    source,
    mutable,
    license,
    compatibility,
    metadata,
    allowedTools,
    resources,
    diagnostics,
    instruction: body,
  };
}

export async function resolveImportedSkillRoot(uploadRoot: string): Promise<string> {
  const resolvedUploadRoot = resolve(uploadRoot);
  const matches: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (!isWithinRoot(resolvedUploadRoot, absolutePath) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile() && entry.name === SKILL_FILE) matches.push(absolutePath);
    }
  }

  await walk(resolvedUploadRoot);
  if (matches.length !== 1) {
    throw new SkillValidationError(`Expected exactly one ${SKILL_FILE}, found ${matches.length}.`);
  }
  return resolve(matches[0]!, "..");
}
