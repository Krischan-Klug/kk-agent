import assert from "node:assert/strict";
import test from "node:test";
import { WebToolError } from "./errors.js";
import { searchWeb } from "./search-provider.js";
import type { WebSearchOptions, WebSearchProvider } from "./types.js";

const options: WebSearchOptions = {
  allowedDomains: [],
  blockedDomains: [],
  maxResults: 5,
  depth: "medium",
};

test("search provider chain skips unavailable providers and falls back after failure", async () => {
  const calls: string[] = [];
  const providers: WebSearchProvider[] = [
    {
      id: "disabled",
      isAvailable: () => false,
      search: async () => { throw new Error("must not run"); },
    },
    {
      id: "failed",
      isAvailable: () => true,
      search: async () => {
        calls.push("failed");
        throw new WebToolError("blocked", "provider_blocked");
      },
    },
    {
      id: "working",
      isAvailable: () => true,
      search: async (query) => {
        calls.push("working");
        return { provider: "working", query, results: [], durationMs: 1 };
      },
    },
  ];

  const response = await searchWeb("architecture", options, providers);
  assert.equal(response.provider, "working");
  assert.deepEqual(calls, ["failed", "working"]);
  assert.deepEqual(response.providerTrace?.map(({ provider, status }) => ({ provider, status })), [
    { provider: "disabled", status: "skipped" },
    { provider: "failed", status: "failed" },
    { provider: "working", status: "succeeded" },
  ]);
});

test("failed provider chains expose skipped and failed providers as structured diagnostics", async () => {
  const providers: WebSearchProvider[] = [
    { id: "not-configured", isAvailable: () => false, search: async () => { throw new Error("must not run"); } },
    {
      id: "failed",
      isAvailable: () => true,
      search: async () => { throw new WebToolError("rejected", "provider_blocked"); },
    },
  ];
  await assert.rejects(
    searchWeb("architecture", options, providers),
    (error: unknown) => {
      assert.ok(error instanceof WebToolError);
      assert.match(error.message, /not-configured: skipped/u);
      assert.match(error.message, /failed: failed/u);
      assert.deepEqual((error.options.details?.providerTrace as Array<{ status: string }>).map((entry) => entry.status), ["skipped", "failed"]);
      return true;
    },
  );
});

test("search provider chain preserves aborts", async () => {
  const provider: WebSearchProvider = {
    id: "aborted",
    isAvailable: () => true,
    search: async () => { throw new WebToolError("aborted", "aborted"); },
  };
  await assert.rejects(
    searchWeb("architecture", options, [provider]),
    (error: unknown) => error instanceof WebToolError && error.kind === "aborted",
  );
});
