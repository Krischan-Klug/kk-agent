import type { SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import { buildMcpInstructions, buildPrompt, getSystemVariables } from "../systemprompt/service.js";
import { getActiveModel, getModelSettings, getModels } from "../provider/service.js";
import type { ReasoningLevelConfig } from "../provider/types.js";
import { REASONING_LEVEL_DEFAULTS } from "../provider/defaults.js";
import { getToolDefinitions, executeTool, getKnownMcpIds, getRunnableMcpIds } from "../mcp/service.js";
import { runLoop } from "../loop/service.js";
import type { LoopMessage } from "../loop/types.js";
import { getAgent, setLoopState, clearLoopState } from "../agent/service.js";

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
    kind: message.kind,
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
    kind: message.kind,
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
  return [...new Set(mcpIds)].filter((id) => knownIds.has(id));
}

function getSessionRunnableMcpIds(activeMcpIds: string[]): string[] {
  const runnable = new Set(getRunnableMcpIds());
  return activeMcpIds.filter((id) => runnable.has(id));
}

function buildResolvedSystemPrompt(
  session: Pick<SessionState, "activeMcpIds">,
  agent: ReturnType<typeof getAgent>,
): string {
  const runnableMcpIds = getSessionRunnableMcpIds(session.activeMcpIds);
  const mcpInstr = buildMcpInstructions(runnableMcpIds, agent.mcpInstructions);

  const variables: Record<string, string> = {
    ...getSystemVariables(),
    mcpInstructions: mcpInstr,
    ...agent.variables,
  };

  return buildPrompt(agent.systemPrompt, mcpInstr, variables);
}

