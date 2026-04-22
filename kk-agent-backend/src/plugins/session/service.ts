import { basename } from "node:path";
import type { SessionPromptDebug, SessionRecord, SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import {
  buildAttachmentPreviewDataUrl,
  clearSessionAttachments,
  getSessionAttachmentsByIds,
} from "./lib/attachments.js";
import { buildPrompt, getSystemVariables } from "../systemprompt/index.js";
import { getAllMcpsCached, getMcpTools, getRunnableMcpIds } from "../mcp/service.js";
import {
  buildResolvedSystemToolRuntime,
} from "../tools/service.js";
import { getMemoryPromptContext, getTaskSummary } from "../tools/service.js";
import { buildActiveSkillCatalogSection, getSkillsRootDir, listSkills } from "../skills/service.js";
import { runAgentLoop } from "../loop/lib/agent-loop.js";
import {
  buildSystemReminderMessages,
  clearSystemReminders,
  drainSystemReminders,
  enqueueSystemReminder,
} from "../loop/lib/system-reminder.js";
import type { LoopOptions, ModeRuntimeConfig } from "../loop/types.js";
import { getAgent, getLoopState, setLoopState, clearLoopState, createLoopAbortController, abortLoop, clearLoopAbortController } from "../agent/service.js";
import { getDefaults } from "../lib/defaults.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import { clearFilesystemReadState } from "../tools/lib/filesystem/read-state.js";
import {
  emitPrompt,
  waitForResponse,
  registerSession,
  unregisterSession,
  runWithSessionId,
} from "../tools/lib/user-interaction/interaction-store.js";
import {
  cloneMessages,
  generateSessionName,
} from "./lib/message-state.js";
import {
  buildRunnableMcpInstructions,
  collectLinkedSkillIds,
} from "./lib/tool-selection.js";
import { buildRuntimeToolCollection, executeRuntimeTool } from "./lib/runtime-tools.js";
import { resolveSessionDefaults, resolveSessionLlmRequestConfig } from "./lib/session-resolution.js";
import {
  buildDenialReminderBody,
  clearSessionDenials,
  listSessionDenials,
  recordSessionDenial,
} from "./lib/denial-log.js";
import { getAgentMode, getEnabledAgentModes } from "../agent/lib/mode-config.js";
import type { AgentDefinition } from "../agent/types.js";
import type { ModeRuntimeRef, RuntimeToolDefinition, ToolRuntimeContext } from "../loop/types.js";
import { attachmentRefBlock, createTranscriptMessage, getMessageText, textBlock, type TranscriptAttachmentRefBlock, type TranscriptBlock, type TranscriptMessage } from "../lib/transcript.js";
import { compactLlmRequestConfig } from "../provider/lib/request-config.js";
import { allowsVisionInputs } from "../provider/lib/capabilities.js";
import { getLoadedSkillIds } from "../skills/lib/xml.js";
import { getDefaultProviderId, getModelCapabilities } from "../provider/service.js";

function normalizeSessionRequestConfig<T extends { llmRequestConfig?: unknown }>(session: T): T {
  return {
    ...session,
    llmRequestConfig: compactLlmRequestConfig(session.llmRequestConfig as Parameters<typeof compactLlmRequestConfig>[0]),
  };
}

function toPublicSession(session: SessionRecord): SessionState {
  const normalized = normalizeSessionRequestConfig(session);
  const { providerState: _providerState, ...publicSession } = normalized;
  return publicSession;
}

function getSessionRecordOrThrow(id: string): SessionRecord {
  const session = store.getSession(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  return normalizeSessionRequestConfig(session);
}

function intersectIds(sessionIds: string[], modeIds: string[]): string[] {
  const sessionSet = new Set(sessionIds);
  return modeIds.filter((id) => sessionSet.has(id));
}

interface SessionModeRuntimeConfig extends ModeRuntimeConfig {
  runtimeNotices: string[];
  activeToolIds: string[];
  activeMcpIds: string[];
}

function buildModeRuntimeConfig(
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
      modeBehavior: modeRuntimeConfig.modeBehavior,
    },
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toCData(text: string): string {
  return `<![CDATA[${text.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
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

function buildRuntimeMetaMessages(input: {
  sessionId: string;
  modeId: string;
  modeBehavior: SessionModeRuntimeConfig["modeBehavior"];
  model: string;
  runtimeVariables?: Record<string, string>;
}): TranscriptMessage[] {
  const variables = getSystemVariables({
    CURRENT_MODEL: input.model,
    mode: input.modeId,
    ...(input.runtimeVariables ?? {}),
  });
  const memory = getMemoryPromptContext(input.sessionId);
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
    `Current mode: ${input.modeId}`,
    `Mode behavior: ${input.modeBehavior}`,
    "",
    "Current tasks:",
    getTaskSummary(input.sessionId),
    "",
    "Session memory:",
    memory.sessionMemory,
    "",
    "User memory:",
    memory.userMemory,
    "",
    "Filesystem access:",
    `scope=${input.runtimeVariables?.FILESYSTEM_ACCESS_SCOPE ?? "nicht aktiv"}`,
    `basePath=${input.runtimeVariables?.FILESYSTEM_BASE_PATH ?? "nicht verfuegbar"}`,
    `allowedRoot=${input.runtimeVariables?.FILESYSTEM_ALLOWED_ROOT ?? "nicht verfuegbar"}`,
    "",
    "Terminal access:",
    `scope=${input.runtimeVariables?.TERMINAL_ACCESS_SCOPE ?? "nicht aktiv"}`,
    `workingDirectory=${input.runtimeVariables?.TERMINAL_WORKING_DIRECTORY ?? "nicht verfuegbar"}`,
    `allowedRoot=${input.runtimeVariables?.TERMINAL_ALLOWED_ROOT ?? "nicht verfuegbar"}`,
    `elevation=${input.runtimeVariables?.TERMINAL_ELEVATION ?? "nicht aktiv"}`,
  ].join("\n");

  return [createMetaReminder("runtime_snapshot", body)];
}

function buildAttachmentMetaMessages(input: {
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
  return toPublicSession(store.createSession({
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

export function deleteSession(id: string): void {
  if (!store.deleteSession(id)) throw new Error(`Session "${id}" not found`);
  clearLoopState(id);
  clearTasks(id);
  clearSessionFacts(id);
  clearFilesystemReadState(id);
  clearSessionAttachments(id);
  clearSystemReminders(id);
  clearSessionDenials(id);
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);
  return buildCurrentSystemPrompt(sessionId, session, agent);
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
    modeBehavior: modeRuntimeConfig.modeBehavior,
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

async function prepareLoopRun(sessionId: string, message: string, attachmentIds?: string[]) {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);

  const userBlocks: TranscriptBlock[] = [textBlock(message)];
  const attachmentMetaMessages: TranscriptMessage[] = [];
  const capabilities = getModelCapabilities(session.providerId, session.model);
  const visionSupported = allowsVisionInputs(capabilities?.visionSupport);

  if (attachmentIds?.length) {
    const attachments = await getSessionAttachmentsByIds(sessionId, attachmentIds);
    if (attachments.length > 0) {
      for (const att of attachments) {
        const previewDataUrl = att.category === "image" && visionSupported
          ? await buildAttachmentPreviewDataUrl(att)
          : undefined;

        userBlocks.push(attachmentRefBlock({
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          category: att.category,
          source: att.source,
          size: att.size,
          previewDataUrl,
        }));
      }

      attachmentMetaMessages.push(...buildAttachmentMetaMessages({
        attachments: attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          category: att.category,
          size: att.size,
        })),
        visionSupport: capabilities?.visionSupport,
      }));
    }
  }

  const userMessage = createTranscriptMessage({
    role: "user",
    content: userBlocks,
  });

  const messages = [...session.messages, userMessage];
  store.updateSession(sessionId, { messages });

  const modeRuntimeConfigs = Object.fromEntries(
    getEnabledAgentModes(agent).map((mode) => [mode.id, buildModeRuntimeConfig(session, agent, mode.id)]),
  ) as Record<string, SessionModeRuntimeConfig>;

  return {
    session,
    agent,
    messages,
    attachmentMetaMessages,
    modeRuntimeConfigs,
    reasoning: resolveSessionLlmRequestConfig(session),
  };
}

function finalizeLoopSession(
  sessionId: string,
  session: SessionRecord,
  messages: TranscriptMessage[],
  finalResponse: string,
  providerState?: SessionRecord["providerState"],
  providerDebug?: SessionRecord["providerDebug"],
): SessionRecord {
  const nextMessages = cloneMessages(messages);
  const patch: Partial<SessionRecord> = {
    messages: nextMessages,
    providerState,
    providerDebug,
  };
  if (!session.name && finalResponse) {
    const name = generateSessionName(finalResponse);
    if (name) patch.name = name;
  }
  return normalizeSessionRequestConfig(store.updateSession(sessionId, patch));
}

function buildLoopRequest(
  prepared: Awaited<ReturnType<typeof prepareLoopRun>>,
  sessionId: string,
  handlers: Partial<Pick<LoopOptions, "onAssistantBlockDelta" | "onAssistantMessage" | "onSystemNotice" | "onToolExecutionUpdate" | "onLoopState" | "onStats">> = {},
) {
  const loopMessages = cloneMessages(prepared.messages);
  const activeModeConfig = prepared.modeRuntimeConfigs[prepared.session.activeModeId] as SessionModeRuntimeConfig;
  const activeAgentModeConfig = getAgentMode(prepared.agent, prepared.session.activeModeId);
  const loadedSkillIds = getLoadedSkillIds(loopMessages);

  return {
    agentId: prepared.session.agentId,
    sessionId,
    providerId: prepared.session.providerId,
    messages: loopMessages,
    model: prepared.session.model,
    buildEphemeralMetaMessages: ({
      iteration,
      modeId,
      modeBehavior,
      model,
    }: {
      sessionId: string;
      agentId: string;
      modeId: string;
      modeBehavior: SessionModeRuntimeConfig["modeBehavior"];
      model: string;
      iteration: number;
    }) => {
      const runtimeMessages = buildRuntimeMetaMessages({
        sessionId,
        modeId,
        modeBehavior,
        model,
        runtimeVariables: activeModeConfig.runtimeVariables,
      });
      const denials = listSessionDenials(sessionId);
      if (denials.length > 0) {
        enqueueSystemReminder(sessionId, {
          type: "tool_denied",
          body: buildDenialReminderBody(denials),
        });
      }
      const reminderMessages = buildSystemReminderMessages(drainSystemReminders(sessionId));
      return iteration === 1
        ? [...runtimeMessages, ...prepared.attachmentMetaMessages, ...reminderMessages]
        : [...runtimeMessages, ...reminderMessages];
    },
    llmRequestConfig: prepared.reasoning,
    providerState: prepared.session.providerState,
    toolContext: {
      values: {
        loadedSkillIds,
        availableSkillIds: activeModeConfig.activeSkillIds,
        skillInstructionsById: activeModeConfig.skillInstructionsById,
        skillsRootDir: getSkillsRootDir(),
      },
    },
    modeConfigs: prepared.modeRuntimeConfigs,
    activeModeId: prepared.session.activeModeId,
    agentVariables: prepared.agent.variables ?? {},
    executeTool: (
      toolName: string,
      args: Record<string, unknown>,
      mode: ModeRuntimeRef,
      _context: ToolRuntimeContext,
    ) => {
      const modeRuntimeConfig = prepared.modeRuntimeConfigs[mode.id] as SessionModeRuntimeConfig;
      const runtimeTool = modeRuntimeConfig.runtimeToolsByName[toolName];
      if (!runtimeTool) {
        return Promise.resolve({
          content: `Tool "${toolName}" ist im Mode "${mode.id}" nicht erlaubt oder nicht verfuegbar.`,
          isError: true,
        });
      }
      return executeRuntimeTool(runtimeTool, toolName, args, _context);
    },
    resolveToolPermission: async (
      runtimeTool: RuntimeToolDefinition,
      toolName: string,
      args: Record<string, unknown>,
      mode: ModeRuntimeRef,
    ) => {
      const policy = runtimeTool.resolvePermission
        ? await runtimeTool.resolvePermission(toolName, args, mode)
        : runtimeTool.permissionPolicy;

      switch (policy.kind) {
        case "allow":
          return { allowed: true };
        case "deny":
          recordSessionDenial(sessionId, toolName, args, policy.reason ?? "denied by policy");
          return { allowed: false, reason: policy.reason };
        case "prompt": {
          const promptId = `${toolName}-${Date.now()}`;
          emitPrompt(sessionId, {
            promptId,
            question: policy.question,
            choices: policy.choices,
          });
          const result = await waitForResponse(sessionId, promptId);
          if (result.isError) {
            recordSessionDenial(sessionId, toolName, args, result.content);
            return { allowed: false, reason: result.content };
          }
          try {
            const parsed = JSON.parse(result.content) as { selectedKey?: string };
            if (parsed.selectedKey && policy.allowKeys.includes(parsed.selectedKey)) {
              return { allowed: true };
            }
          } catch {
            // fall through
          }
          const reason = policy.deniedMessage ?? `Tool "${toolName}" was rejected by the user.`;
          recordSessionDenial(sessionId, toolName, args, reason);
          return { allowed: false, reason };
        }
      }
      return { allowed: true };
    },
    autonomous: activeModeConfig.modeBehavior === "autonomous",
    autonomousBudget: activeAgentModeConfig.config.autonomousBudget,
    ...handlers,
  };
}

export async function chat(
  sessionId: string,
  message: string,
  attachmentIds?: string[],
): Promise<{ response: string; session: SessionState }> {
  const prepared = await prepareLoopRun(sessionId, message, attachmentIds);
  const abortController = createLoopAbortController(sessionId);
  let result;
  try {
    result = await runWithSessionId(sessionId, () =>
      runAgentLoop({ ...buildLoopRequest(prepared, sessionId), abortSignal: abortController.signal }),
    );
  } finally {
    clearLoopAbortController(sessionId);
  }
  return {
    response: result.finalResponse,
    session: toPublicSession(finalizeLoopSession(
      sessionId,
      prepared.session,
      result.messages,
      result.finalResponse,
      result.providerState,
      result.providerDebug,
    )),
  };
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
  attachmentIds?: string[],
): Promise<void> {
  const prepared = await prepareLoopRun(sessionId, message, attachmentIds);
  for (const notice of prepared.modeRuntimeConfigs[prepared.session.activeModeId]?.runtimeNotices ?? []) {
    emit({ type: "system_notice", level: "warning", message: notice });
  }

  registerSession(sessionId, (payload) => {
    emit({
      type: "user_prompt",
      promptId: payload.promptId,
      question: payload.question,
      choices: payload.choices,
    });
  });

  const abortController = createLoopAbortController(sessionId);
  try {
    const result = await runWithSessionId(sessionId, () =>
      runAgentLoop({ ...buildLoopRequest(prepared, sessionId, {
        onAssistantBlockDelta: (messageId, block) => emit({ type: "assistant_block_delta", messageId, block }),
        onAssistantMessage: (messageObject) => emit({ type: "assistant_message_complete", message: messageObject }),
        onSystemNotice: (level, messageText) => emit({ type: "system_notice", level, message: messageText }),
        onToolExecutionUpdate: (toolUseId, toolName, status, resultMessage, detail, summary) =>
          emit({ type: "tool_execution_update", toolUseId, toolName, status, result: resultMessage, detail, summary }),
        onLoopState: (state) => {
          setLoopState(sessionId, state);
          emit({ type: "turn_state", state });
        },
        onStats: (stats) =>
          emit({
            type: "stats",
            inputTokens: stats.inputTokens,
            outputTokens: stats.outputTokens,
            reasoningTokens: stats.reasoningTokens,
            source: stats.source,
          }),
      }), abortSignal: abortController.signal }),
    );

    const updated = finalizeLoopSession(
      sessionId,
      prepared.session,
      result.messages,
      result.finalResponse,
      result.providerState,
      result.providerDebug,
    );
    emit({ type: "done", session: toPublicSession(updated) });
  } finally {
    clearLoopAbortController(sessionId);
    unregisterSession(sessionId);
  }
}

export function abortSessionLoop(sessionId: string): boolean {
  return abortLoop(sessionId);
}

export async function updateSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
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

  const updated = normalizeSessionRequestConfig(store.updateSession(id, patch));
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

type SessionIdArrayField = "activeMcpIds" | "activeToolIds" | "activeSkillIds";

function removeIdFromSessionField(id: string, field: SessionIdArrayField): void {
  for (const session of listSessions()) {
    const current = session[field];
    if (!current.includes(id)) continue;
    store.updateSession(session.id, {
      [field]: current.filter((entry) => entry !== id),
    });
  }
}

export function removeMcpFromSessions(mcpId: string): void {
  removeIdFromSessionField(mcpId, "activeMcpIds");
}

export function removeToolFromSessions(toolId: string): void {
  removeIdFromSessionField(toolId, "activeToolIds");
}

export function removeSkillFromSessions(skillId: string): void {
  removeIdFromSessionField(skillId, "activeSkillIds");
}
