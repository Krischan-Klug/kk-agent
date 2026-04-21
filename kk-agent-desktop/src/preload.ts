import { contextBridge } from "electron";

function getArgument(prefix: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const apiBaseUrl = getArgument("--kk-agent-api-base-url=") ?? "http://127.0.0.1:3001";
const appVersion = getArgument("--kk-agent-app-version=");

contextBridge.exposeInMainWorld("kkAgentDesktop", {
  isDesktop: true,
  apiBaseUrl,
  appVersion,
  platform: process.platform,
});
