import { basename } from "node:path";
import { escapeXml, toCData } from "../lib/xml.js";
import type { SessionPromptDebug, SessionRecord, SessionState, CreateSessionBody } from "./types.js";
import * as store from "./lib/store.js";
import { clearSessionAttachments } from "./lib/attachments.js";
import { buildPrompt, getSystemVariables } from "../systemprompt/index.js";
import { getAllMcpsCached, getMcpTools, getRunnableMcpIds } from "../mcp/service.js";
import { buildResolvedSystemToolRuntime } from "../tools/service.js";
import { getMemoryPromptContext, getTaskSummary } from "../tools/service.js";
import { buildActiveSkillCatalogSection, listSkills } from "../skills/service.js";
import { clearSystemReminders, enqueueSystemReminder } from "../loop/lib/system-reminder.js";
import type { ModeRuntimeConfig } from "../loop/types.js";
import { getAgent, getLoopState, clearLoopState } from "../agent/service.js";
import { getDefaults } from "../lib/defaults.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import { clearFilesystemReadState } from "../tools/lib/filesystem/read-state.js";
import { buildRunnableMcpInstructions, collectLinkedSkillIds } from "./lib/tool-selection.js";
import { buildRuntimeToolCollection } from "./lib/runtime-tools.js";
import { resolveSessionDefaults } from "./lib/session-resolution.js";
import { clearSessionDenials } from "./lib/denial-log.js";
import { getAgentMode } from "../agent/lib/mode-config.js";
import type { AgentDefinition } from "../agent/types.js";
import { createTranscriptMessage, getMessageText, textBlock, type TranscriptAttachmentRefBlock, type TranscriptMessage } from "../lib/transcript.js";
import { compactLlmRequestConfig } from "../provider/lib/request-config.js";
import { getDefaultProviderId, getModelCapabilities } from "../provider/service.js";
import { NotFoundError } from "../../lib/errors.js";

export function normalizeSessionRequestConfig<T extends { llmRequestConfig?: unknown }>(session: T): T {
  return {
    ...session,
    llmRequestConfig: compactLlmRequestConfig(session.llmRequestConfig as Parameters<typeof compactLlmRequestConfig>[0]),
  };
}

export function toPublicSession(session: SessionRecord): SessionState {
  const normalized = normalizeSessionRequestConfig(session);
  const { providerState: _providerState, ...publicSession } = normalized;
  return publicSession;
}

