import type { Express } from "express";

export interface PluginDependency {
  name: string;
  range?: string;
}

export interface PluginSummary {
  name: string;
  version: string;
  description?: string;
}

export interface PluginLifecycleContext {
  registry: Readonly<Record<string, PluginSummary>>;
  resolvedDependencies: Readonly<Record<string, PluginSummary>>;
}

export interface ModulePlugin {
  name: string;
  version: string;
  description?: string;
  deps?: PluginDependency[];
  beforeInit?(app: Express, context: PluginLifecycleContext): void | Promise<void>;
  init(app: Express, context: PluginLifecycleContext): void | Promise<void>;
  afterInit?(app: Express, context: PluginLifecycleContext): void | Promise<void>;
}

type PluginStatus = "enabled" | "skipped";

export interface PluginPlan {
  name: string;
  version: string;
  status: PluginStatus;
  issues: string[];
  resolvedDependencies: string[];
}
