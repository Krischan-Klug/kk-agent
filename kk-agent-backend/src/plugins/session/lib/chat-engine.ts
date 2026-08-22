import { randomUUID } from "node:crypto";
import type { AgentRun, AgentRunStatus, RunEvent } from "kk-agent-contract";
import type { SessionRecord, SSEEvent } from "../types.js";
import * as store from "./store.js";
import { getSessionAssetsByIds } from "./assets.js";
import { compileAssetModelContent } from "./asset-context.js";
import { getEffectiveContextLimit, getModelCapabilities } from "../../provider/service.js";
import { supportsInputModality } from "kk-agent-contract";
import {
  assetRefBlock,
  createTranscriptMessage,
  textBlock,
  type TranscriptBlock,
} from "kk-agent-contract";
import type { SessionModeRuntimeConfig } from "../service.js";
import {
  buildAssetRuntimeContext,
  buildModeRuntimeConfig,
  buildRuntimeContext,
  getSessionRecordOrThrow,
  normalizeSessionRequestConfig,
  toPublicSession,
} from "../service.js";
import { resolveSessionLlmRequestConfig } from "./session-resolution.js";
import { getEnabledAgentModes } from "../../agent/lib/mode-config.js";
import {
  getAgent,
} from "../../agent/service.js";
import { abortLoop, beginLoop, finishLoop } from "../../loop/lib/run-registry.js";
import { cloneMessages, generateSessionName } from "./message-state.js";
import { buildLoadedSkillContexts } from "../../skills/service.js";
import type {
  LoopCheckpoint,
  LoopOptions,
  LoopResult,
  ModeRuntimeRef,
  RuntimeToolDefinition,
  ToolRuntimeContext,
} from "../../loop/types.js";
import { executeRuntimeTool } from "./runtime-tools.js";
import {
  cancelPendingPrompts,
  emitPrompt,
  registerSession,
  runWithSessionId,
  unregisterSession,
  waitForResponse,
} from "../../tools/lib/user-interaction/interaction-store.js";
import { runAgentLoop } from "../../loop/lib/agent-loop.js";
import { getErrorMessage } from "../../../lib/error.js";

type PreparedLoopRun = Awaited<ReturnType<typeof prepareLoopRun>>;

function nowIso(): string {
  return new Date().toISOString();
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getExplicitSkillId(message: string, availableSkillIds: string[]): string | undefined {
  const match = message.trimStart().match(/^[$/]([a-z0-9]+(?:-[a-z0-9]+)*)\b/);
  const requested = match?.[1];
  return requested && availableSkillIds.includes(requested) ? requested : undefined;
}

async function updateRun(
  sessionId: string,
  runId: string,
  updater: (run: AgentRun) => AgentRun,
  sessionPatch: Partial<SessionRecord> = {},
): Promise<SessionRecord> {
  const current = getSessionRecordOrThrow(sessionId);
  const runFound = current.runs.some((run) => run.id === runId);
  if (!runFound) throw new Error(`Run "${runId}" is missing from session "${sessionId}".`);
  return store.updateSession(sessionId, {
    ...sessionPatch,
    runs: current.runs.map((run) => run.id === runId ? updater(run) : run),
  });
}

async function appendRunEvent(
  sessionId: string,
  runId: string,
  event: RunEvent,
  emit?: (event: SSEEvent) => void,
): Promise<void> {
  let appended = false;
  await updateRun(sessionId, runId, (run) => {
    const duplicate = run.events.some((existing) => existing.id === event.id);
    const terminalAlreadyRecorded = event.terminal && run.events.some((existing) => existing.terminal);
    if (duplicate || terminalAlreadyRecorded) return run;
    appended = true;
    return { ...run, updatedAt: event.createdAt, events: [...run.events, event] };
  });
  if (appended) emit?.({ type: "run_event", event });
}

async function prepareLoopRun(sessionId: string, message: string, assetIds?: string[]) {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);
  const userBlocks: TranscriptBlock[] = [textBlock(message)];
  const capabilities = getModelCapabilities(session.providerId, session.model);
  const imageInputSupported = supportsInputModality(capabilities, "image");
  let assetContext = "";

  if (assetIds?.length) {
    const assets = getSessionAssetsByIds(sessionId, assetIds);
    if (assets.length !== new Set(assetIds).size) throw new Error("One or more selected assets are missing from this session.");
    for (const asset of assets) {
      userBlocks.push(assetRefBlock(asset.id));
    }
    assetContext = buildAssetRuntimeContext({
      assets: assets.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
        kind: asset.kind,
        size: asset.size,
      })),
      imageInputSupported,
    });
  }

  const userMessage = createTranscriptMessage({ role: "user", content: userBlocks });
  const runStartedAt = nowIso();
  const run: AgentRun = {
    id: randomUUID(),
    userMessageId: userMessage.id,
    status: "running",
    step: 0,
    attempt: 0,
    toolBatch: 0,
    startedAt: runStartedAt,
    updatedAt: runStartedAt,
    events: [],
    modelInputs: [],
    artifactIds: [],
  };
  const messages = [...session.messages, userMessage];
  const modelContentByMessageId = await compileAssetModelContent({
    sessionId,
    messages,
    visionSupported: imageInputSupported,
  });

  const modeRuntimeConfigs = Object.fromEntries(
    getEnabledAgentModes(agent).map((mode) => [mode.id, buildModeRuntimeConfig(session, agent, mode.id)]),
  ) as Record<string, SessionModeRuntimeConfig>;
  const activeModeConfig = modeRuntimeConfigs[session.activeModeId];
  if (!activeModeConfig) throw new Error(`Missing active mode config "${session.activeModeId}".`);
  const explicitSkillId = getExplicitSkillId(message, activeModeConfig.activeSkillIds);
  const requestedLoadedSkillIds = explicitSkillId
    ? [...new Set([...session.loadedSkillIds, explicitSkillId])]
    : session.loadedSkillIds;
  const loadedSkills = buildLoadedSkillContexts(requestedLoadedSkillIds, activeModeConfig.activeSkillIds);
  await store.updateSession(sessionId, { messages, runs: [...session.runs, run] });

  return {
    session,
    agent,
    run,
    messages,
    assetContext,
    modelContentByMessageId,
    modeRuntimeConfigs,
    reasoning: resolveSessionLlmRequestConfig(session),
    loadedSkills,
  };
}

