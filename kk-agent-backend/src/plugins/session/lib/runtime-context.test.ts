import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeContext } from "./runtime-context.js";

test("runtime context exposes concise model-facing facts without shell internals", () => {
  const context = buildRuntimeContext({
    sessionId: "runtime-context-test",
    modeId: "edit",
    modeName: "edit",
    model: "test-model",
    runtimeVariables: {
      FILESYSTEM_ACCESS_SCOPE: "user",
      FILESYSTEM_ROOT: "C:\\Users\\Tester",
      TERMINAL_ACCESS_SCOPE: "user",
      TERMINAL_APPROVAL_MODE: "full_access",
      TERMINAL_ROOT: "C:\\Users\\Tester",
      TERMINAL_CWD: "C:\\Users\\Tester",
      TERMINAL_SHELL: "Git Bash 5.2.37",
    },
  });

  assert.match(context, /<environment [^>]*model="test-model"[^>]*mode="edit"/);
  assert.match(context, /<filesystem scope="user" root="C:\\Users\\Tester" \/>/);
  assert.match(context, /<terminal scope="user" approval="full_access" root="C:\\Users\\Tester" shell="Git Bash 5\.2\.37" \/>/);
  assert.doesNotMatch(context, /cwd=/);
  assert.doesNotMatch(context, /allowedRoot|workingDirectory|shellKind|shellExecutable|syntaxRules/);
});
