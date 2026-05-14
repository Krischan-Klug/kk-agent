import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const backendRoot = path.join(repoRoot, "kk-agent-backend");
const stateDir = await mkdtemp(path.join(tmpdir(), "kk-agent-backend-test-state-"));

let child;

function cleanup() {
  return rm(stateDir, { recursive: true, force: true });
}

function stop(signal) {
  if (child && !child.killed) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

try {
  child = spawn(process.execPath, ["--import", "tsx", "--test", "src/**/*.test.ts"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      KK_AGENT_STATE_DIR: stateDir,
    },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });

  await cleanup();
  process.exit(exitCode);
} catch (error) {
  await cleanup();
  process.stderr.write(`[test-backend] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
