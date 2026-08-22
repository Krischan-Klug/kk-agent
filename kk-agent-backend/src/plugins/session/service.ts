import type { SessionPromptDebug, SessionRecord, SessionState, CreateSessionBody } from "./types.js";
import * as store from "./lib/store.js";
import { getAllMcpsCached, getMcpTools, getRunnableMcpIds } from "../mcp/service.js";
import { getAgent } from "../agent/service.js";
import { isLoopActive } from "../loop/lib/run-registry.js";
import { clearSessionFacts, clearTasks } from "../tools/service.js";
import { getSecuritySettings } from "../security/service.js";
import { clearFilesystemReadState } from "../tools/lib/filesystem/read-state.js";
import { resolveSessionDefaults } from "./lib/session-resolution.js";
import { getModelCapabilities } from "../provider/service.js";
import { buildLoadedSkillContexts, listSkills } from "../skills/service.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import {
  getSessionRecordOrThrow,
  normalizeSessionRequestConfig,
  toPublicSession,
} from "./lib/session-records.js";
import {
  buildAssetRuntimeContext,
  buildCurrentSystemPrompt,
  buildModeRuntimeConfig,
  buildRuntimeContext,
  getLatestAssetRefs,
} from "./lib/runtime-context.js";
import { getSessionAssetsByIds } from "./lib/assets.js";
import { getHarnessInstructionCatalog } from "../lib/defaults.js";
import { getTerminalShellResolution } from "../tools/lib/terminal/shell-profile.js";
import { OUTPUT_CONTINUE_INSTRUCTION } from "../loop/lib/recovery.js";
import { COMPACTION_INSTRUCTIONS } from "../loop/lib/context-compaction.js";

export { getSessionRecordOrThrow, normalizeSessionRequestConfig, toPublicSession } from "./lib/session-records.js";
export {
  buildAssetRuntimeContext,
  buildModeRuntimeConfig,
  buildRuntimeContext,
  type SessionModeRuntimeConfig,
} from "./lib/runtime-context.js";

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function createSession(body: CreateSessionBody): Promise<SessionState> {
  const agent = getAgent(body.agentId);
  const defaults = await resolveSessionDefaults(agent, body);
  return toPublicSession(await store.createSession({
    agentId: body.agentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeModeId: defaults.activeModeId,
    approvalMode: body.approvalMode ?? getSecuritySettings().approvalMode,
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
  if (isLoopActive(id)) {
    throw new ConflictError(`Session "${id}" cannot be deleted while a run is active.`);
  }
  if (!(await store.deleteSession(id))) throw new NotFoundError("Session", id);
  clearTasks(id);
  clearSessionFacts(id);
  clearFilesystemReadState(id);
}

export function getCurrentPromptDebug(sessionId: string): SessionPromptDebug {
  const session = getSessionRecordOrThrow(sessionId);
  const agent = getAgent(session.agentId);
  const modeRuntimeConfig = buildModeRuntimeConfig(session, agent, session.activeModeId);
  const systemPrompt = buildCurrentSystemPrompt(sessionId, session, agent);
  const latestAssetRefs = isLoopActive(sessionId) ? getLatestAssetRefs(session.messages) : [];
  const latestAssets = getSessionAssetsByIds(sessionId, latestAssetRefs.map((ref) => ref.assetId));
  const capabilities = getModelCapabilities(session.providerId, session.model);
  const assetContext = buildAssetRuntimeContext({
    assets: latestAssets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      kind: asset.kind,
      size: asset.size,
    })),
    imageInputSupported: capabilities?.inputModalities.includes("image") === true,
  });
  const loadedSkills = buildLoadedSkillContexts(
    session.loadedSkillIds,
    modeRuntimeConfig.activeSkillIds,
  );
  const latestRun = session.runs.at(-1);
  const shellResolution = getTerminalShellResolution();

  return {
    systemPrompt,
    runtimeContext: buildRuntimeContext({
      sessionId,
      modeId: modeRuntimeConfig.modeId,
      modeName: modeRuntimeConfig.modePromptName,
      model: session.model,
      runtimeVariables: modeRuntimeConfig.runtimeVariables,
      toolContext: { values: loadedSkills },
      assetContext,
    }),
    runtimeTools: Object.values(modeRuntimeConfig.runtimeToolsByName).map((tool) => ({
      name: tool.name,
      description: tool.description,
      capabilityId: tool.capabilityId,
      source: tool.source,
      inputSchema: tool.parameters,
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
        path: skill.path,
        source: skill.source,
        resources: [...skill.resources],
        loaded: session.loadedSkillIds.includes(skill.id),
      })),
    modelInputs: structuredClone(latestRun?.modelInputs ?? []),
    harnessInstructions: [
      ...getHarnessInstructionCatalog(),
      {
        id: "context.auto-compaction",
        source: "Agent loop",
        activation: "Used in a separate no-tools model pass when the effective runtime context reaches its reserved threshold.",
        text: COMPACTION_INSTRUCTIONS,
      },
      {
        id: "recovery.output-continue",
        source: "Agent loop",
        activation: "Added only when a response reached its output-token limit and continuation recovery is available.",
        text: OUTPUT_CONTINUE_INSTRUCTION,
      },
    ],
    runtimeDiagnostics: {
      terminalShell: shellResolution.status === "available"
        ? {
            status: shellResolution.status,
            kind: shellResolution.profile.kind,
            dialect: shellResolution.profile.dialect,
            executable: shellResolution.profile.executable,
            displayName: shellResolution.profile.displayName,
            version: shellResolution.profile.version,
            pathConvention: shellResolution.profile.pathConvention,
            syntaxRules: shellResolution.profile.syntaxRules,
          }
        : shellResolution,
    },
  };
}

async function updateSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  const session = getSessionRecordOrThrow(id);
  if (isLoopActive(id)) {
    throw new ConflictError(`Session "${id}" cannot be changed while a run is active.`);
  }
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
  const runtimeContextChanged = switchingAgent
    || session.providerId !== defaults.providerId
    || session.model !== defaults.model
    || session.activeModeId !== defaults.activeModeId
    || !sameIds(session.activeToolIds, defaults.activeToolIds)
    || !sameIds(session.activeMcpIds, defaults.activeMcpIds)
    || !sameIds(session.activeSkillIds, defaults.activeSkillIds);

  const patch: Partial<SessionRecord> = {
    agentId: nextAgentId,
    providerId: defaults.providerId,
    model: defaults.model,
    activeModeId: defaults.activeModeId,
    approvalMode: body.approvalMode ?? session.approvalMode,
    activeToolIds: defaults.activeToolIds,
    activeMcpIds: defaults.activeMcpIds,
    activeSkillIds: defaults.activeSkillIds,
    loadedSkillIds: switchingAgent
      ? []
      : session.loadedSkillIds.filter((skillId) => defaults.activeSkillIds.includes(skillId)),
    llmRequestConfig: defaults.llmRequestConfig,
    ...(runtimeContextChanged
      ? {
          providerState: undefined,
          providerDebug: undefined,
          contextState: { consecutiveCompactionFailures: 0 },
        }
      : {}),
  };

  const updated = normalizeSessionRequestConfig(await store.updateSession(id, patch));
  return toPublicSession(updated);
}

export async function patchSession(id: string, body: Partial<CreateSessionBody>): Promise<SessionState> {
  return updateSession(id, body);
}
