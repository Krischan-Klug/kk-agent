import semver from "semver";
import type {
  ModulePlugin,
  PluginConfigMap,
  PluginDependency,
  PluginPlan,
  PluginSummary,
} from "../types.js";
import type { LoadedPlugin, PluginAnalysis } from "./plugin-loader.js";

function createRegistry(plugins: LoadedPlugin[]): Record<string, PluginSummary> {
  const registry: Record<string, PluginSummary> = {};
  for (const plugin of plugins) {
    registry[plugin.name] = {
      name: plugin.name,
      version: plugin.mod.version ?? "0.0.0",
      description: plugin.mod.description,
    };
  }
  return registry;
}

function topologicalOrder(plugins: LoadedPlugin[]): string[] {
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pluginsMap = new Map<string, LoadedPlugin>(plugins.map((plugin) => [plugin.name, plugin]));

  function visit(name: string, stack: string[] = []): void {
    if (visited.has(name)) return;

    if (visiting.has(name)) {
      throw new Error(`Circular plugin dependency detected: ${[...stack, name].join(" -> ")}`);
    }

    const plugin = pluginsMap.get(name);
    if (!plugin) return;

    visiting.add(name);
    for (const dependency of plugin.mod.deps ?? []) {
      if (dependency?.name && pluginsMap.has(dependency.name)) {
        visit(dependency.name, [...stack, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const plugin of plugins) {
    visit(plugin.name);
  }

  return order;
}

function satisfyDependency(
  dependency: PluginDependency,
  registry: Record<string, PluginSummary>,
  planMap: Map<string, PluginPlan>,
): { ok: boolean; reason?: string } {
  const summary = registry[dependency.name];
  if (!summary) {
    return { ok: false, reason: `Missing dependency '${dependency.name}'.` };
  }

  const depPlan = planMap.get(dependency.name);
  if (!depPlan || depPlan.status !== "enabled") {
    return {
      ok: false,
      reason: `Dependency '${dependency.name}' is not enabled (status: ${depPlan?.status ?? "unknown"}).`,
    };
  }

  if (dependency.range) {
    const version = summary.version ?? "0.0.0";
    if (!semver.valid(version) || !semver.satisfies(version, dependency.range)) {
      return {
        ok: false,
        reason: `Dependency '${dependency.name}' version ${version} does not satisfy required range '${dependency.range}'.`,
      };
    }
  }

  return { ok: true };
}

export function analysePlugins(plugins: LoadedPlugin[], config: PluginConfigMap): PluginAnalysis {
  const registry = createRegistry(plugins);
  const planMap = new Map<string, PluginPlan>();
  const entries: PluginAnalysis["entries"] = [];
  const staleConfigEntries = Object.keys(config).filter((name) => !plugins.some((plugin) => plugin.name === name));

  let order: string[];
  try {
    order = topologicalOrder(plugins);
  } catch (error) {
    console.warn("Failed to compute plugin load order:", error);
    order = plugins.map((plugin) => plugin.name);
  }

  for (const plugin of plugins) {
    planMap.set(plugin.name, {
      name: plugin.name,
      version: plugin.mod.version ?? "0.0.0",
      status: "disabled",
      issues: [],
      resolvedDependencies: [],
    });
  }

  for (const name of order) {
    const plugin = plugins.find((item) => item.name === name);
    const plan = planMap.get(name);
    if (!plugin || !plan) continue;

    const issues: string[] = [];
    const resolvedDependencies: string[] = [];

    if (plugin.config.enabled !== true) {
      entries.push({ info: plugin, plan });
      continue;
    }

    for (const dependency of plugin.mod.deps ?? []) {
      if (!dependency?.name) continue;
      const result = satisfyDependency(dependency, registry, planMap);
      if (!result.ok) {
        issues.push(result.reason ?? `Dependency '${dependency.name}' failed to load.`);
      } else {
        resolvedDependencies.push(dependency.name);
      }
    }

    plan.status = issues.length > 0 ? "skipped" : "enabled";
    plan.issues = issues;
    plan.resolvedDependencies = resolvedDependencies;
    entries.push({ info: plugin, plan });
  }

  return { entries, registry, staleConfigEntries };
}
