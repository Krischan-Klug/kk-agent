import type { ModulePlugin, PluginConfigEntry, PluginPlan, PluginSummary } from "../types.js";

export interface LoadedPlugin {
  name: string;
  directory: string;
  entry: string;
  mod: ModulePlugin;
  config: PluginConfigEntry;
}

export interface PluginAnalysisEntry {
  info: LoadedPlugin;
  plan: PluginPlan;
}

export interface PluginAnalysis {
  entries: PluginAnalysisEntry[];
  registry: Record<string, PluginSummary>;
  staleConfigEntries: string[];
}
