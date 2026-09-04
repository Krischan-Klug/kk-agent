import assert from "node:assert/strict";
import test from "node:test";
import { WebToolError } from "./errors.js";
import { clearSearchProviderStateForTests, searchWeb } from "./search-provider.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "./types.js";

const options: WebSearchOptions = {
  allowedDomains: [],
  blockedDomains: [],
  maxResults: 5,
  depth: "medium",
};

function result(title: string, snippet: string, url: string): WebSearchResult {
  return { title, snippet, url, host: new URL(url).hostname };
}

test.beforeEach(() => clearSearchProviderStateForTests());

test("transient Bing failures are retried at most once", async () => {
  let calls = 0;
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async (query) => {
      calls += 1;
      if (calls === 1) {
        throw new WebToolError("limited", "http_error", {
          status: 429,
          retryable: true,
          details: { retryAfterMs: 0 },
        });
      }
      return { provider: "test-bing", query, results: [], durationMs: 1 };
    },
  };
  const response = await searchWeb("architecture", options, provider);
  assert.equal(calls, 2);
  assert.equal(response.providerTrace?.[0]?.attempts, 2);
});

test("provider rejection is not retried", async () => {
  let calls = 0;
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async () => {
      calls += 1;
      throw new WebToolError("rejected", "provider_blocked", { retryable: false });
    },
  };
  await assert.rejects(searchWeb("architecture", options, provider), /Web search failed/u);
  assert.equal(calls, 1);
});

test("normal low-coverage results are preserved without refinement", async () => {
  const queries: string[] = [];
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async (query) => {
      queries.push(query);
      const results = [result("Difference Definition", "Meaning of difference", "https://dictionary.example/difference")];
      return { provider: "test-bing", query, results, durationMs: 1 };
    },
  };
  const response = await searchWeb("difference between TypeScript and JavaScript", options, provider);
  assert.deepEqual(queries, ["difference between TypeScript and JavaScript"]);
  assert.equal(response.results.length, 1);
  assert.equal(response.qualityWarning, undefined);
});

test("a completely unrelated batch is refined once and discarded only if still unrelated", async () => {
  const queries: string[] = [];
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async (query) => {
      queries.push(query);
      return {
        provider: "test-bing",
        query,
        results: [result("Cooking recipes", "Make fresh pasta", "https://example.com/recipes")],
        durationMs: 1,
      };
    },
  };
  const response = await searchWeb("Node.js security advisory", options, provider);
  assert.deepEqual(queries, ["Node.js security advisory", '"node.js" "security" "advisory"']);
  assert.deepEqual(response.results, []);
  assert.match(response.qualityWarning ?? "", /no lexical connection/u);
  assert.equal(response.providerTrace?.[0]?.refined, true);
});

test("identical result sets remain independent across distinct searches", async () => {
  const shared = [result("Alpha Omega resource", "Reference", "https://example.com/shared")];
  let calls = 0;
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async (query) => {
      calls += 1;
      return { provider: "test-bing", query, results: shared, durationMs: 1 };
    },
  };

  const first = await searchWeb("alpha documentation", options, provider);
  const second = await searchWeb("omega security", options, provider);

  assert.equal(calls, 2);
  assert.equal(first.results.length, 1);
  assert.equal(second.results.length, 1);
  assert.equal(second.providerTrace?.[0]?.refined, undefined);
});

test("refinement can recover a relevant result set", async () => {
  let calls = 0;
  const provider: WebSearchProvider = {
    id: "test-bing",
    search: async (query) => {
      calls += 1;
      const results = calls === 1
        ? [result("Cooking recipes", "Make fresh pasta", "https://example.com/recipes")]
        : [result("Node.js security advisory", "A Node.js vulnerability release", "https://nodejs.org/security/advisories/1")];
      return { provider: "test-bing", query, results, durationMs: 1 };
    },
  };
  const response = await searchWeb("Node.js security vulnerability advisory", options, provider);
  assert.equal(calls, 2);
  assert.equal(response.results.length, 1);
  assert.equal(response.executedQuery, '"node.js" "security" "vulnerability" "advisory"');
});

test("Bing requests are serialized and paced", async () => {
  let active = 0;
  let maximumActive = 0;
  const starts: number[] = [];
  const provider: WebSearchProvider = {
    id: "bing-html",
    search: async (query) => {
      starts.push(Date.now());
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { provider: "bing-html", query, results: [], durationMs: 10 };
    },
  };

  await Promise.all([
    searchWeb("first query", options, provider),
    searchWeb("second query", options, provider),
  ]);
  assert.equal(maximumActive, 1);
  assert.equal(starts.length, 2);
  assert.ok(starts[1]! - starts[0]! >= 1_000);
});
