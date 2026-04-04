import type { SessionRecord, SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import { clearSessionAttachments, getSessionAttachmentsByIds, readAttachmentData } from "./lib/attachments.js";
import { buildPrompt, getSystemVariables } from "../systemprompt/service.js";
import { getActiveProviderId, getModelCapabilities } from "../provider/service.js";
import {
  buildResolvedSystemToolRuntime,
} from "../tools/service.js";
import { runLoop } from "../loop/service.js";
import type { LoopMessage, ModeRuntimeConfig } from "../loop/types.js";
import { getAgent, getLoopState, setLoopState, clearLoopState } from "../agent/service.js";
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
  fromLoopMessages,
  generateSessionName,
  mergeMessageDisplayState,
  toLoopMessages,
} from "./lib/message-state.js";
import {
  buildRunnableMcpInstructions,
} from "./lib/tool-selection.js";
import { buildRuntimeToolCollection, executeRuntimeTool } from "./lib/runtime-tools.js";
import { resolveReasoningConfig, resolveSessionDefaults } from "./lib/session-resolution.js";
import { getChatModes } from "../agent/lib/modes.js";
import { getModeConfig } from "../agent/lib/mode-config.js";
import type { AgentDefinition, ChatMode } from "../agent/types.js";
import type { RuntimeToolDefinition, ToolRuntimeContext } from "../loop/types.js";
import { attachmentRefBlock, createTranscriptMessage, textBlock, type TranscriptBlock } from "../lib/transcript.js";
import { normalizeCanonicalReasoningLevel } from "../provider/lib/capabilities.js";

function normalizeSessionReasoning<T extends { reasoningEffort?: string }>(session: T): T {
  return {
    ...session,
    reasoningEffort: normalizeCanonicalReasoningLevel(session.reasoningEffort),
  };
}

function toPublicSession(session: SessionRecord): SessionState {
  const normalized = normalizeSessionReasoning(session);
  const { providerState: _providerState, ...publicSession } = normalized;
  return publicSession;
}

function getSessionRecordOrThrow(id: string): SessionRecord {
  const session = store.getSession(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  return normalizeSessionReasoning(session);
}

function intersectIds(sessionIds: string[], modeIds: string[]): string[] {
  const sessionSet = new Set(sessionIds);
  return modeIds.filter((id) => sessionSet.has(id));
}

interface SessionModeRuntimeConfig extends ModeRuntimeConfig {
  runtimeNotices: string[];
}

function buildModeRuntimeConfig(
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "model">,
  agent: AgentDefinition,
  mode: ChatMode,
): SessionModeRuntimeConfig {
  const config = getModeConfig(agent, mode);
  const activeToolIds = intersectIds(session.activeToolIds, config.toolIds);
  const activeMcpIds = intersectIds(session.activeMcpIds, config.mcpIds);
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
    promptSections: config.promptSections,
    modeInstruction: config.modeInstruction,
    mcpInstructions: buildRunnableMcpInstructions(
      activeToolIds,
      activeMcpIds,
      effectiveInstructions,
    ),
    runtimeVariables: systemToolRuntime.runtimeVariables,
    allTools: runtimeToolCollection.allTools,
    runtimeToolsByName: runtimeToolCollection.runtimeToolsByName,
    runtimeNotices: runtimeToolCollection.notices,
  };
}

