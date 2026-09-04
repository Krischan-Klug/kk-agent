import assert from "node:assert/strict";
import test from "node:test";
import { domainMatches, filterResultsByDomains, normalizeSearchDomain } from "./domains.js";
import type { WebSearchResult } from "./types.js";

const results: WebSearchResult[] = [
  { title: "GitHub", url: "https://github.com/example/repo", host: "github.com", snippet: "" },
  { title: "Wikipedia", url: "https://de.wikipedia.org/wiki/Test", host: "de.wikipedia.org", snippet: "" },
];

test("domain matching includes subdomains but not lookalike domains", () => {
  assert.equal(normalizeSearchDomain("https://WWW.GitHub.com/path"), "www.github.com");
  assert.equal(domainMatches("docs.example.com", "example.com"), true);
  assert.equal(domainMatches("notexample.com", "example.com"), false);
});

test("allowed and blocked domain filters operate on resolved result hosts", () => {
  assert.deepEqual(filterResultsByDomains(results, {
    allowedDomains: ["github.com"],
    blockedDomains: [],
  }).map((result) => result.host), ["github.com"]);
  assert.deepEqual(filterResultsByDomains(results, {
    allowedDomains: [],
    blockedDomains: ["wikipedia.org"],
  }).map((result) => result.host), ["github.com"]);
});