async function persistCheckpoint(
  prepared: PreparedLoopRun,
  checkpoint: LoopCheckpoint,
): Promise<void> {
  const loadedSkillIds = readStringArray(checkpoint.toolContext.values.loadedSkillIds);
  const publishedAssetIds = readStringArray(checkpoint.toolContext.values.publishedAssetIds);
  const completedAt = checkpoint.status === "running" ? undefined : nowIso();
  await updateRun(prepared.session.id, prepared.run.id, (run) => ({
    ...run,
    status: checkpoint.status,
    step: checkpoint.step,
    attempt: checkpoint.attempt,
    toolBatch: checkpoint.toolBatch,
    updatedAt: nowIso(),
    ...(completedAt ? { completedAt } : {}),
    artifactIds: [...new Set([...run.artifactIds, ...publishedAssetIds])],
  }), {
    messages: cloneMessages(checkpoint.messages),
    providerState: checkpoint.providerState,
    providerDebug: checkpoint.providerDebug,
    contextState: checkpoint.contextState,
    loadedSkillIds,
  });
}

async function finalizeLoopSession(
  prepared: PreparedLoopRun,
  result: LoopResult,
): Promise<SessionRecord> {
  const current = getSessionRecordOrThrow(prepared.session.id);
  if (!current.name && result.finalResponse) {
    const name = generateSessionName(result.finalResponse);
    if (name) return normalizeSessionRequestConfig(await store.updateSession(prepared.session.id, { name }));
  }
  return normalizeSessionRequestConfig(current);
}

