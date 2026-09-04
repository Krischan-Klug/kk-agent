import { app, BrowserWindow, ipcMain, Menu, net, protocol, safeStorage, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CredentialStore } from "./credential-store.js";
import { migrateLegacyMcpCredentials } from "./credential-migration.js";

const logger = {
  info: (...args: unknown[]) => console.info("[desktop]", ...args),
  error: (...args: unknown[]) => console.error("[desktop]", ...args),
};

const APP_NAME = "KK Agent";
const LEGACY_APP_DATA_NAME = "KK-Agent";
const APP_ID = "net.kkstudios.kk-agent";
const canonicalUserDataDir = path.join(app.getPath("appData"), LEGACY_APP_DATA_NAME);
app.setName(APP_NAME);
app.setPath("userData", canonicalUserDataDir);

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

const DEV_RENDERER_URL = "http://127.0.0.1:3000";
const DEV_API_BASE_URL = "http://127.0.0.1:3001";
const BACKEND_READY_PREFIX = "KK_AGENT_BACKEND_READY ";
const isDev = !app.isPackaged || process.env.KK_AGENT_ELECTRON_DEV === "1";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

function registerWindowControlHandlers(): void {
  ipcMain.handle("kk-agent:open-external", async (_event, rawUrl: unknown) => {
    if (typeof rawUrl !== "string") return false;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      await shell.openExternal(url.toString());
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("kk-agent:window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle("kk-agent:window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return window.isMaximized();
  });

  ipcMain.handle("kk-agent:window:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("kk-agent:window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

function createApiToken(): string {
  const configured = process.env.KK_AGENT_API_TOKEN?.trim();
  return configured && configured.length > 0
    ? configured
    : randomBytes(32).toString("hex");
}

function createHostToken(): string {
  const configured = process.env.KK_AGENT_HOST_TOKEN?.trim();
  return configured && configured.length > 0
    ? configured
    : randomBytes(32).toString("hex");
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "app:"
      || (isDev && url.origin === DEV_RENDERER_URL);
  } catch {
    return false;
  }
}

function assertTrustedRenderer(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrustedRendererUrl(event.senderFrame?.url ?? "")) {
    throw new Error("Untrusted credential request.");
  }
}

function getDesktopRoot(): string {
  return path.resolve(__dirname, "..");
}

// Packaged assets live under process.resourcesPath per extraResources in package.json.
function getRendererRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "renderer")
    : path.join(getDesktopRoot(), "out");
}

function getBackendEntry(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend", "index.cjs")
    : path.resolve(getDesktopRoot(), "..", "kk-agent-backend", "desktop-dist", "index.cjs");
}

