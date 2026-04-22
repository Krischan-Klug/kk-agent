import { useCallback, useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, session as sessionApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import type {
  AgentDefinition,
  LlmRequestConfig,
  McpListItem,
  MemoryFact,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  SessionState,
  SkillDefinition,
  TaskItem,
} from "@/types/api";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { clearActiveSessionId, getActiveSessionId } from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "@/lib/llmRequestConfig";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";

type DebugToggleHandler = (updater: (previous: boolean) => boolean) => void;

type Options = {
  onDebugOpen: (sessionId: string) => void;
  setDebugOpen: DebugToggleHandler;
};

type BootstrapSnapshot = {
  session: SessionState | null;
  tasks: TaskItem[];
  sessionFacts: MemoryFact[];
  userFacts: MemoryFact[];
};

export function useChatSessionData({ onDebugOpen, setDebugOpen }: Options) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [modelInfoMap, setModelInfoMap] = useState<Map<string, ModelInfo>>(new Map());
  const [modelSettingsMap, setModelSettingsMap] = useState<Record<string, ModelSettings>>({});
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [toolMcps, setToolMcps] = useState<McpListItem[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [sessionFacts, setSessionFacts] = useState<MemoryFact[]>([]);
  const [userFacts, setUserFacts] = useState<MemoryFact[]>([]);

  const applyBootstrapSnapshot = useCallback((snapshot: BootstrapSnapshot) => {
    setSession(snapshot.session);
    setTasks(snapshot.tasks);
    setSessionFacts(snapshot.sessionFacts);
    setUserFacts(snapshot.userFacts);
    setLoading(false);
  }, []);

  const loadAvailableMcps = useCallback(async (): Promise<{ tools: McpListItem[]; mcps: McpListItem[] }> => {
    const [internalTools, externalMcps] = await Promise.all([toolsApi.list(), mcpApi.list()]);
    return { tools: internalTools, mcps: externalMcps };
  }, []);

  const loadContextData = useCallback(async (sessionId: string) => {
    try {
      const [taskResult, sessionMemoryResult, userMemoryResult] = await Promise.all([
        toolsApi.listTasks(sessionId),
        toolsApi.listSessionMemory(sessionId),
        toolsApi.listUserMemory(),
      ]);
      setTasks(taskResult.tasks);
      setSessionFacts(sessionMemoryResult.facts);
      setUserFacts(userMemoryResult.facts);
    } catch (err) {
      console.error("[chat-context-load]", err);
    }
  }, []);

  const loadModels = useCallback(async (providerId: string) => {
    try {
      const result = await providerApi.getModels(providerId);
      setModels(result.models.map((model) => model.id));
      setModelInfoMap(new Map(result.models.map((model) => [model.id, model])));
      setModelSettingsMap(result.modelSettings ?? {});
    } catch {
      // ignore
    }
  }, []);

  const loadDebugData = useCallback((sessionId: string) => {
    onDebugOpen(sessionId);
    Promise.all([loadAvailableMcps(), skillsApi.list()])
      .then(([{ tools, mcps }, availableSkills]) => {
        setToolMcps(tools);
        setMcps(mcps);
        setSkills(availableSkills);
      })
      .catch((err) => console.warn("[debug] Failed to load debug data:", err));
    void loadContextData(sessionId);
  }, [loadAvailableMcps, loadContextData, onDebugOpen]);

  const fetchSessionSnapshot = useCallback(async (): Promise<BootstrapSnapshot> => {
    const id = getActiveSessionId();
    if (!id) {
      return {
        session: null,
        tasks: [],
        sessionFacts: [],
        userFacts: [],
      };
    }

    try {
      const nextSession = await sessionApi.get(id);
      const [contextData] = await Promise.all([
        Promise.all([
          toolsApi.listTasks(nextSession.id),
          toolsApi.listSessionMemory(nextSession.id),
          toolsApi.listUserMemory(),
        ]),
        loadModels(nextSession.providerId),
      ]);

      return {
        session: nextSession,
        tasks: contextData[0].tasks,
        sessionFacts: contextData[1].facts,
        userFacts: contextData[2].facts,
      };
    } catch {
      clearActiveSessionId();
      return {
        session: null,
        tasks: [],
        sessionFacts: [],
        userFacts: [],
      };
    }
  }, [loadModels]);

  const loadSession = useCallback(async () => {
    const snapshot = await fetchSessionSnapshot();
    applyBootstrapSnapshot(snapshot);
  }, [applyBootstrapSnapshot, fetchSessionSnapshot]);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const [snapshot, availableMcps, availableAgents, availableSkills, availableProviders] = await Promise.all([
          fetchSessionSnapshot(),
          loadAvailableMcps(),
          agentApi.list(),
          skillsApi.list(),
          providerApi.listProviders(),
        ]);
        if (disposed) return;
        applyBootstrapSnapshot(snapshot);
        setToolMcps(availableMcps.tools);
        setMcps(availableMcps.mcps);
        setAgents(availableAgents);
        setSkills(availableSkills);
        setProviders(availableProviders);
      } catch {
        if (!disposed) setLoading(false);
      }
    })();

    const removeSessionListener = addAppEventListener(SESSION_CHANGED_EVENT, () => {
      void loadSession();
    });
    return () => {
      disposed = true;
      removeSessionListener();
    };
  }, [applyBootstrapSnapshot, fetchSessionSnapshot, loadAvailableMcps, loadSession]);

  useEffect(() => addAppEventListener(CHAT_DEBUG_TOGGLE_EVENT, () => {
    setDebugOpen((previous) => {
      const next = !previous;
      if (next && session) loadDebugData(session.id);
      return next;
    });
  }), [loadDebugData, session, setDebugOpen]);

  const updateSessionAndSet = useCallback(async (body: Parameters<typeof sessionApi.update>[1]) => {
    if (!session) return;
    const nextSession = await sessionApi.update(session.id, body);
    setSession(nextSession);
    await loadModels(nextSession.providerId);
    await loadContextData(nextSession.id);
  }, [loadContextData, loadModels, session]);

  const handleModelSwitch = useCallback(async (model: string) => {
    if (!session || model === session.model) return;
    try {
      await updateSessionAndSet({ model });
    } catch (err) {
      console.error("[chat-model-switch]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleProviderSwitch = useCallback(async (providerId: string) => {
    if (!session || providerId === session.providerId) return;
    try {
      const result = await providerApi.getModels(providerId);
      const nextModel = result.models.some((model) => model.id === session.model)
        ? session.model
        : result.models[0]?.id;
      const nextSession = await sessionApi.update(session.id, {
        providerId,
        ...(nextModel ? { model: nextModel } : {}),
      });
      setSession(nextSession);
      setModels(result.models.map((model) => model.id));
      setModelInfoMap(new Map(result.models.map((model) => [model.id, model])));
      setModelSettingsMap(result.modelSettings ?? {});
      await loadContextData(nextSession.id);
    } catch (err) {
      console.error("[chat-provider-switch]", err);
    }
  }, [loadContextData, session]);

  const handleMcpToggle = useCallback(async (mcpId: string, enabled: boolean) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeMcpIds: enabled
          ? [...session.activeMcpIds, mcpId]
          : session.activeMcpIds.filter((id) => id !== mcpId),
      });
    } catch (err) {
      console.error("[chat-mcp-toggle]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleToolToggle = useCallback(async (toolId: string, enabled: boolean) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeToolIds: enabled
          ? [...session.activeToolIds, toolId]
          : session.activeToolIds.filter((id) => id !== toolId),
      });
    } catch (err) {
      console.error("[chat-tool-toggle]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleSkillToggle = useCallback(async (skillId: string, enabled: boolean) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeSkillIds: enabled
          ? [...session.activeSkillIds, skillId]
          : session.activeSkillIds.filter((id) => id !== skillId),
      });
    } catch (err) {
      console.error("[chat-skill-toggle]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleReasoningEffort = useCallback(async (value: string) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(session.llmRequestConfig, {
          common: {
            reasoningEffort: normalizeCanonicalReasoningEffort(value),
          },
        })),
      });
    } catch (err) {
      console.error("[chat-reasoning]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleTemperature = useCallback(async (value: string) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(session.llmRequestConfig, {
          common: {
            temperature: Number(value),
          },
        })),
      });
    } catch (err) {
      console.error("[chat-temperature]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleLlmRequestConfig = useCallback(async (value: LlmRequestConfig | undefined) => {
    if (!session) return;
    try {
      await updateSessionAndSet({ llmRequestConfig: value });
    } catch (err) {
      console.error("[chat-llm-request-config]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleAgentSwitch = useCallback(async (agentId: string) => {
    if (!session || agentId === session.agentId) return;
    try {
      await updateSessionAndSet({ agentId });
    } catch (err) {
      console.error("[chat-agent-switch]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleModeSwitch = useCallback(async (activeModeId: SessionState["activeModeId"]) => {
    if (!session || activeModeId === session.activeModeId) return;
    try {
      await updateSessionAndSet({ activeModeId });
    } catch (err) {
      console.error("[chat-mode-switch]", err);
    }
  }, [session, updateSessionAndSet]);

  const handleNewSession = useCallback(async (providerId?: string) => {
    try {
      const newSession = await createAndActivateSession(agents, resolveDefaultSessionAgentId(agents), providerId);
      setSession(newSession);
      await loadContextData(newSession.id);
    } catch (err) {
      console.error("[chat-new-session]", err);
    }
  }, [agents, loadContextData]);

  const handleSaveTasks = useCallback(async (nextTasks: TaskItem[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceTasks(session.id, nextTasks);
      setTasks(result.tasks);
    } catch (err) {
      console.error("[chat-save-tasks]", err);
    }
  }, [session]);

  const handleSaveSessionFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceSessionMemory(session.id, nextFacts);
      setSessionFacts(result.facts);
    } catch (err) {
      console.error("[chat-save-session-memory]", err);
    }
  }, [session]);

  const handleSaveUserFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    try {
      const result = await toolsApi.replaceUserMemory(nextFacts);
      setUserFacts(result.facts);
    } catch (err) {
      console.error("[chat-save-user-memory]", err);
    }
  }, []);

  const currentAgentName = session
    ? agents.find((agent) => agent.id === session.agentId)?.name ?? session.agentId
    : "assistant";

  return {
    session,
    setSession,
    loading,
    models,
    modelInfoMap,
    modelSettingsMap,
    providers,
    mcps,
    toolMcps,
    skills,
    agents,
    tasks,
    sessionFacts,
    userFacts,
    currentAgentName,
    loadContextData,
    loadDebugData,
    handleProviderSwitch,
    handleModelSwitch,
    handleMcpToggle,
    handleToolToggle,
    handleSkillToggle,
    handleReasoningEffort,
    handleTemperature,
    handleLlmRequestConfig,
    handleAgentSwitch,
    handleModeSwitch,
    handleNewSession,
    handleSaveTasks,
    handleSaveSessionFacts,
    handleSaveUserFacts,
  };
}
