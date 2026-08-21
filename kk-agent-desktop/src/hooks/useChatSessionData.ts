import { useCallback, useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, session as sessionApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type {
  AgentDefinition,
  ApprovalMode,
  LlmRequestConfig,
  McpListItem,
  MemoryFact,
  ModelInfo,
  ModelSettings,
  ReasoningHistory,
  SessionState,
  SkillDefinition,
  TaskItem,
} from "@/types/api";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { clearActiveSessionId, getActiveSessionId } from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "@/lib/llmRequestConfig";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";
import { toggleId } from "@/lib/idLists";
import { parseModelRef, toModelRef } from "@/lib/modelRefs";

const logger = createLogger("chat-context");

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
      logger.error("Failed to load chat context:", err);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const result = await providerApi.getModels();
      const configuredModels = result.models.filter((model) => model.profile && model.capabilities);
      setModels(configuredModels.map(toModelRef));
      setModelInfoMap(new Map(result.models.map((model) => [toModelRef(model), model])));
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
      .catch((err) => logger.warn("Failed to load debug data:", err));
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
        loadModels(),
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
          loadModels(),
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
  }, [applyBootstrapSnapshot, fetchSessionSnapshot, loadAvailableMcps, loadModels, loadSession]);

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
    await loadModels();
    await loadContextData(nextSession.id);
  }, [loadContextData, loadModels, session]);

  const updateActiveCapabilityIds = useCallback(async (
    field: "activeMcpIds" | "activeToolIds" | "activeSkillIds",
    id: string,
    enabled: boolean,
    errorMessage: string,
  ) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        [field]: toggleId(session[field], id, enabled),
      });
    } catch (err) {
      logger.error(errorMessage, err);
    }
  }, [session, updateSessionAndSet]);

  const updateRequestConfig = useCallback(async (
    patch: LlmRequestConfig,
    errorMessage: string,
  ) => {
    if (!session) return;
    try {
      await updateSessionAndSet({
        llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(session.llmRequestConfig, patch)),
      });
    } catch (err) {
      logger.error(errorMessage, err);
    }
  }, [session, updateSessionAndSet]);

  const handleModelSwitch = useCallback(async (modelRef: string) => {
    if (!session) return;
    const parsed = parseModelRef(modelRef);
    if (!parsed) return;
    if (parsed.providerId === session.providerId && parsed.modelId === session.model) return;
    try {
      await updateSessionAndSet({ providerId: parsed.providerId, model: parsed.modelId });
    } catch (err) {
      logger.error("Failed to switch model:", err);
    }
  }, [session, updateSessionAndSet]);

  const handleMcpToggle = useCallback(async (mcpId: string, enabled: boolean) => {
    await updateActiveCapabilityIds("activeMcpIds", mcpId, enabled, "Failed to toggle MCP:");
  }, [updateActiveCapabilityIds]);

  const handleToolToggle = useCallback(async (toolId: string, enabled: boolean) => {
    await updateActiveCapabilityIds("activeToolIds", toolId, enabled, "Failed to toggle tool:");
  }, [updateActiveCapabilityIds]);

  const handleSkillToggle = useCallback(async (skillId: string, enabled: boolean) => {
    await updateActiveCapabilityIds("activeSkillIds", skillId, enabled, "Failed to toggle skill:");
  }, [updateActiveCapabilityIds]);

  const handleReasoningEffort = useCallback(async (value: string) => {
    await updateRequestConfig({
      reasoning: { effort: normalizeCanonicalReasoningEffort(value) },
    }, "Failed to set reasoning:");
  }, [updateRequestConfig]);

  const handleReasoningHistory = useCallback(async (value: string) => {
    await updateRequestConfig({
      reasoning: { history: value as ReasoningHistory },
    }, "Failed to set reasoning history:");
  }, [updateRequestConfig]);

  const handleTemperature = useCallback(async (value: string) => {
    await updateRequestConfig({
      sampling: { temperature: Number(value) },
    }, "Failed to set temperature:");
  }, [updateRequestConfig]);

  const handleLlmRequestConfig = useCallback(async (value: LlmRequestConfig | undefined) => {
    if (!session) return;
    try {
      await updateSessionAndSet({ llmRequestConfig: value });
    } catch (err) {
      logger.error("Failed to update LLM request config:", err);
    }
  }, [session, updateSessionAndSet]);

  const handleAgentSwitch = useCallback(async (agentId: string) => {
    if (!session || agentId === session.agentId) return;
    try {
      await updateSessionAndSet({ agentId });
    } catch (err) {
      logger.error("Failed to switch agent:", err);
    }
  }, [session, updateSessionAndSet]);

  const handleModeSwitch = useCallback(async (activeModeId: SessionState["activeModeId"]) => {
    if (!session || activeModeId === session.activeModeId) return;
    try {
      await updateSessionAndSet({ activeModeId });
    } catch (err) {
      logger.error("Failed to switch mode:", err);
    }
  }, [session, updateSessionAndSet]);

  const handleApprovalModeSwitch = useCallback(async (approvalMode: ApprovalMode) => {
    if (!session || approvalMode === session.approvalMode) return;
    try {
      await updateSessionAndSet({ approvalMode });
    } catch (err) {
      logger.error("Failed to switch approval mode:", err);
    }
  }, [session, updateSessionAndSet]);

  const handleNewSession = useCallback(async (fallbackAgentId?: string) => {
    try {
      const newSession = await createAndActivateSession(agents, fallbackAgentId ?? resolveDefaultSessionAgentId(agents));
      setSession(newSession);
      await loadContextData(newSession.id);
      await loadModels();
    } catch (err) {
      logger.error("Failed to create new session:", err);
    }
  }, [agents, loadContextData, loadModels]);

  const handleSaveTasks = useCallback(async (nextTasks: TaskItem[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceTasks(session.id, nextTasks);
      setTasks(result.tasks);
    } catch (err) {
      logger.error("Failed to save tasks:", err);
    }
  }, [session]);

  const handleSaveSessionFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    if (!session) return;
    try {
      const result = await toolsApi.replaceSessionMemory(session.id, nextFacts);
      setSessionFacts(result.facts);
    } catch (err) {
      logger.error("Failed to save session memory:", err);
    }
  }, [session]);

  const handleSaveUserFacts = useCallback(async (nextFacts: MemoryFact[]) => {
    try {
      const result = await toolsApi.replaceUserMemory(nextFacts);
      setUserFacts(result.facts);
    } catch (err) {
      logger.error("Failed to save user memory:", err);
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
    handleReasoningHistory,
    handleTemperature,
    handleLlmRequestConfig,
    handleAgentSwitch,
    handleModeSwitch,
    handleApprovalModeSwitch,
    handleNewSession,
    handleSaveTasks,
    handleSaveSessionFacts,
    handleSaveUserFacts,
  };
}
