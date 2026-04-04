import type { SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import type { AttachmentDisplayMeta } from "./lib/attachment-types.js";
import type { ContentBlock, UnifiedToolDefinition } from "../provider/lib/types.js";
import * as store from "./lib/store.js";
import { clearSessionAttachments, getSessionAttachmentsByIds, readAttachmentData } from "./lib/attachments.js";
import { buildPrompt, getSystemVariables } from "../systemprompt/service.js";
import { getActiveProviderId, getModelCapabilities } from "../provider/service.js";
import { getToolDefinitions, executeTool } from "../mcp/service.js";
import {
  buildResolvedSystemToolRuntime,
  executeSystemToolForId,
  type ResolvedSystemToolTarget,
} from "../tools/service.js";
import { runLoop } from "../loop/service.js";
import type { LoopMessage, ModeRuntimeConfig } from "../loop/types.js";
import { getAgent, getLoopState, setLoopState, clearLoopState } from "../agent/service.js";
import { getDefaults } from "../lib/defaults.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import {
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
import { resolveReasoningConfig, resolveSessionDefaults } from "./lib/session-resolution.js";
import { getChatModes } from "../agent/lib/modes.js";
import { getModeConfig } from "../agent/lib/mode-config.js";
import type { AgentDefinition, ChatMode } from "../agent/types.js";

function intersectIds(sessionIds: string[], modeIds: string[]): string[] {
  const sessionSet = new Set(sessionIds);
  return modeIds.filter((id) => sessionSet.has(id));
}

function filterAllowedTools(tools: UnifiedToolDefinition[], allowedToolNames: string[]): UnifiedToolDefinition[] {
  const allowed = new Set(allowedToolNames);
  return tools.filter((tool) => allowed.has(tool.name));
}

function getCombinedToolDefinitions(systemTools: UnifiedToolDefinition[], activeMcpIds: string[], allowedToolNames: string[]) {
  const filteredSystemTools = filterAllowedTools(systemTools, allowedToolNames);
  const mcpTools = getToolDefinitions(activeMcpIds);
  return [...filteredSystemTools, ...mcpTools];
}

interface SessionModeRuntimeConfig extends ModeRuntimeConfig {
  allowedToolNames: string[];
  toolTargetsByName: Record<string, ResolvedSystemToolTarget>;
}

async function executeCombinedTool(
  toolName: string,
  args: Record<string, unknown>,
  modeRuntimeConfig: SessionModeRuntimeConfig,
  mode: ChatMode,
) {
  if (modeRuntimeConfig.toolTargetsByName[toolName] && !modeRuntimeConfig.allowedToolNames.includes(toolName)) {
    return { content: `Tool "${toolName}" ist im Mode "${mode}" nicht erlaubt.`, isError: true };
  }
  const systemTarget = modeRuntimeConfig.toolTargetsByName[toolName];
  if (systemTarget) {
    const systemResult = await executeSystemToolForId(
      systemTarget.toolId,
      toolName,
      args,
      systemTarget.accessScope,
    );
    if (systemResult) return systemResult;
  }
  return executeTool(toolName, args);
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
    allTools: getCombinedToolDefinitions(systemToolRuntime.toolDefinitions, activeMcpIds, config.allowedToolNames),
    allowedToolNames: config.allowedToolNames,
    toolTargetsByName: systemToolRuntime.toolTargetsByName,
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
  return store.createSession({
    agentId: body.agentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeMode: defaults.activeMode,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    reasoningEffort: defaults.reasoningEffort,
    temperature: defaults.temperature,
  });
}

export function getSession(id: string): SessionState {
  const session = store.getSession(id);
  if (!session) throw new Error(`Session "${id}" not found`);
  return session;
}

export function listSessions(): SessionState[] {
  return store.listSessions();
}

export function deleteSession(id: string): void {
  if (!store.deleteSession(id)) throw new Error(`Session "${id}" not found`);
  clearLoopState(id);
  clearTasks(id);
  clearSessionFacts(id);
  clearSessionAttachments(id);
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);
  const agent = getAgent(session.agentId);
  return buildCurrentSystemPrompt(sessionId, session, agent);
}

