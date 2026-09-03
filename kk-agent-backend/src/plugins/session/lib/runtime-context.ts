import type { SessionState } from "../types.js";
import { getSystemVariables, buildPrompt } from "../../systemprompt/lib/builder.js";
import { buildResolvedInternalToolRuntime, getInternalToolState, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import { buildActiveSkillCatalogSection } from "../../skills/service.js";
import type { ModeRuntimeConfig } from "../../loop/types.js";
import { getAgentMode } from "../../agent/lib/mode-config.js";
import type { AgentDefinition } from "../../agent/types.js";
import { type TranscriptAssetRefBlock, type TranscriptMessage } from "kk-agent-contract";
import type { ToolRuntimeContext } from "../../loop/types.js";
import { buildRunnableMcpInstructions } from "./tool-selection.js";
import { buildRuntimeToolCollection } from "./runtime-tools.js";
import { getDefaults } from "../../lib/defaults.js";
import { escapeXml, toCData } from "../../lib/xml.js";
import { listActiveTerminalTasks } from "../../tools/lib/terminal/background-tasks.js";

const MAX_CONTEXT_TERMINAL_TASKS = 20;

function compactTerminalCommand(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

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
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "approvalMode" | "model">,
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
  const systemToolRuntime = buildResolvedInternalToolRuntime(
    activeToolIds,
    config.toolAccessScopes,
    config.toolInstructions,
    session.approvalMode,
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
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "activeModeId" | "approvalMode" | "model">,
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
  const internalState = getInternalToolState(input.sessionId);
  const memory = internalState.sessionFacts.length > 0 || internalState.userFacts.length > 0
    ? getMemoryPromptContext(input.sessionId)
    : null;
  const filesystemScope = input.runtimeVariables?.FILESYSTEM_ACCESS_SCOPE;
  const terminalScope = input.runtimeVariables?.TERMINAL_ACCESS_SCOPE;
  const filesystemActive = typeof filesystemScope === "string" && filesystemScope !== "nicht aktiv";
  const terminalActive = typeof terminalScope === "string" && terminalScope !== "nicht aktiv";
  const skillContexts = readStringArray(input.toolContext?.values.loadedSkillContexts);
  const filesystemRoot = input.runtimeVariables?.FILESYSTEM_ROOT;
  const terminalRoot = input.runtimeVariables?.TERMINAL_ROOT;
  const terminalCwd = input.runtimeVariables?.TERMINAL_CWD;
  const lines = [
    "<runtime_context>",
    `  <environment timestamp="${escapeXml(variables.CURRENT_TIMESTAMP ?? "")}" platform="${escapeXml(process.platform)}" model="${escapeXml(variables.CURRENT_MODEL ?? input.model)}" />`,
  ];
  if (internalState.tasks.length > 0) {
    lines.push("  <tasks>", `    ${toCData(getTaskSummary(input.sessionId))}`, "  </tasks>");
  }
  if (memory && internalState.sessionFacts.length > 0) {
    lines.push("  <memory scope=\"session\">", `    ${toCData(memory.sessionMemory)}`, "  </memory>");
  }
  if (memory && internalState.userFacts.length > 0) {
    lines.push("  <memory scope=\"user\">", `    ${toCData(memory.userMemory)}`, "  </memory>");
  }
  if (filesystemActive && filesystemRoot) {
    lines.push(`  <filesystem scope="${escapeXml(filesystemScope)}" root="${escapeXml(filesystemRoot)}" />`);
  }
  if (terminalActive && terminalRoot) {
    const cwdAttribute = terminalCwd && terminalCwd !== terminalRoot
      ? ` cwd="${escapeXml(terminalCwd)}"`
      : "";
    lines.push(
      `  <terminal scope="${escapeXml(terminalScope)}" root="${escapeXml(terminalRoot)}"${cwdAttribute} shell="${escapeXml(input.runtimeVariables?.TERMINAL_SHELL ?? "unavailable")}" privilege="${escapeXml(input.runtimeVariables?.TERMINAL_PRIVILEGE ?? "current_user")}" />`,
    );
    const activeTerminalTasks = listActiveTerminalTasks(input.sessionId);
    if (activeTerminalTasks.length > 0) {
      const visibleTasks = activeTerminalTasks.slice(0, MAX_CONTEXT_TERMINAL_TASKS);
      const taskSummary = visibleTasks
        .map((task) => `- [id=${task.id}] [${task.status}] ${compactTerminalCommand(task.command)} (cwd: ${task.cwd})`)
        .join("\n");
      const omitted = activeTerminalTasks.length - visibleTasks.length;
      lines.push(
        "  <terminal_tasks>",
        `    ${toCData(`${taskSummary}${omitted > 0 ? `\n- ${omitted} weitere aktive Tasks` : ""}`)}`,
        "  </terminal_tasks>",
      );
    }
  }
  if (input.assetContext) lines.push("  <assets>", `    ${toCData(input.assetContext)}`, "  </assets>");
  if (skillContexts.length > 0) lines.push("  <loaded_skills>", ...skillContexts, "  </loaded_skills>");
  lines.push("</runtime_context>");
  return lines.join("\n");
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
