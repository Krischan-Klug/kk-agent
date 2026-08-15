import { basename } from "node:path";
import type { SessionState } from "../types.js";
import { getSystemVariables, buildPrompt } from "../../systemprompt/lib/builder.js";
import { buildResolvedSystemToolRuntime, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import { buildActiveSkillCatalogSection } from "../../skills/service.js";
import type { ModeRuntimeConfig } from "../../loop/types.js";
import { getAgentMode } from "../../agent/lib/mode-config.js";
import type { AgentDefinition } from "../../agent/types.js";
import { type TranscriptAssetRefBlock, type TranscriptMessage } from "kk-agent-contract";
import type { ToolRuntimeContext } from "../../loop/types.js";
import { buildRunnableMcpInstructions } from "./tool-selection.js";
import { buildRuntimeToolCollection } from "./runtime-tools.js";
import { getDefaults } from "../../lib/defaults.js";

function intersectIds(sessionIds: string[], modeIds: string[]): string[] {
  const sessionSet = new Set(sessionIds);
  return modeIds.filter((id) => sessionSet.has(id));
}

export interface SessionModeRuntimeConfig extends ModeRuntimeConfig {
  runtimeNotices: string[];
  activeToolIds: string[];
  activeMcpIds: string[];
}

export function buildModeRuntimeConfig(
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "model">,
  agent: AgentDefinition,
  modeId: string,
): SessionModeRuntimeConfig {
  const mode = getAgentMode(agent, modeId);
  const config = mode.config;
  const configuredActiveToolIds = intersectIds(session.activeToolIds, config.toolIds);
  const activeMcpIds = intersectIds(session.activeMcpIds, config.mcpIds);
  const selectedSkillIds = intersectIds(session.activeSkillIds, config.skillIds);
  const activeSkillIds = configuredActiveToolIds.includes("skill") ? selectedSkillIds : [];
  const activeToolIds = activeSkillIds.length > 0
    ? configuredActiveToolIds
    : configuredActiveToolIds.filter((id) => id !== "skill");
  const systemToolRuntime = buildResolvedSystemToolRuntime(
    activeToolIds,
    config.toolAccessScopes,
    config.toolInstructions,
  );
  const runtimeToolCollection = buildRuntimeToolCollection(
    systemToolRuntime,
    activeMcpIds,
    config.allowedToolNames,
  );
  const effectiveInstructions = {
    ...systemToolRuntime.instructionsById,
    ...config.mcpInstructions,
  };
  return {
    modeId: mode.id,
    modePromptName: mode.source === "custom" ? mode.label : mode.id,
    modeBehavior: mode.behavior,
    promptSections: config.promptSections,
    modeInstruction: config.modeInstruction,
    mcpInstructions: buildRunnableMcpInstructions(
      activeToolIds,
      activeMcpIds,
      effectiveInstructions,
    ),
    skillsCatalog: activeToolIds.includes("skill")
      ? buildActiveSkillCatalogSection(activeSkillIds)
      : "",
    activeSkillIds,
    runtimeVariables: systemToolRuntime.runtimeVariables,
    allTools: runtimeToolCollection.allTools,
    runtimeToolsByName: runtimeToolCollection.runtimeToolsByName,
    runtimeNotices: runtimeToolCollection.notices,
    activeToolIds,
    activeMcpIds,
  };
}

export function buildCurrentSystemPrompt(
  sessionId: string,
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "activeModeId" | "model">,
  agent: AgentDefinition,
): string {
  const modeRuntimeConfig = buildModeRuntimeConfig(session, agent, session.activeModeId);
  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: session.model }),
    ...modeRuntimeConfig.runtimeVariables,
    ...agent.variables,
  };

  return buildPrompt(
    modeRuntimeConfig.promptSections,
    modeRuntimeConfig.modeInstruction,
    modeRuntimeConfig.mcpInstructions,
    modeRuntimeConfig.skillsCatalog,
    variables,
    {
      sessionId,
      modeId: modeRuntimeConfig.modeId,
      modeName: modeRuntimeConfig.modePromptName,
    },
  );
}

function getRuntimeShellHint(): string {
  const shellCandidate = process.env.SHELL?.trim()
    || process.env.ComSpec?.trim()
    || process.env.COMSPEC?.trim()
    || process.env.TERM_PROGRAM?.trim();

  if (!shellCandidate) return "unknown";
  return basename(shellCandidate);
}

function buildAccessSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return ["", title, ...lines];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function buildRuntimeContext(input: {
  sessionId: string;
  modeId: string;
  modeName: string;
  model: string;
  runtimeVariables?: Record<string, string>;
  toolContext?: ToolRuntimeContext;
  assetContext?: string;
}): string {
  const variables = getSystemVariables({
    CURRENT_MODEL: input.model,
    mode: input.modeName,
    ...(input.runtimeVariables ?? {}),
  });
  const memory = getMemoryPromptContext(input.sessionId);
  const filesystemScope = input.runtimeVariables?.FILESYSTEM_ACCESS_SCOPE;
  const terminalScope = input.runtimeVariables?.TERMINAL_ACCESS_SCOPE;
  const filesystemActive = typeof filesystemScope === "string" && filesystemScope !== "nicht aktiv";
  const terminalActive = typeof terminalScope === "string" && terminalScope !== "nicht aktiv";
  const skillContexts = readStringArray(input.toolContext?.values.loadedSkillContexts);
  return [
    "<runtime_context>",
    `Current date: ${variables.CURRENT_DATE ?? ""}`,
    `Current time: ${variables.CURRENT_TIME ?? ""}`,
    `Current timestamp: ${variables.CURRENT_TIMESTAMP ?? ""}`,
    "",
    "Environment:",
    `platform=${process.platform}`,
    `shell=${getRuntimeShellHint()}`,
    "",
    `Current model: ${variables.CURRENT_MODEL ?? input.model}`,
    `Current mode: ${input.modeName}`,
    `Current mode id: ${input.modeId}`,
    "",
    "Current tasks:",
    getTaskSummary(input.sessionId),
    "",
    "Session memory:",
    memory.sessionMemory,
    "",
    "User memory:",
    memory.userMemory,
    ...buildAccessSection("Filesystem access:", filesystemActive ? [
      `scope=${filesystemScope}`,
      `basePath=${input.runtimeVariables?.FILESYSTEM_BASE_PATH ?? "nicht verfuegbar"}`,
      `allowedRoot=${input.runtimeVariables?.FILESYSTEM_ALLOWED_ROOT ?? "nicht verfuegbar"}`,
    ] : []),
    ...buildAccessSection("Terminal access:", terminalActive ? [
      `scope=${terminalScope}`,
      `workingDirectory=${input.runtimeVariables?.TERMINAL_WORKING_DIRECTORY ?? "nicht verfuegbar"}`,
      `allowedRoot=${input.runtimeVariables?.TERMINAL_ALLOWED_ROOT ?? "nicht verfuegbar"}`,
      `elevation=${input.runtimeVariables?.TERMINAL_ELEVATION ?? "nicht aktiv"}`,
    ] : []),
    ...(input.assetContext ? ["", input.assetContext] : []),
    ...(skillContexts.length > 0 ? ["", "Loaded skills:", ...skillContexts] : []),
    "</runtime_context>",
  ].join("\n");
}

export function buildAssetRuntimeContext(input: {
  assets: Array<{
    id: string;
    filename: string;
    mimeType: string;
    kind: import("kk-agent-contract").AssetKind;
    size: number;
  }>;
  imageInputSupported: boolean;
}): string {
  if (input.assets.length === 0) return "";

  const assetLines = input.assets.map((asset) =>
    `- ${asset.filename} [id=${asset.id}, kind=${asset.kind}, mime=${asset.mimeType}, size=${formatAssetSize(asset.size)}]`,
  );

  const lines = [
    "Current user assets:",
    "Their content is projected request-scoped. Use list_assets, search_asset, and read_asset for targeted access; prefer assetId.",
    ...assetLines,
  ];

  if (!input.imageInputSupported && input.assets.some((asset) => asset.kind === "image")) {
    lines.push("", getDefaults().asset.visionNotSupportedInstruction);
  }

  return lines.join("\n");
}

export function getLatestAssetRefs(messages: TranscriptMessage[]): TranscriptAssetRefBlock[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const assets = message.content.filter(
      (block): block is TranscriptAssetRefBlock => block.type === "asset_ref",
    );
    if (assets.length > 0) return assets;
  }
  return [];
}

function formatAssetSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
