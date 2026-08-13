import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const host = "127.0.0.1";
const pollIntervalMs = 500;
const portCheckTimeoutMs = 750;
const startupTimeoutMs = 60_000;
const useShell = process.platform === "win32";
const managedChildren = [];
const apiToken = process.env.KK_AGENT_API_TOKEN?.trim() || randomBytes(32).toString("hex");
const services = [
  {
    name: "backend",
    port: 3001,
    readyUrl: `http://${host}:3001/healthz`,
    args: ["run", "dev:backend"],
  },
  {
    name: "renderer",
    port: 3000,
    readyUrl: `http://${host}:3000`,
    args: ["run", "dev:renderer"],
  },
];

let shuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefixStream(stream, prefix, target) {
  if (!stream) return;

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      target.write(`${prefix} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      target.write(`${prefix} ${buffer}\n`);
      buffer = "";
    }
  });
}

function spawnManaged(name, args) {
  const childEnv = {
    ...process.env,
    KK_AGENT_API_TOKEN: apiToken,
    NEXT_PUBLIC_KK_AGENT_API_TOKEN: apiToken,
  };
  const child = spawn("npm", args, {
    cwd: repoRoot,
    env: childEnv,
    shell: useShell,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });

  managedChildren.push(child);
  prefixStream(child.stdout, `[${name}]`, process.stdout);
  prefixStream(child.stderr, `[${name}]`, process.stderr);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? "null"}`;
    process.stderr.write(`[${name}] exited unexpectedly with ${reason}\n`);
    void shutdown(code ?? 1);
  });

  return child;
}

async function isPortOccupied(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (occupied) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(occupied);
    };

    socket.once("connect", () => done(true));
    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED") {
        done(false);
        return;
      }
      done(true);
    });
    socket.setTimeout(portCheckTimeoutMs, () => done(false));
  });
}

async function assertPortAvailable({ name, port }) {
  if (await isPortOccupied(port)) {
    throw new Error(`${name} port ${port} is already in use. Stop the existing process before running "npm run dev".`);
  }
}

async function waitForHttp(url, label, timeoutMs = startupTimeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of managedChildren) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  await delay(pollIntervalMs);

  for (const child of managedChildren) {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });

async function main() {
  for (const service of services) {
    await assertPortAvailable(service);
  }

  for (const service of services) {
    spawnManaged(service.name, service.args);
  }

  await Promise.all(services.map((service) => waitForHttp(service.readyUrl, service.name)));

  spawnManaged("desktop", ["run", "dev:desktop"]);
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`);
  void shutdown(1);
});
