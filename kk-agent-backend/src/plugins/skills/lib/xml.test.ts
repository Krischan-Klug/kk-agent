import assert from "node:assert/strict";
import test from "node:test";
import type { SkillDefinition } from "../types.js";
import { buildSkillsCatalogSection } from "./xml.js";

function skill(index: number): SkillDefinition {
  return {
    id: `skill-${index}`,
    name: `skill-${index}`,
    description: "A focused skill description. ".repeat(20),
    path: `/very/long/catalog/path/skill-${index}/SKILL.md`,
    rootPath: `/very/long/catalog/path/skill-${index}`,
    source: "workspace",
    mutable: false,
    metadata: {},
    resources: [],
    diagnostics: [],
  };
}

test("skill catalog is compact and omits runtime-only paths", () => {
  const catalog = buildSkillsCatalogSection(Array.from({ length: 30 }, (_, index) => skill(index)));
  assert.ok(catalog.length <= 2_500);
  assert.doesNotMatch(catalog, /<location>/);
  assert.match(catalog, /<catalog_notice>/);
});
