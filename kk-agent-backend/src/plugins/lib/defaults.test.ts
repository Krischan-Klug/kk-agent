import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { initDefaults, getDefaults, updateDefaults } from "./defaults.js";
import { getStatePath } from "./state.js";

const STATE_FILE = getStatePath("defaults.json");

function writeDefaultsFile(content: string): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, content);
}

function readDefaultsFile(): unknown | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

test("initDefaults without defaults.json uses CODE_DEFAULTS", async () => {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  await initDefaults();
  const defaults = getDefaults();
  assert.equal(defaults.agent.defaultModeBehavior, "edit");
  assert.ok(defaults.agent.promptSections.toolUsage.includes("tool_call_description"));
});

test("initDefaults with { overrides: {} } uses CODE_DEFAULTS", async () => {
  writeDefaultsFile(JSON.stringify({ overrides: {} }));
  await initDefaults();
  const defaults = getDefaults();
  assert.ok(typeof defaults.agent.promptSections.communication === "string");
  assert.ok(defaults.agent.promptSections.toolUsage.includes("tool_call_description"));
});

test("updateDefaults stores only diff against CODE_DEFAULTS", async () => {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  await initDefaults();
  await updateDefaults({
    agent: {
      promptSections: {
        communication: "Custom communication default",
      },
    },
  } as Partial<import("kk-agent-contract").AppDefaults>);
  const raw = readDefaultsFile() as { overrides: { agent?: { promptSections?: { communication?: string } } } };
  assert.equal(raw.overrides.agent?.promptSections?.communication, "Custom communication default");
  assert.equal((raw.overrides.agent?.promptSections as Record<string, unknown> | undefined)?.identity, undefined);
});

test("updateDefaults with full effective same as code saves { overrides: {} }", async () => {
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  await initDefaults();
  const defaults = getDefaults();
  await updateDefaults(defaults);
  const raw = readDefaultsFile();
  assert.deepEqual(raw, { overrides: {} });
});
