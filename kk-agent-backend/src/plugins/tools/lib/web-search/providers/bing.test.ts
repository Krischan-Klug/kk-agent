import assert from "node:assert/strict";
import test from "node:test";
import { filterResultsByDomains } from "../domains.js";
import { decodeBingResultUrl, parseBingResults } from "./bing.js";

function redirectUrl(target: string): string {
  return `https://www.bing.com/ck/a?!&&p=test&u=a1${Buffer.from(target).toString("base64url")}&ntb=1`;
}

test("Bing redirect decoder resolves the URL format observed in the harness session", () => {
  const observed = "https://www.bing.com/ck/a?!&&p=b8d2b4f8a3adf49cd2bceb5a20be6d66ff2eee4a234bf2a01811a37ef1343595JmltdHM9MTc4ODM5MzYwMA&ptn=3&ver=2&hsh=4&fclid=247c9da4-1999-6b0c-04d0-8a6e18b56ae9&u=a1aHR0cHM6Ly9wcml2LmF1Lw&ntb=1";
  assert.equal(decodeBingResultUrl(observed), "https://priv.au/");
  assert.equal(decodeBingResultUrl("javascript:alert(1)"), undefined);
  assert.equal(decodeBingResultUrl("https://notbing.com/ck/a?u=a1invalid"), "https://notbing.com/ck/a?u=a1invalid");
});

test("Bing parser decodes targets before applying allowed and blocked domains", () => {
  const github = redirectUrl("https://github.com/example/project?utm_source=bing#readme");
  const wikipedia = redirectUrl("https://de.wikipedia.org/wiki/Metasearch");
  const html = `<ol>
    <li class="b_algo"><h2><a href="${github.replace(/&/gu, "&amp;")}">GitHub project</a></h2><div class="b_caption"><p>Repository</p></div></li>
    <li class="b_algo"><h2><a href="${wikipedia.replace(/&/gu, "&amp;")}">Wikipedia</a></h2><div class="b_caption"><p>Article</p></div></li>
  </ol>`;
  const parsed = parseBingResults(html, "https://www.bing.com/search?q=test");
  assert.deepEqual(parsed.map((result) => result.url), [
    "https://github.com/example/project",
    "https://de.wikipedia.org/wiki/Metasearch",
  ]);
  assert.deepEqual(filterResultsByDomains(parsed, {
    allowedDomains: ["github.com"],
    blockedDomains: [],
  }).map((result) => result.host), ["github.com"]);
  assert.deepEqual(filterResultsByDomains(parsed, {
    allowedDomains: [],
    blockedDomains: ["wikipedia.org"],
  }).map((result) => result.host), ["github.com"]);
});
