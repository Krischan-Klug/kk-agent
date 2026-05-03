import type { SessionPromptDebug, SessionRecord, SessionState, CreateSessionBody } from "./types.js";
import * as store from "./lib/store.js";
import { clearSessionAttachments } from "./lib/attachments.js";
import { getAllMcpsCached, getMcpTools, getRunnableMcpIds } from "../mcp/service.js";
import { clearSystemReminders, enqueueSystemReminder } from "../loop/lib/system-reminder.js";
import { getAgent, getLoopState, clearLoopState } from "../agent/service.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import { clearFilesystemReadState } from "../tools/lib/filesystem/read-state.js";
import { resolveSessionDefaults } from "./lib/session-resolution.js";
import { clearSessionDenials } from "./lib/denial-log.js";
import { getModelCapabilities } from "../provider/service.js";
import { listSkills } from "../skills/service.js";
import { NotFoundError } from "../../lib/errors.js";
import {
  getSessionRecordOrThrow,
  normalizeSessionRequestConfig,
  toPublicSession,
} from "./lib/session-records.js";
import {
  buildAttachmentMetaMessages,
  buildCurrentSystemPrompt,
  buildModeRuntimeConfig,
  buildRuntimeMetaMessages,
  extractMetaMessageTexts,
  getLatestAttachmentRefs,
} from "./lib/runtime-context.js";

export { getSessionRecordOrThrow, normalizeSessionRequestConfig, toPublicSession } from "./lib/session-records.js";
export {
  buildAttachmentMetaMessages,
  buildModeRuntimeConfig,
  buildRuntimeMetaMessages,
  type SessionModeRuntimeConfig,
} from "./lib/runtime-context.js";

export async function createSession(body: CreateSessionBody): Promise<SessionState> {
  const agent = getAgent(body.agentId);
  const defaults = await resolveSessionDefaults(agent, body);
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
  if (switchingAgent) clearLoopState(id);
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
