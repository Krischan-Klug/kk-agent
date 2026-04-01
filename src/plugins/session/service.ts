import type { SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import { buildCapabilityInstructions, buildPrompt, getSystemVariables } from "../systemprompt/service.js";
import { getActiveModel, getModelSettings } from "../provider/service.js";
import type { ReasoningLevelConfig } from "../provider/types.js";
import { REASONING_LEVEL_DEFAULTS } from "../provider/defaults.js";
import { getToolDefinitions, executeTool, getKnownMcpIds, getRunnableMcpIds } from "../mcp/service.js";
import {
  executeSystemToolByName,
  getKnownSystemMcpIds,
  getRunnableSystemMcpIds,
  getSystemToolDefinitionsForActive,
} from "../tools/service.js";
import { runLoop } from "../loop/service.js";
import type { LoopMessage } from "../loop/types.js";
import { getAgent, setLoopState, clearLoopState } from "../agent/service.js";
import { getDefaults } from "../lib/defaults.js";
import { normalizeMcpId } from "../lib/ids.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import {
  registerSession,
  unregisterSession,
  runWithSessionId,
} from "../tools/lib/user-interaction/interaction-store.js";

function generateSessionName(content: string): string {
  const clean = content.trim();
  if (!clean) return "";
  if (clean.length <= 40) return clean.split("\n")[0];
  const cut = clean.slice(0, 40);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
}

function toLoopMessages(messages: SessionState["messages"]): LoopMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    reasoning: message.reasoning,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  }));
}

function fromLoopMessages(messages: LoopMessage[]): SessionState["messages"] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    reasoning: message.reasoning,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  }));
}

function sanitizeMcpIds(mcpIds: string[]): string[] {
  const knownIds = new Set(getKnownMcpIds());
  return [...new Set(mcpIds.map(normalizeMcpId))].filter((id) => knownIds.has(id));
}

function sanitizeToolIds(toolIds: string[]): string[] {
  const knownIds = new Set(getKnownSystemMcpIds());
  return [...new Set(toolIds.map(normalizeMcpId))].filter((id) => knownIds.has(id));
}

function getSessionRunnableMcpIds(activeToolIds: string[], activeMcpIds: string[]): string[] {
  const runnable = new Set([...getRunnableMcpIds(), ...getRunnableSystemMcpIds()]);
  return [...activeToolIds, ...activeMcpIds].filter((id) => runnable.has(id));
}

function buildRunnableMcpInstructions(
  activeToolIds: string[],
  activeMcpIds: string[],
  agentInstructions: Record<string, string>,
): string {
  return buildCapabilityInstructions(getSessionRunnableMcpIds(activeToolIds, activeMcpIds), agentInstructions);
}

function getCombinedToolDefinitions(activeToolIds: string[], activeMcpIds: string[]) {
  return [...getSystemToolDefinitionsForActive(activeToolIds), ...getToolDefinitions(activeMcpIds)];
}

async function executeCombinedTool(toolName: string, args: Record<string, unknown>) {
  const systemResult = await executeSystemToolByName(toolName, args);
  if (systemResult) return systemResult;
  return executeTool(toolName, args);
}

function buildCurrentSystemPrompt(
  sessionId: string,
  session: Pick<SessionState, "activeToolIds" | "activeMcpIds" | "systemPrompt" | "model">,
  agent: ReturnType<typeof getAgent>,
): string {
  const mcpInstr = buildRunnableMcpInstructions(
    session.activeToolIds,
    session.activeMcpIds,
    { ...agent.toolInstructions, ...agent.mcpInstructions },
  );

  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: session.model }),
    mcpInstructions: mcpInstr,
    ...agent.variables,
  };

  return buildPrompt(session.systemPrompt, mcpInstr, variables, {
    sessionId,
    phase: "executing",
    phasePrompt: agent.phasePrompts.executing,
  });
}

function resolveSessionToolIds(
  agent: ReturnType<typeof getAgent>,
  activeToolIds?: string[],
): string[] {
  if (activeToolIds !== undefined) return sanitizeToolIds(activeToolIds);
  return sanitizeToolIds(agent.toolIds ?? []);
}

function resolveSessionMcpIds(agent: ReturnType<typeof getAgent>, activeMcpIds?: string[]): string[] {
  return sanitizeMcpIds(activeMcpIds ?? agent.mcpIds ?? []);
}

function resolveSessionDefaults(
  agent: ReturnType<typeof getAgent>,
  body: Pick<CreateSessionBody, "activeToolIds" | "activeMcpIds" | "model" | "reasoningEffort" | "temperature">,
) {
  return {
    activeToolIds: resolveSessionToolIds(agent, body.activeToolIds),
    activeMcpIds: resolveSessionMcpIds(agent, body.activeMcpIds),
    model: body.model ?? agent.defaultModel ?? getActiveModel(),
    reasoningEffort: body.reasoningEffort ?? agent.reasoningEffort,
    temperature: body.temperature ?? agent.temperature,
  };
}

export function createSession(body: CreateSessionBody): SessionState {
  const agent = getAgent(body.agentId);
  const defaults = resolveSessionDefaults(agent, body);
  const session = store.createSession({
    agentId: body.agentId,
    model: defaults.model,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    systemPrompt: agent.systemPrompt,
    reasoningEffort: defaults.reasoningEffort,
    temperature: defaults.temperature,
  });
  return session;
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
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);
  const agent = getAgent(session.agentId);
  return buildCurrentSystemPrompt(sessionId, session, agent);
}

