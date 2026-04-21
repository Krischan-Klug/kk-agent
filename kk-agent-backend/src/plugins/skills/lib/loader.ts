import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve, relative, sep, join } from "node:path";
import YAML from "yaml";
import type { ChatMode } from "../../agent/types.js";
import type { SkillMetadata } from "../types.js";

const METADATA_FILE = "kk-agent.skill.json";
const DEFAULT_ALLOWED_MODES: ChatMode[] = ["plan", "edit"];

export interface LoadedSkillMetadata {
  name: string;
  description: string;
  instruction: string;
  skillFilePath: string;
  resolvedPath: string;
  metadata: SkillMetadata;
}

interface StoredSkillMetadata {
  active?: boolean;
  recommendedToolIds?: string[];
  recommendedMcpIds?: string[];
  allowedModes?: ChatMode[];
}

function normalizeModes(modes?: ChatMode[]): ChatMode[] {
  const normalized = [...new Set((modes ?? DEFAULT_ALLOWED_MODES).filter((mode): mode is ChatMode =>
    mode === "plan" || mode === "edit" || mode === "autonomous"
  ))];
  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_MODES];
}

function isWithinRoot(rootDir: string, targetPath: string): boolean {
  const rel = relative(rootDir, targetPath);
  return (!rel.startsWith("..") && !rel.includes(`..${sep}`)) || targetPath === rootDir;
}

async function walkForSkillFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkForSkillFiles(fullPath));
      continue;
    }
    if (entry.isFile() && basename(entry.name).toLowerCase() === "skill.md") {
      files.push(fullPath);
    }
  }

  return files;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md must start with YAML frontmatter.");
  const [, frontmatterRaw, bodyRaw] = match;
  const frontmatter = YAML.parse(frontmatterRaw) as Record<string, unknown> | null;
  return {
    frontmatter: frontmatter ?? {},
    body: bodyRaw.trim(),
  };
}

function buildSkillMarkdown(name: string, description: string, instruction: string): string {
  const frontmatter = YAML.stringify({ name, description }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${instruction.trim()}\n`;
}

function normalizeMetadata(metadata?: StoredSkillMetadata): SkillMetadata {
  return {
    active: metadata?.active ?? true,
    source: "custom",
    recommendedToolIds: [...new Set(metadata?.recommendedToolIds ?? [])],
    recommendedMcpIds: [...new Set(metadata?.recommendedMcpIds ?? [])],
    allowedModes: normalizeModes(metadata?.allowedModes),
  };
}

export async function readSkillMetadataFile(skillDir: string): Promise<SkillMetadata> {
  const metadataPath = join(skillDir, METADATA_FILE);
  try {
    const raw = await readFile(metadataPath, "utf-8");
    return normalizeMetadata(JSON.parse(raw) as StoredSkillMetadata);
  } catch {
    return normalizeMetadata();
  }
}

export async function writeSkillBundle(
  skillDir: string,
  body: {
    name: string;
    description: string;
    instruction: string;
    metadata: SkillMetadata;
  },
): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), buildSkillMarkdown(body.name, body.description, body.instruction), "utf-8");
  await writeFile(
    join(skillDir, METADATA_FILE),
    JSON.stringify({
      active: body.metadata.active,
      recommendedToolIds: body.metadata.recommendedToolIds,
      recommendedMcpIds: body.metadata.recommendedMcpIds,
      allowedModes: body.metadata.allowedModes,
    }, null, 2),
    "utf-8",
  );
}

export async function loadSkillFromPath(rootDir: string, skillPath: string): Promise<LoadedSkillMetadata> {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(resolvedRoot, skillPath);

  if (!isWithinRoot(resolvedRoot, resolvedPath)) {
    throw new Error(`Skill path must stay within root directory "${resolvedRoot}".`);
  }

  const skillFiles = await walkForSkillFiles(resolvedPath);
  if (skillFiles.length !== 1) {
    throw new Error(`Expected exactly one SKILL.md in "${resolvedPath}", found ${skillFiles.length}.`);
  }

  const raw = await readFile(skillFiles[0]!, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
  const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";

  if (!name) throw new Error("Skill frontmatter requires a non-empty name.");
  if (!description) throw new Error("Skill frontmatter requires a non-empty description.");
  if (!body) throw new Error("Skill instruction body must not be empty.");

  return {
    name,
    description,
    instruction: body,
    skillFilePath: skillFiles[0]!,
    resolvedPath,
    metadata: await readSkillMetadataFile(resolvedPath),
  };
}
