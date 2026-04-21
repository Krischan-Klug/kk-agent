import type { Express } from "express";
import type { PluginLifecycleContext, PluginSummary } from "../types.js";
import type { PluginAnalysis, PluginAnalysisEntry } from "./plugin-loader.js";

export const CORE_PLUGIN_NAME = "core";

function buildContext(analysis: PluginAnalysis, entry: PluginAnalysisEntry): PluginLifecycleContext {
  const resolved: Record<string, PluginSummary> = {};

  for (const dependency of entry.plan.resolvedDependencies) {
    const summary = analysis.registry[dependency];
    if (summary) {
      resolved[dependency] = summary;
    }
  }

  return {
    settings: { ...entry.info.config.settings },
    registry: analysis.registry,
    resolvedDependencies: resolved,
  };
}

function getCoreEntry(analysis: PluginAnalysis): PluginAnalysisEntry {
  const coreEntry = analysis.entries.find((entry) => entry.info.name === CORE_PLUGIN_NAME);
  if (!coreEntry) {
    throw new Error(`Required plugin '${CORE_PLUGIN_NAME}' was not registered during analysis.`);
  }
  if (coreEntry.plan.status !== "enabled") {
    const reason = coreEntry.plan.status === "disabled"
      ? "it is disabled in plugins.config.json"
      : coreEntry.plan.issues.length > 0
        ? coreEntry.plan.issues.join("; ")
        : "unresolved issues";
    throw new Error(`Required plugin '${CORE_PLUGIN_NAME}' must be enabled before the server can start: ${reason}.`);
  }
  return coreEntry;
}

export async function initializePlannedPlugins(app: Express, analysis: PluginAnalysis): Promise<void> {
  if (!analysis.entries.length) {
    console.warn("No plugins found in src/plugins.");
    return;
  }

  getCoreEntry(analysis);

  const enabled: string[] = [];
  const disabled: string[] = [];
  const skipped: PluginAnalysisEntry[] = [];

  if (analysis.staleConfigEntries.length > 0) {
    console.warn("Found configuration entries for unknown plugins:", analysis.staleConfigEntries.join(", "));
  }

  for (const entry of analysis.entries) {
    const { plan, info } = entry;
    if (plan.status === "disabled") {
      disabled.push(plan.name);
      continue;
    }
    if (plan.status === "skipped") {
      skipped.push(entry);
      continue;
    }

    const context = buildContext(analysis, entry);
    if (typeof info.mod.beforeInit === "function") {
      await info.mod.beforeInit(app, context);
    }
    await info.mod.init(app, context);
    if (typeof info.mod.afterInit === "function") {
      await info.mod.afterInit(app, context);
    }
    enabled.push(plan.name);
  }

  const total = analysis.entries.length;
  console.log(`Plugins loaded: ${enabled.length} / ${total}`);

  if (enabled.length > 0) {
    const formatted = enabled
      .map((name) => {
        const summary = analysis.registry[name];
        return summary ? `${summary.name}@${summary.version}` : name;
      })
      .join(", ");
    console.log("\x1b[32m%s\x1b[0m", "Plugins enabled:", formatted);
  }

  if (disabled.length > 0) {
    console.log("\x1b[33m%s\x1b[0m", "Plugins disabled:", disabled.join(", "));
  }

  if (skipped.length > 0) {
    const messages = skipped
      .map((entry) => {
        const summary = analysis.registry[entry.info.name];
        const versionInfo = summary ? `@${summary.version}` : "";
        return `${entry.info.name}${versionInfo} -> ${entry.plan.issues.join("; ")}`;
      })
      .join("; ");
    console.log("\x1b[31m%s\x1b[0m", "Plugins skipped (dependency issues):", messages);
  }
}