function buildCurrentSystemPrompt(
  sessionId: string,
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "activeMode" | "model">,
  agent: AgentDefinition,
): string {
  const modeRuntimeConfig = buildModeRuntimeConfig(session, agent, session.activeMode);
  const loopState = getLoopState(sessionId);
  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: session.model }),
    ...modeRuntimeConfig.runtimeVariables,
    ...agent.variables,
  };

  return buildPrompt(
    modeRuntimeConfig.promptSections,
    modeRuntimeConfig.modeInstruction,
    modeRuntimeConfig.mcpInstructions,
    variables,
    {
      sessionId,
      mode: session.activeMode,
      iteration: loopState?.iteration ?? 1,
      maxIterations: agent.maxIterations,
    },
  );
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function createSession(body: CreateSessionBody): Promise<SessionState> {
  const agent = getAgent(body.agentId);
  const defaults = await resolveSessionDefaults(agent, body, getActiveProviderId());
  return toPublicSession(store.createSession({
    agentId: body.agentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeMode: defaults.activeMode,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    reasoningEffort: defaults.reasoningEffort,
    temperature: defaults.temperature,
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
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);
  return buildCurrentSystemPrompt(sessionId, session, agent);
}

async function prepareLoopRun(sessionId: string, message: string, attachmentIds?: string[]) {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);

  const userBlocks: TranscriptBlock[] = [textBlock(message)];
  const extraSystemMessages: string[] = [];

  if (attachmentIds?.length) {
    const attachments = await getSessionAttachmentsByIds(sessionId, attachmentIds);
    if (attachments.length > 0) {
      const attachmentHints: string[] = [];

      for (const att of attachments) {
        attachmentHints.push(
          `- ${att.filename} [id=${att.id}, type=${att.category}, size=${formatAttachmentSize(att.size)}]`,
        );

        let previewDataUrl: string | undefined;
        if (att.category === "image") {
          const base64 = (await readAttachmentData(att)).toString("base64");
          previewDataUrl = `data:${att.mimeType};base64,${base64}`;
        }

        userBlocks.push(attachmentRefBlock({
          attachmentId: att.id,
          filename: att.filename,
          mimeType: att.mimeType,
          category: att.category,
          size: att.size,
          previewDataUrl,
        }));
      }

      userBlocks[0] = textBlock(
        [
          message,
          "",
          "[Chat attachments]",
          "Nutze fuer hochgeladene Dateien das Attachment-Tool statt die Hauptdateiablage.",
          ...attachmentHints,
        ].join("\n"),
      );

      if (userBlocks.some((block) => block.type === "attachment_ref" && block.category === "image")) {
        const capabilities = getModelCapabilities(session.providerId, session.model);
        if (capabilities && !capabilities.supportsVision) {
          const defaults = getDefaults();
          extraSystemMessages.push(defaults.attachment.visionNotSupportedInstruction);
        }
      }
    }
  }

  const userMessage = createTranscriptMessage({
    role: "user",
    content: userBlocks,
  });

  const messages = [...session.messages, userMessage];
  store.updateSession(sessionId, { messages });

  const modeRuntimeConfigs = Object.fromEntries(
    getChatModes().map((mode) => [mode, buildModeRuntimeConfig(session, agent, mode)]),
  ) as Partial<Record<ChatMode, SessionModeRuntimeConfig>>;

  return {
    session,
    agent,
    messages,
    extraSystemMessages,
    modeRuntimeConfigs,
    reasoning: resolveReasoningConfig(session),
  };
}

function finalizeLoopSession(
  sessionId: string,
  session: SessionRecord,
  previousMessages: SessionState["messages"],
  messages: LoopMessage[],
  finalResponse: string,
  providerState?: SessionRecord["providerState"],
  providerDebug?: SessionRecord["providerDebug"],
): SessionRecord {
  const nextMessages = mergeMessageDisplayState(fromLoopMessages(messages), previousMessages);
  const patch: Partial<SessionRecord> = {
    messages: nextMessages,
    providerState,
    providerDebug,
  };
  if (!session.name && finalResponse) {
    const name = generateSessionName(finalResponse);
    if (name) patch.name = name;
  }
  return normalizeSessionReasoning(store.updateSession(sessionId, patch));
}

function buildLoopRequest(
  prepared: Awaited<ReturnType<typeof prepareLoopRun>>,
  sessionId: string,
  handlers: Partial<Parameters<typeof runLoop>[0]> = {},
) {
  const loopMessages = toLoopMessages(prepared.messages);

  return {
    agentId: prepared.session.agentId,
    sessionId,
    providerId: prepared.session.providerId,
    messages: loopMessages,
    extraSystemMessages: prepared.extraSystemMessages,
    model: prepared.session.model,
    reasoningEffort: prepared.reasoning.reasoningEffort,
    temperature: prepared.reasoning.temperature,
    maxOutputTokens: prepared.reasoning.maxOutputTokens,
    providerState: prepared.session.providerState,
    modeConfigs: prepared.modeRuntimeConfigs,
    maxIterations: prepared.agent.maxIterations,
    activeMode: prepared.session.activeMode,
    agentVariables: prepared.agent.variables ?? {},
    executeTool: (
      toolName: string,
      args: Record<string, unknown>,
      mode: ChatMode,
      _context: ToolRuntimeContext,
    ) => {
      const modeRuntimeConfig = prepared.modeRuntimeConfigs[mode] as SessionModeRuntimeConfig;
      const runtimeTool = modeRuntimeConfig.runtimeToolsByName[toolName];
      if (!runtimeTool) {
        return Promise.resolve({
          content: `Tool "${toolName}" ist im Mode "${mode}" nicht erlaubt oder nicht verfuegbar.`,
          isError: true,
        });
      }
      return executeRuntimeTool(runtimeTool, toolName, args);
    },
    resolveToolPermission: async (
      runtimeTool: RuntimeToolDefinition,
      toolName: string,
      args: Record<string, unknown>,
      mode: ChatMode,
    ) => {
      const policy = runtimeTool.resolvePermission
        ? await runtimeTool.resolvePermission(toolName, args, mode)
        : runtimeTool.permissionPolicy;

      switch (policy.kind) {
        case "allow":
          return { allowed: true };
        case "deny":
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
          return {
            allowed: false,
            reason: policy.deniedMessage ?? `Tool "${toolName}" was rejected by the user.`,
          };
        }
      }
      return { allowed: true };
    },
    ...handlers,
  };
}