function buildLoopRequest(
  prepared: PreparedLoopRun,
  handlers: Partial<Pick<
    LoopOptions,
    "onAssistantBlockDelta" | "onAssistantMessage" | "onAssistantAttemptDiscarded" | "onToolExecutionUpdate" | "onLoopState" | "onStats" | "onContextUsage"
  >> = {},
  emit?: (event: SSEEvent) => void,
): LoopOptions {
  const activeModeConfig = prepared.modeRuntimeConfigs[prepared.session.activeModeId]!;
  const runPermissionGrants = new Set<string>();
  const recordApprovalDecision = async (
    toolName: string,
    selectedKey: string,
    allowed: boolean,
    detail: string,
  ): Promise<void> => {
    const current = getSessionRecordOrThrow(prepared.session.id);
    const currentRun = current.runs.find((run) => run.id === prepared.run.id) ?? prepared.run;
    await appendRunEvent(prepared.session.id, prepared.run.id, {
      id: randomUUID(),
      runId: prepared.run.id,
      sessionId: prepared.session.id,
      anchorMessageId: prepared.run.userMessageId,
      kind: "tool_approval",
      severity: allowed ? "info" : "warning",
      visibility: "debug",
      terminal: false,
      errorCategory: "tool",
      code: selectedKey,
      message: allowed
        ? `${toolName} approval granted.`
        : `${toolName} approval denied.`,
      detail,
      step: currentRun.step,
      attempt: currentRun.attempt,
      createdAt: nowIso(),
    }, emit);
  };
  const initialToolContext: ToolRuntimeContext = {
    values: {
      ...prepared.loadedSkills,
      availableSkillIds: activeModeConfig.activeSkillIds,
      publishedAssetIds: [],
      assetPublishRoots: [...new Set([
        activeModeConfig.runtimeVariables?.FILESYSTEM_ROOT,
        activeModeConfig.runtimeVariables?.TERMINAL_ROOT,
      ].filter((value): value is string => Boolean(value)))],
    },
  };

  return {
    runId: prepared.run.id,
    userMessageId: prepared.run.userMessageId,
    agentId: prepared.session.agentId,
    sessionId: prepared.session.id,
    providerId: prepared.session.providerId,
    messages: cloneMessages(prepared.messages),
    model: prepared.session.model,
    buildRuntimeContext: ({ modeId, modeName, model, toolContext }) => buildRuntimeContext({
      sessionId: prepared.session.id,
      modeId,
      modeName: modeName ?? activeModeConfig.modePromptName,
      model,
      runtimeVariables: activeModeConfig.runtimeVariables,
      toolContext,
      assetContext: prepared.assetContext,
    }),
    llmRequestConfig: prepared.reasoning,
    providerState: prepared.session.providerState,
    contextState: prepared.session.contextState,
    resolveContextLimit: () => getEffectiveContextLimit(
      prepared.session.providerId,
      prepared.session.model,
    ),
    modelContentByMessageId: prepared.modelContentByMessageId,
    toolContext: initialToolContext,
    modeConfigs: prepared.modeRuntimeConfigs,
    activeModeId: prepared.session.activeModeId,
    agentVariables: prepared.agent.variables ?? {},
    executeTool: (toolName, args, mode, context) => {
      const modeRuntimeConfig = prepared.modeRuntimeConfigs[mode.id];
      const runtimeTool = modeRuntimeConfig?.runtimeToolsByName[toolName];
      if (!runtimeTool) {
        return Promise.resolve({
          content: `Tool "${toolName}" is not allowed or available in mode "${mode.id}".`,
          isError: true,
        });
      }
      return executeRuntimeTool(runtimeTool, toolName, args, context);
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
      if (policy.kind === "allow") return { allowed: true };
      if (policy.kind === "deny") return { allowed: false, reason: policy.reason };
      if (policy.runGrantKey && runPermissionGrants.has(policy.runGrantKey)) return { allowed: true };

      const promptId = `${toolName}-${randomUUID()}`;
      emitPrompt(prepared.session.id, {
        purpose: "approval",
        promptId,
        question: policy.question,
        choices: policy.choices,
      });
      const response = await waitForResponse(prepared.session.id, promptId);
      if (response.isError) {
        await recordApprovalDecision(toolName, "response_error", false, response.content);
        return { allowed: false, reason: response.content };
      }
      try {
        const parsed = JSON.parse(response.content) as { selectedKey?: string };
        if (parsed.selectedKey && policy.allowKeys.includes(parsed.selectedKey)) {
          if (
            policy.runGrantKey &&
            policy.grantForRunKeys?.includes(parsed.selectedKey)
          ) {
            runPermissionGrants.add(policy.runGrantKey);
          }
          await recordApprovalDecision(toolName, parsed.selectedKey, true, policy.question);
          return { allowed: true };
        }
        await recordApprovalDecision(toolName, parsed.selectedKey ?? "deny", false, policy.question);
      } catch {
        await recordApprovalDecision(toolName, "invalid_response", false, response.content);
      }
      return { allowed: false, reason: policy.deniedMessage ?? `Tool "${toolName}" was rejected by the user.` };
    },
    onRunEvent: (event) => appendRunEvent(prepared.session.id, prepared.run.id, event, emit),
    onModelInput: async (input) => {
      await updateRun(prepared.session.id, prepared.run.id, (run) => (
        run.modelInputs.some((existing) => existing.id === input.id)
          ? run
          : { ...run, updatedAt: nowIso(), modelInputs: [...run.modelInputs, input] }
      ));
    },
    onModelInputOutcome: async (inputId, outcome) => {
      await updateRun(prepared.session.id, prepared.run.id, (run) => ({
        ...run,
        updatedAt: nowIso(),
        modelInputs: run.modelInputs.map((input) => (
          input.id === inputId ? { ...input, outcome: structuredClone(outcome) } : input
        )),
      }));
    },
    onCheckpoint: (checkpoint) => persistCheckpoint(prepared, checkpoint),
    ...handlers,
  };
}

