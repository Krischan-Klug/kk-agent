import type { SessionRecord, SessionState, SSEEvent } from "../types.js";
import * as store from "../lib/store.js";
import {
  buildAttachmentPreviewDataUrl,
  getSessionAttachmentsByIds,
} from "../lib/attachments.js";
import { getModelCapabilities } from "../../provider/service.js";
import { allowsVisionInputs } from "../../provider/lib/capabilities.js";
import {
  attachmentRefBlock,
  createTranscriptMessage,
  textBlock,
  type TranscriptBlock,
  type TranscriptMessage,
} from "../../lib/transcript.js";
import type { SessionModeRuntimeConfig } from "../service.js";
import {
  getSessionRecordOrThrow,
  toPublicSession,
  normalizeSessionRequestConfig,
  buildModeRuntimeConfig,
  buildRuntimeMetaMessages,
  buildAttachmentMetaMessages,
} from "../service.js";
import { resolveSessionLlmRequestConfig } from "../lib/session-resolution.js";
import { getEnabledAgentModes } from "../../agent/lib/mode-config.js";
import {
  getAgent,
  createLoopAbortController,
  abortLoop,
  clearLoopAbortController,
  setLoopState,
} from "../../agent/service.js";
import { getAgentMode } from "../../agent/lib/mode-config.js";
import {
  cloneMessages,
  generateSessionName,
} from "../lib/message-state.js";
import { getLoadedSkillIds } from "../../skills/lib/xml.js";
import { getSkillsRootDir } from "../../skills/service.js";
import {
  buildDenialReminderBody,
  listSessionDenials,
  recordSessionDenial,
} from "../lib/denial-log.js";
import {
  buildSystemReminderMessages,
  drainSystemReminders,
  enqueueSystemReminder,
} from "../../loop/lib/system-reminder.js";
import type { LoopOptions, ModeRuntimeRef, RuntimeToolDefinition, ToolRuntimeContext } from "../../loop/types.js";
import { executeRuntimeTool } from "../lib/runtime-tools.js";
import {
  emitPrompt,
  waitForResponse,
  registerSession,
  unregisterSession,
  runWithSessionId,
} from "../../tools/lib/user-interaction/interaction-store.js";
import { runAgentLoop } from "../../loop/lib/agent-loop.js";

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
  await store.updateSession(sessionId, { messages });

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

async function finalizeLoopSession(
  sessionId: string,
  session: SessionRecord,
  messages: TranscriptMessage[],
  finalResponse: string,
  providerState?: SessionRecord["providerState"],
  providerDebug?: SessionRecord["providerDebug"],
): Promise<SessionRecord> {
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
  return normalizeSessionRequestConfig(await store.updateSession(sessionId, patch));
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
      modeName,
      model,
    }: {
      sessionId: string;
      agentId: string;
      modeId: string;
      modeName?: string;
      model: string;
      iteration: number;
    }) => {
      const runtimeMessages = buildRuntimeMetaMessages({
        sessionId,
        modeId,
        modeName: modeName ?? activeModeConfig.modePromptName,
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
    session: toPublicSession(await finalizeLoopSession(
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
        onToolExecutionUpdate: (toolUseId, toolName, status, resultMessage, detail, summary, input) =>
          emit({ type: "tool_execution_update", toolUseId, toolName, input, status, result: resultMessage, detail, summary }),
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

    const updated = await finalizeLoopSession(
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
