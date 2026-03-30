import type { SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import { buildMcpInstructions, buildPrompt, getSystemVariables } from "../systemprompt/service.js";
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
  const knownIds = new Set([...getKnownMcpIds(), ...getKnownSystemMcpIds()]);
  return [...new Set(mcpIds.map((id) => (id === "commands" ? "terminal" : id)))].filter((id) => knownIds.has(id));
}

function getSessionRunnableMcpIds(activeMcpIds: string[]): string[] {
  const runnable = new Set([...getRunnableMcpIds(), ...getRunnableSystemMcpIds()]);
  return activeMcpIds.filter((id) => runnable.has(id));
}

function buildRunnableMcpInstructions(
  activeMcpIds: string[],
  agentMcpInstructions: Record<string, string>,
): string {
  return buildMcpInstructions(getSessionRunnableMcpIds(activeMcpIds), agentMcpInstructions);
}

function getCombinedToolDefinitions(activeMcpIds: string[]) {
  return [...getSystemToolDefinitionsForActive(activeMcpIds), ...getToolDefinitions(activeMcpIds)];
}

async function executeCombinedTool(toolName: string, args: Record<string, unknown>) {
  const systemResult = await executeSystemToolByName(toolName, args);
  if (systemResult) return systemResult;
  return executeTool(toolName, args);
}

function buildCurrentSystemPrompt(
  session: Pick<SessionState, "activeMcpIds" | "systemPrompt" | "model">,
  agent: ReturnType<typeof getAgent>,
): string {
  const mcpInstr = buildRunnableMcpInstructions(session.activeMcpIds, agent.mcpInstructions);

  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: session.model }),
    mcpInstructions: mcpInstr,
    ...agent.variables,
  };

  return buildPrompt(session.systemPrompt, mcpInstr, variables);
}

export function createSession(body: CreateSessionBody): SessionState {
  const agent = getAgent(body.agentId);

  const activeMcpIds = sanitizeMcpIds(body.activeMcpIds ?? agent.mcpIds ?? []);

  const model = body.model ?? agent.defaultModel ?? getActiveModel();
  const reasoningEffort = body.reasoningEffort ?? agent.reasoningEffort;
  const temperature = body.temperature ?? agent.temperature;
  const session = store.createSession({
    agentId: body.agentId,
    model,
    activeMcpIds,
    systemPrompt: agent.systemPrompt,
    reasoningEffort,
    temperature,
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
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = store.getSession(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);
  const agent = getAgent(session.agentId);
  return buildCurrentSystemPrompt(session, agent);
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

export async function chat(
  sessionId: string,
  message: string,
): Promise<{ response: string; session: SessionState }> {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  const userMessages = [...session.messages, { role: "user" as const, content: message }];
  store.updateSession(sessionId, { messages: userMessages });

  const tools = getCombinedToolDefinitions(session.activeMcpIds);
  const rc = resolveReasoningConfig(session);

  const result = await runLoop({
    agentId: session.agentId,
    sessionId,
    messages: toLoopMessages(userMessages),
    model: session.model,
    reasoningEffort: rc.reasoningEffort,
    temperature: rc.temperature,
    maxOutputTokens: rc.maxOutputTokens,
    systemPrompt: session.systemPrompt,
    maxIterations: agent.maxIterations,
    mcpInstructions: buildRunnableMcpInstructions(session.activeMcpIds, agent.mcpInstructions),
    agentVariables: agent.variables ?? {},
    allTools: tools,
    executeTool: executeCombinedTool,
  });

  const finalMessages = fromLoopMessages(result.messages);
  const update: Partial<SessionState> = { messages: finalMessages };
  if (!session.name) {
    const name = generateSessionName(result.finalResponse);
    if (name) update.name = name;
  }
  const updatedSession = store.updateSession(sessionId, update);

  return { response: result.finalResponse, session: updatedSession };
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
): Promise<void> {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  const userMessages = [...session.messages, { role: "user" as const, content: message }];
  store.updateSession(sessionId, { messages: userMessages });

  const tools = getCombinedToolDefinitions(session.activeMcpIds);
  const rc = resolveReasoningConfig(session);

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
      runLoop({
        agentId: session.agentId,
        sessionId,
        messages: toLoopMessages(userMessages),
        model: session.model,
        reasoningEffort: rc.reasoningEffort,
        temperature: rc.temperature,
        maxOutputTokens: rc.maxOutputTokens,
        systemPrompt: session.systemPrompt,
        maxIterations: agent.maxIterations,
        mcpInstructions: buildRunnableMcpInstructions(session.activeMcpIds, agent.mcpInstructions),
        agentVariables: agent.variables ?? {},
        allTools: tools,
        executeTool: executeCombinedTool,
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
      }),
    );

    const finalMessages = fromLoopMessages(result.messages);
    const streamUpdate: Partial<SessionState> = { messages: finalMessages };
    if (!session.name && result.finalResponse) {
      const name = generateSessionName(result.finalResponse);
      if (name) streamUpdate.name = name;
    }
    const updatedSession = store.updateSession(sessionId, streamUpdate);
    emit({ type: "done", session: updatedSession });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  } finally {
    unregisterSession(sessionId);
  }
}

export function patchSession(
  id: string,
  update: { agentId?: string; model?: string; activeMcpIds?: string[]; reasoningEffort?: string; temperature?: number },
): SessionState {
  const patch: Partial<SessionState> = {};
  if (update.agentId !== undefined) {
    const agent = getAgent(update.agentId);
    patch.agentId = update.agentId;
    patch.systemPrompt = agent.systemPrompt;
    if (update.activeMcpIds === undefined) {
      patch.activeMcpIds = sanitizeMcpIds(agent.mcpIds ?? []);
    }
    if (update.model === undefined) {
      patch.model = agent.defaultModel ?? getActiveModel();
    }
    if (update.reasoningEffort === undefined) {
      patch.reasoningEffort = agent.reasoningEffort;
    }
    if (update.temperature === undefined) {
      patch.temperature = agent.temperature;
    }
  }
  if (update.model) patch.model = update.model;
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
