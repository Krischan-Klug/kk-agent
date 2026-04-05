import { getAllTools as getAllMcpTools, executeToolForMcp } from "../../mcp/service.js";
import type { AccessScope } from "../../mcp/types.js";
import type { RuntimeToolDefinition, ToolExecutionResult } from "../../loop/types.js";
import type { UnifiedToolDefinition } from "../../provider/lib/types.js";
import { executeSystemToolForId, type ResolvedSystemToolRuntime } from "../../tools/service.js";

type RuntimeToolCollection = {
  allTools: UnifiedToolDefinition[];
  runtimeToolsByName: Record<string, RuntimeToolDefinition>;
  notices: string[];
};

type RuntimeToolBucket = {
  tool: RuntimeToolDefinition;
  description: string;
  parameters: Record<string, unknown>;
};

function buildSystemRuntimeBuckets(systemRuntime: ResolvedSystemToolRuntime): RuntimeToolBucket[] {
  return Object.values(systemRuntime.runtimeToolsByName).map((tool) => ({
    tool,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function buildMcpRuntimeBuckets(activeMcpIds: string[]): RuntimeToolBucket[] {
  return getAllMcpTools(activeMcpIds).map((tool) => ({
    tool: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      inputSchema: tool.inputSchema,
      source: "mcp",
      capabilityId: tool.mcpId,
      isConcurrencySafe: () => false,
      interruptBehavior: "block",
      resultPolicy: {},
      permissionPolicy: { kind: "allow" },
    },
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

function bucketRuntimeTools(
  buckets: RuntimeToolBucket[],
): Map<string, RuntimeToolBucket[]> {
  const byName = new Map<string, RuntimeToolBucket[]>();
  for (const bucket of buckets) {
    const existing = byName.get(bucket.tool.name) ?? [];
    existing.push(bucket);
    byName.set(bucket.tool.name, existing);
  }
  return byName;
}

function capabilityKey(tool: RuntimeToolDefinition): string {
  return `${tool.source}:${tool.capabilityId}`;
}

function filterAllowedRuntimeBuckets(
  buckets: RuntimeToolBucket[],
  allowedToolNames: string[],
): RuntimeToolBucket[] {
  const allowed = new Set(allowedToolNames);
  const namesByCapability = new Map<string, Set<string>>();

  for (const bucket of buckets) {
    const key = capabilityKey(bucket.tool);
    const names = namesByCapability.get(key) ?? new Set<string>();
    names.add(bucket.tool.name);
    namesByCapability.set(key, names);
  }

  return buckets.filter((bucket) => {
    if (allowed.has(bucket.tool.name)) return true;

    const capabilityNames = namesByCapability.get(capabilityKey(bucket.tool));
    if (!capabilityNames) return false;

    for (const name of capabilityNames) {
      if (allowed.has(name)) return false;
    }
    return true;
  });
}

function formatConflictNotice(toolName: string, buckets: RuntimeToolBucket[]): string {
  const owners = buckets
    .map((bucket) => `${bucket.tool.source}:${bucket.tool.capabilityId}`)
    .join(", ");
  return `Tool "${toolName}" was excluded because multiple active sources provide the same tool name (${owners}).`;
}

export function buildRuntimeToolCollection(
  systemRuntime: ResolvedSystemToolRuntime,
  activeMcpIds: string[],
  allowedToolNames: string[],
): RuntimeToolCollection {
  const buckets = filterAllowedRuntimeBuckets([
    ...buildSystemRuntimeBuckets(systemRuntime),
    ...buildMcpRuntimeBuckets(activeMcpIds),
  ], allowedToolNames);

  const allTools: UnifiedToolDefinition[] = [];
  const runtimeToolsByName: Record<string, RuntimeToolDefinition> = {};
  const notices: string[] = [];

  for (const [toolName, entries] of bucketRuntimeTools(buckets)) {
    if (entries.length !== 1) {
      notices.push(formatConflictNotice(toolName, entries));
      continue;
    }

    const entry = entries[0]!;
    runtimeToolsByName[toolName] = entry.tool;
    allTools.push({
      name: entry.tool.name,
      description: entry.description,
      parameters: entry.parameters,
    });
  }

  return { allTools, runtimeToolsByName, notices };
}

export async function executeRuntimeTool(
  runtimeTool: RuntimeToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: import("../../loop/types.js").ToolRuntimeContext,
): Promise<ToolExecutionResult> {
  if (runtimeTool.source === "system") {
    return (
      await executeSystemToolForId(
        runtimeTool.capabilityId,
        toolName,
        args,
        runtimeTool.accessScope as AccessScope | undefined,
        context,
      )
    ) ?? { content: `Tool "${toolName}" is not available.`, isError: true };
  }

  return executeToolForMcp(runtimeTool.capabilityId, toolName, args);
}