async function prepareLoopRun(sessionId: string, message: string, attachmentIds?: string[]) {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  let userContent: string | ContentBlock[] = message;
  let attachmentsMeta: AttachmentDisplayMeta[] | undefined;
  const extraSystemMessages: string[] = [];

  if (attachmentIds?.length) {
    const attachments = await getSessionAttachmentsByIds(sessionId, attachmentIds);
    if (attachments.length > 0) {
      const textParts: string[] = [message];
      const imageBlocks: ContentBlock[] = [];
      const displayMetas: AttachmentDisplayMeta[] = [];
      const attachmentHints: string[] = [];

      for (const att of attachments) {
        const displayMeta: AttachmentDisplayMeta = {
          filename: att.filename,
          mimeType: att.mimeType,
          category: att.category,
          size: att.size,
        };

        attachmentHints.push(
          `- ${att.filename} [id=${att.id}, type=${att.category}, size=${formatAttachmentSize(att.size)}]`,
        );

        if (att.category === "image") {
          const base64 = (await readAttachmentData(att)).toString("base64");
          const dataUrl = `data:${att.mimeType};base64,${base64}`;
          imageBlocks.push({ type: "image_url", image_url: { url: dataUrl } });
          displayMeta.previewDataUrl = dataUrl;
        }

        displayMetas.push(displayMeta);
      }

      textParts.push(
        [
          "",
          "[Chat attachments]",
          "Nutze fuer hochgeladene Dateien das Attachment-Tool statt die Hauptdateiablage.",
          ...attachmentHints,
        ].join("\n"),
      );

      if (imageBlocks.length > 0) {
        const capabilities = getModelCapabilities(session.providerId, session.model);
        if (capabilities && !capabilities.supportsVision) {
          const defaults = getDefaults();
          extraSystemMessages.push(defaults.attachment.visionNotSupportedInstruction);
          userContent = textParts.join("");
        } else {
          userContent = [
            { type: "text" as const, text: textParts.join("") },
            ...imageBlocks,
          ];
        }
      } else {
        userContent = textParts.join("");
      }

      attachmentsMeta = displayMetas;
    }
  }

  const userMessage: SessionState["messages"][number] = {
    role: "user",
    content: message,
    ...(attachmentsMeta?.length ? { attachments: attachmentsMeta } : {}),
  };

  const messages = [...session.messages, userMessage];
  store.updateSession(sessionId, { messages });

  const modeRuntimeConfigs = Object.fromEntries(
    getChatModes().map((mode) => [mode, buildModeRuntimeConfig(session, agent, mode)]),
  ) as Partial<Record<ChatMode, SessionModeRuntimeConfig>>;

  return {
    session,
    agent,
    messages,
    userContent,
    extraSystemMessages,
    modeRuntimeConfigs,
    reasoning: resolveReasoningConfig(session),
  };
}

function finalizeLoopSession(
  sessionId: string,
  session: SessionState,
  previousMessages: SessionState["messages"],
  messages: LoopMessage[],
  finalResponse: string,
): SessionState {
  const nextMessages = mergeMessageDisplayState(fromLoopMessages(messages), previousMessages);
  const patch: Partial<SessionState> = { messages: nextMessages };
  if (!session.name && finalResponse) {
    const name = generateSessionName(finalResponse);
    if (name) patch.name = name;
  }
  return store.updateSession(sessionId, patch);
}

function buildLoopRequest(
  prepared: Awaited<ReturnType<typeof prepareLoopRun>>,
  sessionId: string,
  handlers: Partial<Parameters<typeof runLoop>[0]> = {},
) {
  const loopMessages = toLoopMessages(prepared.messages);
  if (loopMessages.length > 0) {
    for (let i = loopMessages.length - 1; i >= 0; i--) {
      if (loopMessages[i].role === "user") {
        loopMessages[i].content = prepared.userContent;
        break;
      }
    }
  }

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
    modeConfigs: prepared.modeRuntimeConfigs,
    maxIterations: prepared.agent.maxIterations,
    activeMode: prepared.session.activeMode,
    agentVariables: prepared.agent.variables ?? {},
    executeTool: (toolName: string, args: Record<string, unknown>, mode: ChatMode) =>
      executeCombinedTool(
        toolName,
        args,
        prepared.modeRuntimeConfigs[mode] as SessionModeRuntimeConfig,
        mode,
      ),
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
    session: finalizeLoopSession(sessionId, prepared.session, prepared.messages, result.messages, result.finalResponse),
  };
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
  attachmentIds?: string[],
): Promise<void> {
  const prepared = await prepareLoopRun(sessionId, message, attachmentIds);

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
        onContent: (content) => emit({ type: "content", content }),
        onReasoning: (content) => emit({ type: "reasoning", content }),
        onContentReset: () => emit({ type: "content_reset" }),
        onRetryNotice: (messageText) => emit({ type: "retry_notice", message: messageText }),
        onToolCall: (tc) =>
          emit({ type: "tool_call", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } }),
        onToolResult: (toolCallId, result) =>
          emit({ type: "tool_result", toolCallId, content: result.content, isError: result.isError }),
        onLoopState: (state) => {
          setLoopState(sessionId, state);
          emit({ type: "loop_state", state });
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

    const updated = finalizeLoopSession(sessionId, prepared.session, prepared.messages, result.messages, result.finalResponse);
    emit({ type: "done", session: updated });
  } finally {
    unregisterSession(sessionId);
  }
}

export async function updateSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  const session = getSession(id);
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

  const patch: Partial<SessionState> = {
    agentId: nextAgentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeMode: defaults.activeMode,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    reasoningEffort: defaults.reasoningEffort,
    temperature: defaults.temperature,
  };

  const updated = store.updateSession(id, patch);
  if (switchingAgent) {
    clearLoopState(id);
  }
  return updated;
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
