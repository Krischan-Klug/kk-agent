import { useCallback, useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, session as sessionApi, tools as toolsApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type {
  AgentDefinition,
  ApprovalMode,
  LlmRequestConfig,
  McpListItem,
  InternalToolListItem,
  ModelInfo,
  ModelSettings,
  SessionState,
  TaskItem,
} from "kk-agent-contract";
import { addAppEventListener, CHAT_DEBUG_TOGGLE_EVENT, SESSION_CHANGED_EVENT } from "@/lib/appEvents";
import { clearActiveSessionId, getActiveSessionId } from "@/lib/sessionState";
import { createAndActivateSession, resolveDefaultSessionAgentId } from "@/lib/sessionFactory";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "kk-agent-contract";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";
import { toModelRef } from "@/lib/modelRefs";

type DebugToggleHandler = (updater: (previous: boolean) => boolean) => void;

type Options = {
  onDebugOpen: (sessionId: string) => void;
  setDebugOpen: DebugToggleHandler;
};

type BootstrapSnapshot = {
  session: SessionState | null;
  tasks: TaskItem[];
};

export function useChatSessionData({ onDebugOpen, setDebugOpen }: Options) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelInfoMap, setModelInfoMap] = useState<Map<string, ModelInfo>>(new Map());
  const [modelSettingsMap, setModelSettingsMap] = useState<Record<string, ModelSettings>>({});
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [internalTools, setInternalTools] = useState<InternalToolListItem[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const applyBootstrapSnapshot = useCallback((snapshot: BootstrapSnapshot) => {
    setSession(snapshot.session);
    setTasks(snapshot.tasks);
    setLoading(false);
  }, []);

  const loadCapabilities = useCallback(async (): Promise<{ tools: InternalToolListItem[]; mcps: McpListItem[] }> => {
    const [internalTools, externalMcps] = await Promise.all([toolsApi.list(), mcpApi.list()]);
    return { tools: internalTools, mcps: externalMcps };
  }, []);

  const loadContextData = useCallback(async (sessionId: string) => {
    try {
      const taskResult = await toolsApi.listTasks(sessionId);
      setTasks(taskResult.tasks);
    } catch (err) {
      reportError("Failed to load chat context", err);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const result = await providerApi.getModels();
      setModelInfoMap(new Map(result.models.map((model) => [toModelRef(model), model])));
      setModelSettingsMap(result.modelSettings ?? {});
    } catch (error) {
      reportError("Failed to load models", error);
    }
  }, []);

  const loadDebugData = useCallback((sessionId: string) => {
    onDebugOpen(sessionId);
  }, [onDebugOpen]);

  const fetchSessionSnapshot = useCallback(async (): Promise<BootstrapSnapshot> => {
    const id = getActiveSessionId();
    if (!id) {
      return {
        session: null,
        tasks: [],
      };
    }

    try {
      const nextSession = await sessionApi.get(id);
      const contextData = await toolsApi.listTasks(nextSession.id);

      return {
        session: nextSession,
        tasks: contextData.tasks,
      };
    } catch (error) {
      reportError("Failed to load the active session", error);
      clearActiveSessionId();
      return {
        session: null,
        tasks: [],
      };
    }
  }, []);

  const loadSession = useCallback(async () => {
    const [snapshot] = await Promise.all([fetchSessionSnapshot(), loadModels()]);
    applyBootstrapSnapshot(snapshot);
  }, [applyBootstrapSnapshot, fetchSessionSnapshot, loadModels]);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const [snapshot, availableMcps, availableAgents] = await Promise.all([
          fetchSessionSnapshot(),
          loadCapabilities(),
          agentApi.list(),
          loadModels(),
        ]);
        if (disposed) return;
        applyBootstrapSnapshot(snapshot);
        setInternalTools(availableMcps.tools);
        setMcps(availableMcps.mcps);
        setAgents(availableAgents);
      } catch (error) {
        reportError("Failed to initialize chat", error);
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
  }, [applyBootstrapSnapshot, fetchSessionSnapshot, loadCapabilities, loadModels, loadSession]);

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
  }, [session]);

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
      reportError(errorMessage, err);
    }
  }, [session, updateSessionAndSet]);

  const handleReasoningEffort = useCallback(async (value: string) => {
    await updateRequestConfig({
      reasoning: { effort: normalizeCanonicalReasoningEffort(value) },
    }, "Failed to set reasoning");
  }, [updateRequestConfig]);

  const handleAgentSwitch = useCallback(async (agentId: string) => {
    if (!session || agentId === session.agentId) return;
    try {
      await updateSessionAndSet({ agentId });
    } catch (err) {
      reportError("Failed to switch agent", err);
    }
  }, [session, updateSessionAndSet]);

  const handleApprovalModeSwitch = useCallback(async (approvalMode: ApprovalMode) => {
    if (!session || approvalMode === session.approvalMode) return;
    try {
      await updateSessionAndSet({ approvalMode });
    } catch (err) {
      reportError("Failed to switch approval mode", err);
    }
  }, [session, updateSessionAndSet]);

  const handleNewSession = useCallback(async (fallbackAgentId?: string) => {
    try {
      const newSession = await createAndActivateSession(agents, fallbackAgentId ?? resolveDefaultSessionAgentId(agents));
      setSession(newSession);
      await loadContextData(newSession.id);
    } catch (err) {
      reportError("Failed to create new session", err);
    }
  }, [agents, loadContextData]);

  const currentAgentName = session
    ? agents.find((agent) => agent.id === session.agentId)?.name ?? session.agentId
    : "assistant";

  return {
    session,
    setSession,
    loading,
    modelInfoMap,
    modelSettingsMap,
    mcps,
    internalTools,
    agents,
    tasks,
    currentAgentName,
    loadContextData,
    loadDebugData,
    handleReasoningEffort,
    handleAgentSwitch,
    handleApprovalModeSwitch,
    handleNewSession,
  };
}
