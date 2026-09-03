import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, skills } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("extracts a structured backend error message", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "Validation failed: Invalid SKILL.md." }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    skills.list(),
    (error: unknown) => error instanceof ApiError
      && error.status === 400
      && error.message === "Validation failed: Invalid SKILL.md.",
  );
});

test("preserves a plain-text backend error message", async () => {
  globalThis.fetch = async () => new Response("Service unavailable", { status: 503 });

  await assert.rejects(
    skills.list(),
    (error: unknown) => error instanceof ApiError
      && error.status === 503
      && error.message === "Service unavailable",
  );
});
