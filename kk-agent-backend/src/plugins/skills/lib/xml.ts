import { createTranscriptMessage, textBlock, type TranscriptMessage } from "../../lib/transcript.js";
import { escapeXml, toCData } from "../../lib/xml.js";
import type { SkillDefinition } from "../types.js";

function buildSkillEntry(skill: SkillDefinition): string {
  return [
    `  <skill id="${escapeXml(skill.id)}" name="${escapeXml(skill.name)}" path="${escapeXml(skill.path)}" source="${escapeXml(skill.source ?? "custom")}">`,
    `    <description>${escapeXml(skill.description)}</description>`,
    "  </skill>",
  ].filter(Boolean).join("\n");
}

export function buildSkillsCatalogSection(skills: SkillDefinition[]): string {
  if (skills.length === 0) return "";
  return ["<skills_catalog>", ...skills.map(buildSkillEntry), "</skills_catalog>"].join("\n");
}

function buildSkillContextXml(skill: SkillDefinition, instruction: string): string {
  return [
    `  <skill_context id="${escapeXml(skill.id)}" name="${escapeXml(skill.name)}" path="${escapeXml(skill.path)}" source="${escapeXml(skill.source ?? "custom")}">`,
    `    <description>${escapeXml(skill.description)}</description>`,
    `    <instruction format="markdown">${toCData(instruction.trim())}</instruction>`,
    "  </skill_context>",
  ].filter(Boolean).join("\n");
}

export function createSkillContextMessage(skill: SkillDefinition, instruction: string): TranscriptMessage {
  return createTranscriptMessage({
    role: "user",
    isMeta: true,
    content: [textBlock(buildSkillContextXml(skill, instruction))],
  });
}

export function getLoadedSkillIds(messages: Pick<TranscriptMessage, "role" | "isMeta" | "content">[]): string[] {
  const loadedSkillIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user" || message.isMeta !== true) continue;
    for (const block of message.content) {
      if (block.type !== "text") continue;
      for (const match of block.text.matchAll(/<skill_context\b[^>]*\bid="([^"]+)"/g)) {
        const skillId = match[1]?.trim();
        if (skillId) loadedSkillIds.add(skillId);
      }
    }
  }

  return [...loadedSkillIds];
}
