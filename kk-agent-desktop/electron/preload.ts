import { contextBridge, ipcRenderer } from "electron";

function getArgument(prefix: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const apiBaseUrl = getArgument("--kk-agent-api-base-url=");
if (!apiBaseUrl) {
  throw new Error("kk-agent-desktop: apiBaseUrl argument missing");
}
const appVersion = getArgument("--kk-agent-app-version=");
const apiToken = getArgument("--kk-agent-api-token=");

contextBridge.exposeInMainWorld("kkAgentDesktop", {
  isDesktop: true,
  apiBaseUrl,
  apiToken,
  appVersion,
  platform: process.platform,
  external: {
    open: (url: string) => ipcRenderer.invoke("kk-agent:open-external", url),
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke("kk-agent:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("kk-agent:window:toggle-maximize"),
    isMaximized: () => ipcRenderer.invoke("kk-agent:window:is-maximized"),
    close: () => ipcRenderer.invoke("kk-agent:window:close"),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
        callback(maximized);
      };
      ipcRenderer.on("kk-agent:window:maximized-change", listener);
      return () => ipcRenderer.off("kk-agent:window:maximized-change", listener);
    },
  },
});
