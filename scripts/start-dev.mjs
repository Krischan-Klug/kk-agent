import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronBinary from "electron";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const electronEnv = { ...process.env, KK_AGENT_ELECTRON_DEV: "1" };

delete electronEnv.ELECTRON_RUN_AS_NODE;

const electronProcess = spawn(electronBinary, ["."], {
  cwd: packageRoot,
  env: electronEnv,
  stdio: "inherit",
  windowsHide: false,
});

electronProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

electronProcess.on("error", (error) => {
  console.error("[desktop-dev] Failed to launch Electron:", error);
  process.exit(1);
});