function resolveReasoningConfig(session: SessionState): {
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
} {
  const ms = getModelSettings(session.model);
  const effort = session.reasoningEffort ?? ms.reasoningEffort ?? getDefaults().reasoning.defaultEffort;
  const levelConfig: ReasoningLevelConfig | undefined = ms.levels?.[effort];
  const defaults = REASONING_LEVEL_DEFAULTS[effort];
  return {
    reasoningEffort: effort,
    temperature: session.temperature ?? levelConfig?.temperature ?? defaults?.temperature,
    maxOutputTokens: levelConfig?.maxOutputTokens ?? defaults?.maxOutputTokens,
  };
}

function prepareLoopRun(sessionId: string, message: string) {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);
  const messages = [...session.messages, { role: "user" as const, content: message }];
  store.updateSession(sessionId, { messages });

  return {
    session,
    agent,
    messages,
    tools: getCombinedToolDefinitions(session.activeToolIds, session.activeMcpIds),
    reasoning: resolveReasoningConfig(session),
    mcpInstructions: buildRunnableMcpInstructions(
      session.activeToolIds,
      session.activeMcpIds,
      { ...agent.toolInstructions, ...agent.mcpInstructions },
    ),
  };
}

function finalizeLoopSession(
  sessionId: string,
  session: SessionState,
  messages: LoopMessage[],
  finalResponse: string,
): SessionState {
  const nextMessages = fromLoopMessages(messages);
  const patch: Partial<SessionState> = { messages: nextMessages };
  if (!session.name && finalResponse) {
    const name = generateSessionName(finalResponse);
    if (name) patch.name = name;
  }
  return store.updateSession(sessionId, patch);
}

function buildLoopRequest(
  prepared: ReturnType<typeof prepareLoopRun>,
  sessionId: string,
  handlers: Parameters<typeof runLoop>[0] extends infer T ? Partial<T> : never = {},
) {
  return {
    agentId: prepared.session.agentId,
    sessionId,
    messages: toLoopMessages(prepared.messages),
    model: prepared.session.model,
    reasoningEffort: prepared.reasoning.reasoningEffort,
    temperature: prepared.reasoning.temperature,
    maxOutputTokens: prepared.reasoning.maxOutputTokens,
    systemPrompt: prepared.session.systemPrompt,
    maxIterations: prepared.agent.maxIterations,
    loopMode: prepared.agent.loopMode,
    phasePrompts: prepared.agent.phasePrompts ?? {},
    mcpInstructions: prepared.mcpInstructions,
    agentVariables: prepared.agent.variables ?? {},
    phase: prepared.agent.loopMode === "simple" ? "executing" as const : "planning" as const,
    allTools: prepared.tools,
    executeTool: executeCombinedTool,
    ...handlers,
  };
}

export async function chat(
  sessionId: string,
  message: string,
): Promise<{ response: string; session: SessionState }> {
  const prepared = prepareLoopRun(sessionId, message);
  const result = await runLoop(buildLoopRequest(prepared, sessionId));
  return {
    response: result.finalResponse,
    session: finalizeLoopSession(sessionId, prepared.session, result.messages, result.finalResponse),
  };
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
): Promise<void> {
  const prepared = prepareLoopRun(sessionId, message);

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
        onRetryNotice: (message) => emit({ type: "retry_notice", message }),
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
    const updatedSession = finalizeLoopSession(sessionId, prepared.session, result.messages, result.finalResponse);
    emit({ type: "done", session: updatedSession });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  } finally {
    unregisterSession(sessionId);
  }
}

export function patchSession(
  id: string,
  update: {
    agentId?: string;
    model?: string;
    activeToolIds?: string[];
    activeMcpIds?: string[];
    reasoningEffort?: string;
    temperature?: number;
  },
): SessionState {
  const patch: Partial<SessionState> = {};
  if (update.agentId !== undefined) {
    const agent = getAgent(update.agentId);
    const defaults = resolveSessionDefaults(agent, update);
    patch.agentId = update.agentId;
    patch.systemPrompt = agent.systemPrompt;
    if (update.activeToolIds === undefined) {
      patch.activeToolIds = defaults.activeToolIds;
    }
    if (update.activeMcpIds === undefined) {
      patch.activeMcpIds = defaults.activeMcpIds;
    }
    if (update.model === undefined) {
      patch.model = defaults.model;
    }
    if (update.reasoningEffort === undefined) {
      patch.reasoningEffort = defaults.reasoningEffort;
    }
    if (update.temperature === undefined) {
      patch.temperature = defaults.temperature;
    }
  }
  if (update.model) patch.model = update.model;
  if (update.activeToolIds !== undefined) {
    patch.activeToolIds = sanitizeToolIds(update.activeToolIds);
  }
  if (update.activeMcpIds !== undefined) {
    patch.activeMcpIds = sanitizeMcpIds(update.activeMcpIds);
  }
  if (update.reasoningEffort !== undefined) {
    patch.reasoningEffort = update.reasoningEffort as SessionState["reasoningEffort"];
  }
  if (update.temperature !== undefined) {
    patch.temperature = update.temperature;
  }
  return store.updateSession(id, patch);
}

export function removeMcpFromSessions(mcpId: string): void {
  for (const session of listSessions()) {
    if (!session.activeMcpIds.includes(mcpId)) continue;
    const nextMcpIds = session.activeMcpIds.filter((id) => id !== mcpId);
    store.updateSession(session.id, {
      activeMcpIds: nextMcpIds,
    });
  }
}

export function removeToolFromSessions(toolId: string): void {
  for (const session of listSessions()) {
    if (!session.activeToolIds.includes(toolId)) continue;
    const nextToolIds = session.activeToolIds.filter((id) => id !== toolId);
    store.updateSession(session.id, {
      activeToolIds: nextToolIds,
    });
  }
}
