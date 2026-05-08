import { app, BrowserWindow, Menu, net, protocol } from "electron";
import { createLogger } from "./logger";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const logger = createLogger("desktop");

// Use app:// instead of file:// so packaged builds keep a standard origin for fetch/stream/CORS.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const DEV_FRONTEND_URL = "http://127.0.0.1:3000";
const DEV_API_BASE_URL = "http://127.0.0.1:3001";
const BACKEND_READY_PREFIX = "KK_AGENT_BACKEND_READY ";
const isDev = !app.isPackaged || process.env.KK_AGENT_ELECTRON_DEV === "1";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

function createApiToken(): string {
  const configured = process.env.KK_AGENT_API_TOKEN?.trim();
  return configured && configured.length > 0
    ? configured
    : randomBytes(32).toString("hex");
}

function getDesktopRoot(): string {
  return path.resolve(__dirname, "..");
}

// Packaged assets live under process.resourcesPath per extraResources in package.json.
function getFrontendRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "frontend")
    : path.resolve(getDesktopRoot(), "..", "kk-agent-frontend", "out");
}

function getBackendEntry(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend", "index.cjs")
    : path.resolve(getDesktopRoot(), "..", "kk-agent-backend", "desktop-dist", "index.cjs");
}

async function waitForHttp(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the backend is reachable or the timeout expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out while waiting for ${url}`);
}

function resolveFrontendPath(frontendRoot: string, requestPath: string): string {
  const resolvedFrontendRoot = path.resolve(frontendRoot);
  const normalized = decodeURIComponent(requestPath || "/");
  const candidates = normalized === "/"
    ? ["/chat.html", "/chat/index.html"]
    : path.extname(normalized)
      ? [normalized]
      : [`${normalized}.html`, path.join(normalized, "index.html")];

  for (const candidate of candidates) {
    const absoluteCandidate = path.resolve(resolvedFrontendRoot, `.${candidate}`);
    const relative = path.relative(resolvedFrontendRoot, absoluteCandidate);
    const insideRoot = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    if (insideRoot && existsSync(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return path.resolve(resolvedFrontendRoot, "./chat.html");
}

async function registerFrontendProtocol(): Promise<void> {
  const frontendRoot = getFrontendRoot();
  await protocol.handle("app", (request) => {
    const targetUrl = new URL(request.url);
    const filePath = resolveFrontendPath(frontendRoot, targetUrl.pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// Use stdout instead of IPC so the backend stays decoupled from Electron.
async function waitForBackendFromLogs(child: ChildProcess): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (!stdout || !stderr) {
      reject(new Error("Backend process stdio is not available."));
      return;
    }

    const stdoutReader = createInterface({ input: stdout });
    const stderrReader = createInterface({ input: stderr });

    const cleanup = () => {
      stdoutReader.close();
      stderrReader.close();
      child.off("exit", handleExit);
    };

    const handleLine = (line: string) => {
      logger.info(`[backend] ${line}`);
      const readyIndex = line.indexOf(BACKEND_READY_PREFIX);
      if (readyIndex === -1) return;

      try {
        const payload = JSON.parse(line.slice(readyIndex + BACKEND_READY_PREFIX.length)) as { host: string; port: number };
        cleanup();
        resolve(`http://${payload.host}:${payload.port}`);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const handleErrorLine = (line: string) => {
      logger.error(`[backend] ${line}`);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`Backend exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})`));
    };

    stdoutReader.on("line", handleLine);
    stderrReader.on("line", handleErrorLine);
    child.once("exit", handleExit);
  });
}

async function startBackend(apiToken: string): Promise<string> {
  const backendEntry = getBackendEntry();
  const userDataRoot = path.join(app.getPath("userData"), "kk-agent");
  const stateDir = path.join(userDataRoot, "state");
  const pluginConfigFile = path.join(userDataRoot, "plugins.config.json");

  await mkdir(stateDir, { recursive: true });

  // Run the current Electron executable as a plain Node process for the backend bundle.
  // PORT=0 lets the OS choose a free port and avoids collisions on user machines.
  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: userDataRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "0",
      KK_AGENT_API_TOKEN: apiToken,
      KK_AGENT_STATE_DIR: stateDir,
      KK_AGENT_PLUGIN_CONFIG_FILE: pluginConfigFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const apiBaseUrl = await waitForBackendFromLogs(backendProcess);
  await waitForHttp(`${apiBaseUrl}/healthz`);
  return apiBaseUrl;
}

async function createMainWindow(apiBaseUrl: string, apiToken?: string): Promise<void> {
  const preloadPath = path.join(__dirname, "preload.js");
  const appTitle = app.getName();
  mainWindow = new BrowserWindow({
    title: appTitle,
    show: false,
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
      additionalArguments: [
        `--kk-agent-api-base-url=${apiBaseUrl}`,
        ...(apiToken ? [`--kk-agent-api-token=${apiToken}`] : []),
        `--kk-agent-app-version=${app.getVersion()}`,
      ],
    },
  });
  mainWindow.setMenu(null);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Keep the native window title sourced from Electron metadata instead of page HTML.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow?.setTitle(appTitle);
  });

  // Hardening: deny window.open and block navigation to foreign origins.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const allowedOrigin = isDev ? DEV_FRONTEND_URL : "app://";
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedOrigin)) event.preventDefault();
  });

  if (isDev) {
    await mainWindow.loadURL(DEV_FRONTEND_URL);
    return;
  }

  await mainWindow.loadURL("app://-/chat");
}

async function shutdownBackend(): Promise<void> {
  if (!backendProcess || backendProcess.killed) return;

  await new Promise<void>((resolve) => {
    const child = backendProcess!;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void app.quit();
  }
});

app.on("before-quit", () => {
  void shutdownBackend();
});

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);

    if (!isDev) {
      await registerFrontendProtocol();
    }

    const apiToken = createApiToken();
    const apiBaseUrl = isDev ? DEV_API_BASE_URL : await startBackend(apiToken);
    await createMainWindow(apiBaseUrl, apiToken);
  } catch (error) {
    logger.error("Failed to start application", error);
    await shutdownBackend();
    app.exit(1);
  }
});
