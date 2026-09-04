import assert from "node:assert/strict";
import test from "node:test";
import { parseDuckDuckGoResults } from "./duckduckgo.js";

test("DuckDuckGo parser supports lite and HTML result layouts", () => {
  const html = `
    <div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Futm_source%3Dx">Result A</a><div class="result__snippet">Snippet A</div></div>
    <table><tr><td><a class="result-link" href="https://example.org/b">Result B</a></td></tr><tr><td><div class="result-snippet">Snippet B</div></td></tr></table>`;
  const results = parseDuckDuckGoResults(html, "https://lite.duckduckgo.com/lite/");
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    title: "Result A",
    url: "https://example.com/a",
    snippet: "Snippet A",
    host: "example.com",
  });
  assert.equal(results[1]?.url, "https://example.org/b");
  assert.equal(results[1]?.snippet, "Snippet B");
});
