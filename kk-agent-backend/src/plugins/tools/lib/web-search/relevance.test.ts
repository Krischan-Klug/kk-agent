import assert from "node:assert/strict";
import test from "node:test";
import { assessSearchQuality, rankSearchResults, refinedSearchQuery } from "./relevance.js";
import type { WebSearchResult } from "./types.js";

function result(title: string, snippet: string, url: string): WebSearchResult {
  return { title, snippet, url, host: new URL(url).hostname };
}

test("relevance ranking retains every normal result and puts stronger matches first", () => {
  const results = [
    result("Difference Definition & Meaning", "What does difference mean?", "https://dictionary.example/difference"),
    result("TypeScript vs JavaScript", "A practical comparison of both languages", "https://example.com/typescript-javascript"),
    result("TypeScript handbook", "Official language documentation", "https://typescriptlang.org/docs"),
  ];
  const ranked = rankSearchResults("difference between TypeScript and JavaScript", results);
  assert.equal(ranked[0]?.title, "TypeScript vs JavaScript");
  assert.deepEqual(new Set(ranked.map((entry) => entry.title)), new Set(results.map((entry) => entry.title)));
});

test("relevance keeps low-coverage but related results for agent judgment", () => {
  const results = [
    result("Node.js", "Run JavaScript everywhere", "https://nodejs.org/"),
    result("Node.js downloads", "Download Node.js", "https://nodejs.org/download"),
  ];
  const assessment = assessSearchQuality("Node.js security vulnerability advisory", results);
  assert.equal(assessment.suspicious, false);
  assert.deepEqual(new Set(assessment.results.map((entry) => entry.url)), new Set(results.map((entry) => entry.url)));
});

test("relevance marks only a batch with no query overlap as suspicious", () => {
  const results = [result("Cooking recipes", "Make fresh pasta", "https://example.com/recipes")];
  const assessment = assessSearchQuality("Node.js security advisory", results);
  assert.equal(assessment.suspicious, true);
  assert.deepEqual(assessment.results, results);
});

test("relevance keeps provider order as a final tie breaker and ignores domain operators", () => {
  const results = [
    result("Project architecture", "Repository architecture", "https://github.com/example/project"),
    result("Architecture project", "Project repository", "https://github.com/example/other"),
  ];
  assert.deepEqual(rankSearchResults("site:github.com project architecture", results), results);
});

test("refinement quotes decisive concepts instead of broad comparison wording", () => {
  assert.equal(refinedSearchQuery("difference between TypeScript and JavaScript"), '"typescript" "javascript"');
  assert.equal(refinedSearchQuery("Node.js security vulnerability advisory"), '"node.js" "security" "vulnerability" "advisory"');
});