export function getSessionRecordOrThrow(id: string): SessionRecord {
  const session = store.getSession(id);
  if (!session) throw new NotFoundError("Session", id);
  return normalizeSessionRequestConfig(session);
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
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeSkillIds" | "model">,
  agent: AgentDefinition,
  modeId: string,
): SessionModeRuntimeConfig {
  const mode = getAgentMode(agent, modeId);
  const config = mode.config;
  const activeToolIds = intersectIds(session.activeToolIds, config.toolIds);
  const activeMcpIds = intersectIds(session.activeMcpIds, config.mcpIds);
  const baseActiveSkillIds = intersectIds(session.activeSkillIds, config.skillIds);
  const linkedSkillIds = collectLinkedSkillIds(activeToolIds, activeMcpIds);
  const activeSkillIds = [...new Set([...baseActiveSkillIds, ...linkedSkillIds])];
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
  const skillInstructionsById = Object.fromEntries(
    activeSkillIds
      .map((skillId) => [skillId, config.skillInstructions[skillId]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
  );

  return {
    modeId: mode.id,
    modeLabel: mode.label,
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
      ? buildActiveSkillCatalogSection(activeSkillIds, mode.behavior)
      : "",
    activeSkillIds,
    skillInstructionsById,
    runtimeVariables: systemToolRuntime.runtimeVariables,
    allTools: runtimeToolCollection.allTools,
    runtimeToolsByName: runtimeToolCollection.runtimeToolsByName,
    runtimeNotices: runtimeToolCollection.notices,
    activeToolIds,
    activeMcpIds,
  };
}

function buildCurrentSystemPrompt(
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

function buildSystemReminder(type: string, body: string): string {
  return [
    `<system-reminder type="${escapeXml(type)}">`,
    `  ${toCData(body.trim())}`,
    "</system-reminder>",
  ].join("\n");
}

function createMetaReminder(type: string, body: string): TranscriptMessage {
  return createTranscriptMessage({
    role: "user",
    isMeta: true,
    content: [textBlock(buildSystemReminder(type, body))],
  });
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

export function buildRuntimeMetaMessages(input: {
  sessionId: string;
  modeId: string;
  modeName: string;
  model: string;
  runtimeVariables?: Record<string, string>;
}): TranscriptMessage[] {
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
  const body = [
    "Treat this reminder as authoritative for the current turn.",
    "",
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
  ].join("\n");

  return [createMetaReminder("runtime_snapshot", body)];
}

export function buildAttachmentMetaMessages(input: {
  attachments: Array<{
    id?: string;
    filename: string;
    mimeType: string;
    category: "image" | "text" | "pdf";
    size: number;
  }>;
  visionSupport?: "supported" | "unsupported" | "unknown";
}): TranscriptMessage[] {
  if (input.attachments.length === 0) return [];

  const defaults = getDefaults();
  const attachmentLines = input.attachments.map((att) =>
    `- ${att.filename} [id=${att.id ?? "none"}, type=${att.category}, mime=${att.mimeType}, size=${formatAttachmentSize(att.size)}]`,
  );

  const messages = [
    createMetaReminder(
      "attachment_context",
      [
        "The current user turn includes session attachments.",
        "Treat them as chat attachments, not as normal project files.",
        "Use the attachment tools to inspect them, and prefer attachmentId when available.",
        "",
        ...attachmentLines,
      ].join("\n"),
    ),
  ];

  if (input.visionSupport === "unsupported" && input.attachments.some((att) => att.category === "image")) {
    messages.push(createMetaReminder("vision_warning", defaults.attachment.visionNotSupportedInstruction));
  }

  return messages;
}

function getLatestAttachmentRefs(messages: TranscriptMessage[]): TranscriptAttachmentRefBlock[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user" || message.isMeta) continue;
    const attachments = message.content.filter(
      (block): block is TranscriptAttachmentRefBlock => block.type === "attachment_ref",
    );
    if (attachments.length > 0) return attachments;
  }
  return [];
}

function decodeDebugMetaText(text: string): string {
  const systemReminderMatch = text.match(/<system-reminder\b[^>]*>\s*<!\[CDATA\[([\s\S]*)\]\]>\s*<\/system-reminder>/i);
  if (!systemReminderMatch) return text;
  return systemReminderMatch[1]!.replaceAll("]]]]><![CDATA[>", "]]>").trim();
}

function extractMetaMessageTexts(messages: TranscriptMessage[]): string[] {
  return messages
    .map((message) => decodeDebugMetaText(getMessageText(message).trim()))
    .filter((text) => text.length > 0);
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function createSession(body: CreateSessionBody): Promise<SessionState> {
  const agent = getAgent(body.agentId);
  const defaults = await resolveSessionDefaults(agent, body, body.providerId ?? getDefaultProviderId());
  return toPublicSession(await store.createSession({
    agentId: body.agentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeModeId: defaults.activeModeId,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    activeSkillIds: defaults.activeSkillIds,
    llmRequestConfig: defaults.llmRequestConfig,
  }));
}

export function getSession(id: string): SessionState {
  return toPublicSession(getSessionRecordOrThrow(id));
}

export function listSessions(): SessionState[] {
  return store.listSessions().map(toPublicSession);
}

export async function deleteSession(id: string): Promise<void> {
  if (!(await store.deleteSession(id))) throw new NotFoundError("Session", id);
  clearLoopState(id);
  clearTasks(id);
  clearSessionFacts(id);
  clearFilesystemReadState(id);
  clearSessionAttachments(id);
  clearSystemReminders(id);
  clearSessionDenials(id);
}

export function getCurrentPromptDebug(sessionId: string): SessionPromptDebug {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);
  const modeRuntimeConfig = buildModeRuntimeConfig(session, agent, session.activeModeId);
  const loopState = getLoopState(sessionId);
  const systemPrompt = buildCurrentSystemPrompt(sessionId, session, agent);
  const runtimeMetaMessages = buildRuntimeMetaMessages({
    sessionId,
    modeId: modeRuntimeConfig.modeId,
    modeName: modeRuntimeConfig.modePromptName,
    model: session.model,
    runtimeVariables: modeRuntimeConfig.runtimeVariables,
  });

  const latestAttachmentRefs = loopState?.status === "running" ? getLatestAttachmentRefs(session.messages) : [];
  const capabilities = getModelCapabilities(session.providerId, session.model);
  const attachmentMetaMessages = buildAttachmentMetaMessages({
    attachments: latestAttachmentRefs.map((attachment) => ({
      id: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      category: attachment.category,
      size: attachment.size,
    })),
    visionSupport: capabilities?.visionSupport,
  });

  return {
    systemPrompt,
    metaMessages: extractMetaMessageTexts([...runtimeMetaMessages, ...attachmentMetaMessages]),
    runtimeTools: Object.values(modeRuntimeConfig.runtimeToolsByName).map((tool) => ({
      name: tool.name,
      description: tool.description,
      capabilityId: tool.capabilityId,
      source: tool.source,
      inputSchema: tool.inputSchema,
    })),
    runtimeMcps: getAllMcpsCached()
      .filter((mcp) => modeRuntimeConfig.activeMcpIds.includes(mcp.id))
      .map((mcp) => ({
        id: mcp.id,
        name: mcp.name,
        instruction: mcp.instruction,
        emoji: mcp.emoji,
        source: mcp.source === "custom" ? "custom" : undefined,
        active: mcp.active,
        running: getRunnableMcpIds().includes(mcp.id),
        tools: getMcpTools(mcp.id).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      })),
    runtimeSkills: listSkills()
      .filter((skill) => modeRuntimeConfig.activeSkillIds.includes(skill.id))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        instruction: skill.instruction,
        active: skill.active,
        source: skill.source,
        recommendedToolIds: [...skill.recommendedToolIds],
        recommendedMcpIds: [...skill.recommendedMcpIds],
        allowedModeBehaviors: [...skill.allowedModeBehaviors],
      })),
  };
}

