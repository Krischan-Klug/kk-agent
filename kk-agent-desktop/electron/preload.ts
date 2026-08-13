import { contextBridge } from "electron";

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
});
