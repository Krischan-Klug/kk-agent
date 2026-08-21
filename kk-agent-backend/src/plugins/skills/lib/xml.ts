import { escapeXml, toCData } from "../../lib/xml.js";
import type { SkillDefinition } from "../types.js";

const MAX_CATALOG_CHARS = 2_500;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_RESOURCE_ENTRIES = 200;
const CATALOG_NOTICE_RESERVE_CHARS = 160;

function buildSkillEntry(skill: SkillDefinition, description: string): string {
  return [
    "  <skill>",
    `    <name>${escapeXml(skill.name)}</name>`,
    `    <description>${escapeXml(description)}</description>`,
    "  </skill>",
  ].join("\n");
}

export function buildSkillsCatalogSection(skills: SkillDefinition[]): string {
  if (skills.length === 0) return "";
  const lines = [
    "<available_skills>",
  ];
  let usedChars = lines.join("\n").length
    + "\n</available_skills>".length
    + CATALOG_NOTICE_RESERVE_CHARS;
  let omitted = 0;

  for (const skill of skills) {
    let description = skill.description.length > MAX_DESCRIPTION_CHARS
      ? `${skill.description.slice(0, MAX_DESCRIPTION_CHARS - 3).trimEnd()}...`
      : skill.description;
    let entry = buildSkillEntry(skill, description);
    const remaining = MAX_CATALOG_CHARS - usedChars;
    if (entry.length > remaining && remaining > 240) {
      const overflow = entry.length - remaining;
      description = `${description.slice(0, Math.max(80, description.length - overflow - 3)).trimEnd()}...`;
      entry = buildSkillEntry(skill, description);
    }
    if (entry.length > MAX_CATALOG_CHARS - usedChars) {
      omitted += 1;
      continue;
    }
    lines.push(entry);
    usedChars += entry.length + 1;
  }

  if (omitted > 0) lines.push(`  <catalog_notice>${omitted} additional skills were omitted because the catalog reached its context budget.</catalog_notice>`);
  lines.push("</available_skills>");
  return lines.join("\n");
}

export function buildSkillContextXml(skill: SkillDefinition, instruction: string): string {
  const listedResources = skill.resources.slice(0, MAX_RESOURCE_ENTRIES);
  const resourceLines = skill.resources.length > 0
    ? [
        "    <resources>",
        ...listedResources.map((path) => `      <file>${escapeXml(path)}</file>`),
        ...(skill.resources.length > listedResources.length
          ? [`      <notice>${skill.resources.length - listedResources.length} additional resources omitted.</notice>`]
          : []),
        "    </resources>",
      ]
    : [];

  return [
    `  <skill_content name="${escapeXml(skill.name)}">`,
    `    <skill_directory>${escapeXml(skill.rootPath)}</skill_directory>`,
    "    <path_rule>Resolve relative paths in these instructions against skill_directory. Skill files are read-only.</path_rule>",
    `    <instructions format="markdown">${toCData(instruction)}</instructions>`,
    ...resourceLines,
    "  </skill_content>",
  ].join("\n");
}