async function updateSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  const session = getSessionRecordOrThrow(id);
  const nextAgentId = body.agentId ?? session.agentId;
  const agent = getAgent(nextAgentId);
  const switchingAgent = body.agentId !== undefined && body.agentId !== session.agentId;
  const defaultsInput = switchingAgent
      ? {
        providerId: body.providerId,
        activeToolIds: body.activeToolIds,
        activeMcpIds: body.activeMcpIds,
        activeSkillIds: body.activeSkillIds,
        activeModeId: body.activeModeId,
        model: body.model,
        llmRequestConfig: body.llmRequestConfig,
      }
    : {
        providerId: body.providerId ?? session.providerId,
        activeToolIds: body.activeToolIds,
        activeMcpIds: body.activeMcpIds,
        activeSkillIds: body.activeSkillIds,
        activeModeId: body.activeModeId ?? session.activeModeId,
        model: body.model ?? session.model,
        llmRequestConfig: body.llmRequestConfig ?? session.llmRequestConfig,
      };
  const defaults = await resolveSessionDefaults(
    agent,
    defaultsInput,
    body.agentId ? (body.providerId ?? agent.defaultProviderId ?? session.providerId) : session.providerId,
  );

  const patch: Partial<SessionRecord> = {
    agentId: nextAgentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeModeId: defaults.activeModeId,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    activeSkillIds: defaults.activeSkillIds,
    llmRequestConfig: defaults.llmRequestConfig,
    ...(switchingAgent || session.providerId !== defaults.providerId || session.model !== defaults.model
      ? { providerState: undefined, providerDebug: undefined }
      : {}),
  };

  const updated = normalizeSessionRequestConfig(await store.updateSession(id, patch));
  if (switchingAgent) {
    clearLoopState(id);
  }
  if (defaults.activeModeId !== session.activeModeId) {
    enqueueSystemReminder(id, {
      type: "mode_changed",
      body: `The user switched the chat mode from "${session.activeModeId}" to "${defaults.activeModeId}". Re-evaluate which tools are now allowed and proceed in the new mode.`,
    });
  }
  return toPublicSession(updated);
}

export async function patchSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  return updateSession(id, body);
}