function getWindowIconPath(): string {
  return path.join(app.getAppPath(), "assets", "icon.ico");
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

function resolveRendererPath(rendererRoot: string, requestPath: string): string {
  const resolvedRendererRoot = path.resolve(rendererRoot);
  const normalized = decodeURIComponent(requestPath || "/");
  const candidates = normalized === "/"
    ? ["/chat.html", "/chat/index.html"]
    : path.extname(normalized)
      ? [normalized]
      : [`${normalized}.html`, path.join(normalized, "index.html")];

  for (const candidate of candidates) {
    const absoluteCandidate = path.resolve(resolvedRendererRoot, `.${candidate}`);
    const relative = path.relative(resolvedRendererRoot, absoluteCandidate);
    const insideRoot = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    if (insideRoot && existsSync(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return path.resolve(resolvedRendererRoot, "./chat.html");
}

async function registerRendererProtocol(): Promise<void> {
  const rendererRoot = getRendererRoot();
  await protocol.handle("app", (request) => {
    const targetUrl = new URL(request.url);
    const filePath = resolveRendererPath(rendererRoot, targetUrl.pathname);
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

async function startBackend(apiToken: string, hostToken: string): Promise<string> {
  const backendEntry = getBackendEntry();
  const userDataRoot = app.getPath("userData");
  const stateDir = path.join(userDataRoot, "state");

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
      KK_AGENT_HOST_TOKEN: hostToken,
      KK_AGENT_STATE_DIR: stateDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const apiBaseUrl = await waitForBackendFromLogs(backendProcess);
  await waitForHttp(`${apiBaseUrl}/healthz`);
  return apiBaseUrl;
}

async function syncCredentialsToBackend(
  store: CredentialStore,
  apiBaseUrl: string,
  hostToken: string,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/internal/host/credentials`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-KK-Agent-Host-Token": hostToken,
    },
    body: JSON.stringify({ credentials: await store.readAll() }),
  });
  if (!response.ok) throw new Error(`Credential sync failed with HTTP ${response.status}.`);
}

function registerCredentialHandlers(
  store: CredentialStore,
  apiBaseUrl: string,
  hostToken: string,
): void {
  ipcMain.handle("kk-agent:credentials:set", async (event, id: unknown, value: unknown) => {
    assertTrustedRenderer(event);
    if (typeof id !== "string" || typeof value !== "string") throw new Error("Invalid credential input.");
    await store.set(id, value);
    await syncCredentialsToBackend(store, apiBaseUrl, hostToken);
    return true;
  });
  ipcMain.handle("kk-agent:credentials:set-many", async (event, values: unknown) => {
    assertTrustedRenderer(event);
    if (!values || typeof values !== "object" || Array.isArray(values)
      || !Object.entries(values).every(([id, value]) => id.length > 0 && typeof value === "string")) {
      throw new Error("Invalid credentials input.");
    }
    await store.setMany(values as Record<string, string>);
    await syncCredentialsToBackend(store, apiBaseUrl, hostToken);
    return true;
  });
  ipcMain.handle("kk-agent:credentials:remove", async (event, id: unknown) => {
    assertTrustedRenderer(event);
    if (typeof id !== "string") throw new Error("Invalid credential id.");
    await store.remove(id);
    await syncCredentialsToBackend(store, apiBaseUrl, hostToken);
    return true;
  });
  ipcMain.handle("kk-agent:credentials:remove-many", async (event, ids: unknown) => {
    assertTrustedRenderer(event);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw new Error("Invalid credential ids.");
    await store.removeMany(ids);
    await syncCredentialsToBackend(store, apiBaseUrl, hostToken);
    return true;
  });
}

async function createCredentialStore(): Promise<CredentialStore> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure operating-system credential storage is unavailable.");
  }
  return new CredentialStore(
    path.join(app.getPath("userData"), "state", "mcp-credentials.json"),
    {
      encrypt: async (value) => safeStorage.encryptString(value),
      decrypt: async (value) => safeStorage.decryptString(value),
    },
  );
}

async function createMainWindow(apiBaseUrl: string, apiToken?: string): Promise<void> {
  const preloadPath = path.join(__dirname, "preload.js");
  const appTitle = app.getName();
  mainWindow = new BrowserWindow({
    title: appTitle,
    icon: getWindowIconPath(),
    frame: false,
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

  const sendMaximizedState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("kk-agent:window:maximized-change", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", sendMaximizedState);
  mainWindow.on("unmaximize", sendMaximizedState);

  // Keep the native window title sourced from Electron metadata instead of page HTML.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow?.setTitle(appTitle);
  });

  // Hardening: deny window.open and block navigation to foreign origins.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const allowedOrigin = new URL(isDev ? DEV_RENDERER_URL : "app://-/").origin;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault();
  });

  if (isDev) {
    await mainWindow.loadURL(DEV_RENDERER_URL);
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
    if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);
    registerWindowControlHandlers();
    if (!isDev) {
      await registerRendererProtocol();
    }

    const apiToken = createApiToken();
    const hostToken = createHostToken();
    const credentialStore = await createCredentialStore();
    await migrateLegacyMcpCredentials(
      path.join(app.getPath("userData"), "state", "mcps.json"),
      credentialStore,
    );
    const apiBaseUrl = isDev ? DEV_API_BASE_URL : await startBackend(apiToken, hostToken);
    await syncCredentialsToBackend(credentialStore, apiBaseUrl, hostToken);
    registerCredentialHandlers(credentialStore, apiBaseUrl, hostToken);
    await createMainWindow(apiBaseUrl, apiToken);
  } catch (error) {
    logger.error("Failed to start application", error);
    await shutdownBackend();
    app.exit(1);
  }
});
