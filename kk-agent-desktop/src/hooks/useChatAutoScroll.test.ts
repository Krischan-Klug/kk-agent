import assert from "node:assert/strict";
import test from "node:test";
import { isNearChatBottom } from "./useChatAutoScroll.js";

test("chat bottom proximity uses the configured tolerance", () => {
  assert.equal(isNearChatBottom({ scrollTop: 453, scrollHeight: 1_000, clientHeight: 500 }), true);
  assert.equal(isNearChatBottom({ scrollTop: 452, scrollHeight: 1_000, clientHeight: 500 }), false);
});
