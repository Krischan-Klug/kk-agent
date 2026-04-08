import { useCallback, useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, session as sessionApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import type {
  AgentDefinition,
  McpListItem,
  MemoryFact,
  ModelInfo,
  ModelSettings,
  SessionState,
  SkillDefinition,
  TaskItem,
} from "@/types/api";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { clearActiveSessionId, getActiveSessionId } from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { logUiError } from "@/lib/uiLogger";

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
      logUiError("chat-context-load", err);
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
        const [snapshot, availableMcps, availableAgents, availableSkills] = await Promise.all([
          fetchSessionSnapshot(),
          loadAvailableMcps(),
          agentApi.list(),
          skillsApi.list(),
        ]);
        if (disposed) return;
        applyBootstrapSnapshot(snapshot);
        setToolMcps(availableMcps.tools);
        setMcps(availableMcps.mcps);
        setAgents(availableAgents);
        setSkills(availableSkills);
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
      logUiError("chat-model-switch", err);
    }
  }, [session, updateSessionAndSet]);

  const handleMcpToggle = useCallback(async (mcpId: string, enabled: boolean) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        activeMcpIds: enabled
          ? [...session.activeMcpIds, mcpId]
          : session.activeMcpIds.filter((id) => id !== mcpId),
      });
    } catch (err) {
      logUiError("chat-mcp-toggle", err);
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
      logUiError("chat-tool-toggle", err);
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
      logUiError("chat-skill-toggle", err);
    }
  }, [session, updateSessionAndSet]);

  const handleReasoningEffort = useCallback(async (value: string) => {
    if (!session) return;
    try {
      await updateSessionAndSet({ reasoningEffort: value || undefined });
    } catch (err) {
      logUiError("chat-reasoning", err);
    }
  }, [session, updateSessionAndSet]);

  const handleTemperature = useCallback(async (value: string) => {
    if (!session) return;
    try {
      await updateSessionAndSet({ temperature: Number(value) });
    } catch (err) {
      logUiError("chat-temperature", err);
    }
  }, [session, updateSessionAndSet]);

  const handleAgentSwitch = useCallback(async (agentId: string) => {
    if (!session || agentId === session.agentId) return;
    try {
      await updateSessionAndSet({ agentId });
    } catch (err) {
      logUiError("chat-agent-switch", err);
    }
  }, [session, updateSessionAndSet]);

  const handleModeSwitch = useCallback(async (activeMode: SessionState["activeMode"]) => {
    if (!session || activeMode === session.activeMode) return;
    try {
      await updateSessionAndSet({ activeMode });
    } catch (err) {
      logUiError("chat-mode-switch", err);
    }
  }, [session, updateSessionAndSet]);

  const handleNewSession = useCallback(async () => {
    try {
      const newSession = await createAndActivateSession(agents, resolveDefaultSessionAgentId(agents));
      setSession(newSession);
      await loadContextData(newSession.id);
    } catch (err) {
      logUiError("chat-new-session", err);
    }
  }, [agents, loadContextData]);

  const handleSaveTasks = useCallback(async (nextTasks: TaskItem[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceTasks(session.id, nextTasks);
      setTasks(result.tasks);
    } catch (err) {
      logUiError("chat-save-tasks", err);
    }
  }, [session]);

  const handleSaveSessionFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceSessionMemory(session.id, nextFacts);
      setSessionFacts(result.facts);
    } catch (err) {
      logUiError("chat-save-session-memory", err);
    }
  }, [session]);

  const handleSaveUserFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    try {
      const result = await toolsApi.replaceUserMemory(nextFacts);
      setUserFacts(result.facts);
    } catch (err) {
      logUiError("chat-save-user-memory", err);
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
    handleModelSwitch,
    handleMcpToggle,
    handleToolToggle,
    handleSkillToggle,
    handleReasoningEffort,
    handleTemperature,
    handleAgentSwitch,
    handleModeSwitch,
    handleNewSession,
    handleSaveTasks,
    handleSaveSessionFacts,
    handleSaveUserFacts,
  };
}
