import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  dismissError,
  getErrorMessage,
  getErrorNotices,
  reportError,
  subscribeToErrors,
} from "./errorReporting";

const originalConsoleError = console.error;

function dismissAll(): void {
  for (const notice of getErrorNotices()) dismissError(notice.id);
}

beforeEach(() => {
  console.error = () => undefined;
  dismissAll();
});

afterEach(() => {
  dismissAll();
  console.error = originalConsoleError;
});

test("normalizes unknown error values", () => {
  assert.equal(getErrorMessage(new Error("Request failed")), "Request failed");
  assert.equal(getErrorMessage("  Invalid input  "), "Invalid input");
  assert.equal(getErrorMessage(null), "An unexpected error occurred.");
});

test("queues reported errors until they are dismissed", () => {
  let notifications = 0;
  const unsubscribe = subscribeToErrors(() => { notifications += 1; });
  const first = reportError("First action failed", new Error("First reason"));
  const second = reportError("Second action failed", "Second reason");

  assert.deepEqual(getErrorNotices(), [first, second]);
  dismissError(first.id);
  assert.deepEqual(getErrorNotices(), [second]);
  assert.equal(notifications, 3);
  unsubscribe();
});

test("deduplicates consecutive identical errors", () => {
  const first = reportError("Save failed", new Error("Offline"));
  const repeated = reportError("Save failed", new Error("Offline"));

  assert.equal(repeated.id, first.id);
  assert.equal(repeated.occurrences, 2);
  assert.deepEqual(getErrorNotices(), [repeated]);
});