async function persistRuntimeNotices(prepared: PreparedLoopRun, emit?: (event: SSEEvent) => void): Promise<void> {
  const notices = prepared.modeRuntimeConfigs[prepared.session.activeModeId]?.runtimeNotices ?? [];
  for (const message of notices) {
    await appendRunEvent(prepared.session.id, prepared.run.id, {
      id: randomUUID(),
      runId: prepared.run.id,
      sessionId: prepared.session.id,
      anchorMessageId: prepared.run.userMessageId,
      kind: "provider_notice",
      severity: "warning",
      visibility: "debug",
      terminal: false,
      errorCategory: "configuration",
      code: "runtime_configuration_notice",
      message,
      step: 0,
      attempt: 0,
      createdAt: nowIso(),
    }, emit);
  }
}

async function markUnexpectedFailure(prepared: PreparedLoopRun, error: unknown, emit?: (event: SSEEvent) => void): Promise<SessionRecord> {
  const message = "The agent run failed before the loop could finish. The available state was preserved.";
  await appendRunEvent(prepared.session.id, prepared.run.id, {
    id: randomUUID(),
    runId: prepared.run.id,
    sessionId: prepared.session.id,
    anchorMessageId: prepared.run.userMessageId,
    kind: "run_failed",
    severity: "error",
    visibility: "user",
    terminal: true,
    errorCategory: "internal",
    code: "chat_engine_failure",
    message,
    detail: getErrorMessage(error).slice(0, 4000),
    step: 0,
    attempt: 0,
    createdAt: nowIso(),
  }, emit).catch(() => undefined);
  return updateRun(prepared.session.id, prepared.run.id, (run) => {
    const terminalEvent = run.events.find((event) => event.terminal);
    const status: AgentRunStatus = terminalEvent?.kind === "run_aborted"
      ? "aborted"
      : terminalEvent?.kind === "run_limit"
        ? "stopped"
        : "failed";
    return { ...run, status, updatedAt: nowIso(), completedAt: nowIso() };
  });
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
  assetIds?: string[],
): Promise<void> {
  const abortController = beginLoop(sessionId);
  let prepared: PreparedLoopRun | undefined;
  let interactionRegistered = false;

  try {
    const currentRun = await prepareLoopRun(sessionId, message, assetIds);
    prepared = currentRun;
    registerSession(sessionId, (payload) => emit({ type: "user_prompt", ...payload }));
    interactionRegistered = true;
    await persistRuntimeNotices(currentRun, emit);
    const result = await runWithSessionId(sessionId, () => runAgentLoop({
      ...buildLoopRequest(currentRun, {
        onAssistantBlockDelta: (messageId, block) => emit({ type: "assistant_block_delta", messageId, block }),
        onAssistantMessage: (messageObject) => emit({ type: "assistant_message_complete", message: messageObject }),
        onAssistantAttemptDiscarded: (messageIds) => emit({ type: "assistant_attempt_discarded", messageIds }),
        onToolExecutionUpdate: (toolUseId, toolName, status, resultMessage, detail, summary, input, metadata) =>
          emit({ type: "tool_execution_update", toolUseId, toolName, input, status, result: resultMessage, detail, summary, metadata }),
        onLoopState: (state) => emit({ type: "turn_state", state }),
        onStats: (stats) => emit({ type: "stats", inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, reasoningTokens: stats.reasoningTokens, source: stats.source }),
        onContextUsage: (usage) => emit({ type: "context_usage", usage }),
      }, emit),
      abortSignal: abortController.signal,
    }));
    emit({ type: "done", session: toPublicSession(await finalizeLoopSession(currentRun, result)) });
  } catch (error) {
    if (!prepared) throw error;
    emit({ type: "done", session: toPublicSession(await markUnexpectedFailure(prepared, error, emit)) });
  } finally {
    finishLoop(sessionId, abortController);
    if (interactionRegistered) unregisterSession(sessionId);
  }
}

export function abortSessionLoop(sessionId: string): boolean {
  const aborted = abortLoop(sessionId);
  if (aborted) cancelPendingPrompts(sessionId, "Run aborted while waiting for user response.");
  return aborted;
}
