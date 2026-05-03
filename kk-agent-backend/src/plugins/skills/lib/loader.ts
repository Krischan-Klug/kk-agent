import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";

const KK_AGENT_FILE = join("agents", "kk-agent.json");

interface SkillLinks {
  linkedToolIds: string[];
  linkedMcpIds: string[];
}

interface LoadedSkillBundle {
  name: string;
  description: string;
  instruction: string;
  skillFilePath: string;
  resolvedPath: string;
  links: SkillLinks;
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

function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function normalizeSkillLinks(links?: Partial<{ linkedToolIds: string[]; linkedMcpIds: string[] }>): SkillLinks {
  return {
    linkedToolIds: normalizeIds(links?.linkedToolIds),
    linkedMcpIds: normalizeIds(links?.linkedMcpIds),
  };
}

async function readSkillLinks(skillDir: string): Promise<SkillLinks> {
  try {
    const raw = await readFile(join(skillDir, KK_AGENT_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { toolIds?: string[]; mcpIds?: string[] } | null;
    return normalizeSkillLinks({
      linkedToolIds: parsed?.toolIds,
      linkedMcpIds: parsed?.mcpIds,
    });
  } catch {
    return normalizeSkillLinks();
  }
}

export async function writeSkillLinks(skillDir: string, links: SkillLinks): Promise<void> {
  await mkdir(join(skillDir, "agents"), { recursive: true });
  await writeFile(
    join(skillDir, KK_AGENT_FILE),
    JSON.stringify({
      toolIds: links.linkedToolIds,
      mcpIds: links.linkedMcpIds,
    }, null, 2),
    "utf-8",
  );
}

export async function writeSkillBundle(
  skillDir: string,
  body: {
    name: string;
    description: string;
    instruction: string;
    links?: SkillLinks;
  },
): Promise<void> {
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), buildSkillMarkdown(body.name, body.description, body.instruction), "utf-8");
  await writeSkillLinks(skillDir, normalizeSkillLinks(body.links));
}

export async function resolveSkillBundleRoot(rootDir: string): Promise<string> {
  const skillFiles = await walkForSkillFiles(rootDir);
  if (skillFiles.length !== 1) {
    throw new Error(`Expected exactly one SKILL.md, found ${skillFiles.length}.`);
  }
  return resolve(skillFiles[0]!, "..");
}

export async function loadSkillFromPath(rootDir: string, skillPath: string): Promise<LoadedSkillBundle> {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(resolvedRoot, skillPath);

  if (!isWithinRoot(resolvedRoot, resolvedPath)) {
    throw new Error(`Skill path must stay within root directory "${resolvedRoot}".`);
  }

  const bundleRoot = await resolveSkillBundleRoot(resolvedPath);
  const skillFilePath = join(bundleRoot, "SKILL.md");
  const raw = await readFile(skillFilePath, "utf-8");
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
    skillFilePath,
    resolvedPath: bundleRoot,
    links: await readSkillLinks(bundleRoot),
  };
}