export function createSession(body: CreateSessionBody): SessionState {
  const agent = getAgent(body.agentId);

  const agentMcpIds = agent.mcpIds ?? [];
  const bodyMcpIds = body.activeMcpIds ?? [];
  const activeMcpIds = sanitizeMcpIds([...agentMcpIds, ...bodyMcpIds]);

  const model = body.model ?? agent.defaultModel ?? getActiveModel();
  const reasoningEffort = body.reasoningEffort ?? agent.reasoningEffort;
  const systemPrompt = buildResolvedSystemPrompt({ activeMcpIds }, agent);

  return store.createSession({
    agentId: body.agentId,
    model,
    activeMcpIds,
    systemPrompt,
    reasoningEffort,
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
}

export function getCurrentSystemPrompt(sessionId: string): string {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);
  return buildResolvedSystemPrompt(session, agent);
}

function resolveReasoningConfig(session: SessionState): {
  reasoningEffort?: string;
  temperature?: number;
  maxOutputTokens?: number;
} {
  const ms = getModelSettings(session.model);
  const effort = session.reasoningEffort ?? ms.reasoningEffort ?? "medium";
  const levelConfig: ReasoningLevelConfig | undefined = ms.levels?.[effort];
  const defaults = REASONING_LEVEL_DEFAULTS[effort];
  return {
    reasoningEffort: effort,
    temperature: session.temperature ?? levelConfig?.temperature ?? defaults?.temperature,
    maxOutputTokens: levelConfig?.maxOutputTokens ?? defaults?.maxOutputTokens,
  };
}

async function resolveCompactionConfig(session: SessionState, agent: ReturnType<typeof getAgent>) {
  const ms = getModelSettings(session.model);
  const compactionPrompt = agent.compactionPrompt ?? ms.compactionPrompt;
  let maxContextTokens: number | undefined;
  try {
    const models = await getModels();
    const modelInfo = models.find((m) => m.id === session.model);
    maxContextTokens = modelInfo?.contextLength ?? modelInfo?.maxContextLength;
  } catch {
    // Model info not available — compaction disabled
  }
  return { compactionPrompt, maxContextTokens, compactionThreshold: agent.compactionThreshold };
}

export async function chat(
  sessionId: string,
  message: string,
): Promise<{ response: string; session: SessionState }> {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  const userMessages = [...session.messages, { role: "user" as const, content: message }];
  const sessionWithUserMessage = store.updateSession(sessionId, { messages: userMessages });

  const tools = getToolDefinitions(sessionWithUserMessage.activeMcpIds);
  const rc = resolveReasoningConfig(sessionWithUserMessage);
  const cc = await resolveCompactionConfig(sessionWithUserMessage, agent);

  const result = await runLoop({
    agentId: sessionWithUserMessage.agentId,
    sessionId,
    messages: toLoopMessages(sessionWithUserMessage.messages),
    model: sessionWithUserMessage.model,
    reasoningEffort: rc.reasoningEffort,
    temperature: rc.temperature,
    maxOutputTokens: rc.maxOutputTokens,
    systemPrompt: agent.systemPrompt,
    maxIterations: agent.maxIterations,
    mcpInstructions: buildMcpInstructions(getSessionRunnableMcpIds(sessionWithUserMessage.activeMcpIds), agent.mcpInstructions),
    agentVariables: agent.variables ?? {},
    allTools: tools,
    executeTool,
    maxContextTokens: cc.maxContextTokens,
    compactionPrompt: cc.compactionPrompt,
    compactionThreshold: cc.compactionThreshold,
  });

  const finalMessages = fromLoopMessages(result.messages);
  const update: Partial<SessionState> = { messages: finalMessages };
  if (!sessionWithUserMessage.name) {
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
  const sessionWithUserMessage = store.updateSession(sessionId, { messages: userMessages });

  const tools = getToolDefinitions(sessionWithUserMessage.activeMcpIds);
  const rc = resolveReasoningConfig(sessionWithUserMessage);
  const cc = await resolveCompactionConfig(sessionWithUserMessage, agent);

  try {
    const result = await runLoop({
      agentId: sessionWithUserMessage.agentId,
      sessionId,
      messages: toLoopMessages(sessionWithUserMessage.messages),
      model: sessionWithUserMessage.model,
      reasoningEffort: rc.reasoningEffort,
      temperature: rc.temperature,
      maxOutputTokens: rc.maxOutputTokens,
      systemPrompt: agent.systemPrompt,
      maxIterations: agent.maxIterations,
      mcpInstructions: buildMcpInstructions(getSessionRunnableMcpIds(sessionWithUserMessage.activeMcpIds), agent.mcpInstructions),
      agentVariables: agent.variables ?? {},
      allTools: tools,
      executeTool,
      maxContextTokens: cc.maxContextTokens,
      compactionPrompt: cc.compactionPrompt,
      compactionThreshold: cc.compactionThreshold,
      onContent: (content) => emit({ type: "content", content }),
      onReasoning: (content) => emit({ type: "reasoning", content }),
      onRetryNotice: (message) => emit({ type: "retry_notice", message }),
      onCompaction: (message) =>
        emit({
          type: "compaction",
          message: {
            role: message.role,
            content: message.content,
            kind: message.kind,
            reasoning: message.reasoning,
            tool_call_id: message.tool_call_id,
            tool_calls: message.tool_calls?.map((toolCall) => ({
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            })),
          },
        }),
      onToolCall: (tc) =>
        emit({ type: "tool_call", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } }),
      onToolResult: (toolCallId, result) =>
        emit({ type: "tool_result", toolCallId, content: result.content, isError: result.isError }),
      onLoopState: (state) => {
        setLoopState(sessionId, state);
        emit({ type: "loop_state", state });
      },
      onStats: (stats) =>
        emit({ type: "stats", inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, reasoningTokens: stats.reasoningTokens }),
    });

    const finalMessages = fromLoopMessages(result.messages);
    const streamUpdate: Partial<SessionState> = { messages: finalMessages };
    if (!sessionWithUserMessage.name && result.finalResponse) {
      const name = generateSessionName(result.finalResponse);
      if (name) streamUpdate.name = name;
    }
    const updatedSession = store.updateSession(sessionId, streamUpdate);
    emit({ type: "done", session: updatedSession });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  }
}

export function patchSession(
  id: string,
  update: { model?: string; activeMcpIds?: string[]; reasoningEffort?: string; temperature?: number },
): SessionState {
  const session = getSession(id);
  const agent = getAgent(session.agentId);
  const patch: Partial<SessionState> = {};
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
  const nextSession = { ...session, ...patch };
  patch.systemPrompt = buildResolvedSystemPrompt(nextSession, agent);
  return store.updateSession(id, patch);
}

export function removeMcpFromSessions(mcpId: string): void {
  for (const session of listSessions()) {
    if (!session.activeMcpIds.includes(mcpId)) continue;
    const nextMcpIds = session.activeMcpIds.filter((id) => id !== mcpId);
    const agent = getAgent(session.agentId);
    store.updateSession(session.id, {
      activeMcpIds: nextMcpIds,
      systemPrompt: buildResolvedSystemPrompt({ ...session, activeMcpIds: nextMcpIds }, agent),
    });
  }
}
