import type {
  ModulePlugin,
  PluginPlan,
  PluginSummary,
} from "../types.js";

export interface LoadedPlugin {
  name: string;
  directory: string;
  mod: ModulePlugin;
}

export interface PluginAnalysisEntry {
  info: LoadedPlugin;
  plan: PluginPlan;
}

export interface PluginAnalysis {
  entries: PluginAnalysisEntry[];
  registry: Record<string, PluginSummary>;
}