export async function chat(
  sessionId: string,
  message: string,
  attachmentIds?: string[],
): Promise<{ response: string; session: SessionState }> {
  const prepared = await prepareLoopRun(sessionId, message, attachmentIds);
  const result = await runWithSessionId(sessionId, () => runLoop(buildLoopRequest(prepared, sessionId)));
  return {
    response: result.finalResponse,
    session: toPublicSession(finalizeLoopSession(
      sessionId,
      prepared.session,
      prepared.messages,
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
  for (const notice of prepared.modeRuntimeConfigs[prepared.session.activeMode]?.runtimeNotices ?? []) {
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

  try {
    const result = await runWithSessionId(sessionId, () =>
      runLoop(buildLoopRequest(prepared, sessionId, {
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
      })),
    );

    const updated = finalizeLoopSession(
      sessionId,
      prepared.session,
      prepared.messages,
      result.messages,
      result.finalResponse,
      result.providerState,
      result.providerDebug,
    );
    emit({ type: "done", session: toPublicSession(updated) });
  } finally {
    unregisterSession(sessionId);
  }
}

export async function updateSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  const session = getSessionRecordOrThrow(id);
  const nextAgentId = body.agentId ?? session.agentId;
  const agent = getAgent(nextAgentId);
  const switchingAgent = body.agentId !== undefined && body.agentId !== session.agentId;
  const defaultsInput = switchingAgent
    ? {
        activeToolIds: body.activeToolIds,
        activeMcpIds: body.activeMcpIds,
        activeMode: body.activeMode,
        model: body.model,
        reasoningEffort: body.reasoningEffort,
        temperature: body.temperature,
      }
    : {
        activeToolIds: body.activeToolIds,
        activeMcpIds: body.activeMcpIds,
        activeMode: body.activeMode ?? session.activeMode,
        model: body.model ?? session.model,
        reasoningEffort: body.reasoningEffort ?? session.reasoningEffort,
        temperature: body.temperature ?? session.temperature,
      };
  const defaults = await resolveSessionDefaults(
    agent,
    defaultsInput,
    body.agentId ? getActiveProviderId() : session.providerId,
  );

  const patch: Partial<SessionRecord> = {
    agentId: nextAgentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeMode: defaults.activeMode,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    reasoningEffort: defaults.reasoningEffort,
    temperature: defaults.temperature,
    ...(switchingAgent || session.providerId !== defaults.providerId || session.model !== defaults.model
      ? { providerState: undefined, providerDebug: undefined }
      : {}),
  };

  const updated = normalizeSessionReasoning(store.updateSession(id, patch));
  if (switchingAgent) {
    clearLoopState(id);
  }
  return toPublicSession(updated);
}

export async function patchSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  return updateSession(id, body);
}

export function removeMcpFromSessions(mcpId: string): void {
  for (const session of listSessions()) {
    if (!session.activeMcpIds.includes(mcpId)) continue;
    store.updateSession(session.id, {
      activeMcpIds: session.activeMcpIds.filter((entry) => entry !== mcpId),
    });
  }
}

export function removeToolFromSessions(toolId: string): void {
  for (const session of listSessions()) {
    if (!session.activeToolIds.includes(toolId)) continue;
    store.updateSession(session.id, {
      activeToolIds: session.activeToolIds.filter((entry) => entry !== toolId),
    });
  }
}
