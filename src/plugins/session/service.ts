import type { SessionState, CreateSessionBody, SSEEvent } from "./types.js";
import * as store from "./lib/store.js";
import { compactMessages } from "./lib/anchor.js";
import { buildMcpInstructions } from "../systemprompt/service.js";
import { getActiveModel, getModelSettings } from "../provider/service.js";
import type { ReasoningLevelConfig } from "../provider/types.js";
import { REASONING_LEVEL_DEFAULTS } from "../provider/defaults.js";
import { getToolDefinitions, executeTool } from "../mcp/service.js";
import { runLoop } from "../loop/service.js";
import { getAgent, setLoopState, clearLoopState } from "../agent/service.js";

function generateSessionName(content: string): string {
  const clean = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!clean) return "";
  if (clean.length <= 40) return clean.split("\n")[0];
  const cut = clean.slice(0, 40);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
}

export function createSession(body: CreateSessionBody): SessionState {
  const agent = getAgent(body.agentId);

  // Merge MCPs: agent's MCPs + any explicit MCPs from the body
  const agentMcpIds = agent.mcpIds ?? [];
  const bodyMcpIds = body.activeMcpIds ?? [];
  const activeMcpIds = [...new Set([...agentMcpIds, ...bodyMcpIds])];

  const model = body.model ?? agent.defaultModel ?? getActiveModel();

  // Build initial system prompt from agent's base prompt + MCP instructions
  const mcpInstr = buildMcpInstructions(activeMcpIds, agent.mcpInstructions);
  const systemPrompt = mcpInstr
    ? `${agent.promptTemplates.base}\n\n---\n\n${mcpInstr}`
    : agent.promptTemplates.base;

  const reasoningEffort = body.reasoningEffort ?? agent.reasoningEffort;

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

function resolveReasoningConfig(session: SessionState): {
  reasoningEffort?: "off" | "low" | "medium" | "high" | "on";
  temperature?: number;
  maxOutputTokens?: number;
} {
  const ms = getModelSettings(session.model);
  const effort = session.reasoningEffort ?? ms.reasoningEffort;
  const levelConfig: ReasoningLevelConfig | undefined = effort ? ms.levels?.[effort] : undefined;
  const defaults = effort ? REASONING_LEVEL_DEFAULTS[effort] : undefined;
  return {
    reasoningEffort: effort,
    temperature: levelConfig?.temperature ?? defaults?.temperature,
    maxOutputTokens: levelConfig?.maxOutputTokens ?? defaults?.maxOutputTokens,
  };
}

export async function chat(
  sessionId: string,
  message: string,
): Promise<{ response: string; session: SessionState }> {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  session.messages.push({ role: "user", content: message });

  const tools = getToolDefinitions(session.activeMcpIds);
  const mcpInstr = buildMcpInstructions(session.activeMcpIds, agent.mcpInstructions);
  const rc = resolveReasoningConfig(session);

  const result = await runLoop({
    agentId: session.agentId,
    sessionId,
    messages: session.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "tool" | "system",
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    })),
    model: session.model,
    reasoningEffort: rc.reasoningEffort,
    temperature: rc.temperature,
    maxOutputTokens: rc.maxOutputTokens,
    strategy: agent.loopStrategy,
    promptTemplates: agent.promptTemplates,
    mcpInstructions: mcpInstr,
    agentVariables: agent.variables ?? {},
    allTools: tools,
    executeTool,
  });

  session.messages = result.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "tool",
    content: m.content,
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    })),
  }));

  const update: Partial<SessionState> = { messages: session.messages };
  if (!session.name) {
    const name = generateSessionName(result.finalResponse);
    if (name) update.name = name;
  }
  store.updateSession(sessionId, update);

  return { response: result.finalResponse, session };
}

export async function chatStream(
  sessionId: string,
  message: string,
  emit: (event: SSEEvent) => void,
): Promise<void> {
  const session = getSession(sessionId);
  const agent = getAgent(session.agentId);

  session.messages.push({ role: "user", content: message });

  const tools = getToolDefinitions(session.activeMcpIds);
  const mcpInstr = buildMcpInstructions(session.activeMcpIds, agent.mcpInstructions);
  const rc = resolveReasoningConfig(session);

  try {
    const result = await runLoop({
      agentId: session.agentId,
      sessionId,
      messages: session.messages.map((m) => ({
        role: m.role as "user" | "assistant" | "tool" | "system",
        content: m.content,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
      })),
      model: session.model,
      reasoningEffort: rc.reasoningEffort,
      temperature: rc.temperature,
      maxOutputTokens: rc.maxOutputTokens,
      strategy: agent.loopStrategy,
      promptTemplates: agent.promptTemplates,
      mcpInstructions: mcpInstr,
      agentVariables: agent.variables ?? {},
      allTools: tools,
      executeTool,
      onContent: (content) => emit({ type: "content", content }),
      onReasoning: (content) => emit({ type: "reasoning", content }),
      onToolCall: (tc) =>
        emit({ type: "tool_call", toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } }),
      onToolResult: (toolCallId, result) =>
        emit({ type: "tool_result", toolCallId, content: result.content, isError: result.isError }),
      onPhaseChange: (from, to, reason) =>
        emit({ type: "phase_change", from, to, reason }),
      onLoopState: (state) => {
        setLoopState(sessionId, state);
        emit({ type: "loop_state", state });
      },
      onStats: (stats) =>
        emit({ type: "stats", inputTokens: stats.inputTokens, outputTokens: stats.outputTokens, reasoningTokens: stats.reasoningTokens }),
    });

    session.messages = result.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    }));

    const streamUpdate: Partial<SessionState> = { messages: session.messages };
    if (!session.name && result.finalResponse) {
      const name = generateSessionName(result.finalResponse);
      if (name) streamUpdate.name = name;
    }
    store.updateSession(sessionId, streamUpdate);
    emit({ type: "done", session });
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
  }
}

export function patchSession(
  id: string,
  update: { model?: string; activeMcpIds?: string[]; reasoningEffort?: string },
): SessionState {
  getSession(id);
  const patch: Partial<SessionState> = {};
  if (update.model) patch.model = update.model;
  if (update.activeMcpIds) {
    patch.activeMcpIds = update.activeMcpIds;
  }
  if (update.reasoningEffort !== undefined) {
    patch.reasoningEffort = update.reasoningEffort as SessionState["reasoningEffort"];
  }
  return store.updateSession(id, patch);
}

export function compactSession(sessionId: string, keepLast?: number): SessionState {
  const session = getSession(sessionId);
  compactMessages(session, keepLast);
  return store.updateSession(sessionId, { messages: session.messages });
}
