import { useEffect, useState } from "react";
import styled from "styled-components";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, settings as settingsApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { AgentDefinition, AppDefaults, CreateAgentBody, McpListItem, ModelInfo, ModelSettings, SkillDefinition } from "@/types/api";
import { PageTitle } from "@/components/Layout.styled";
import Spinner from "@/components/Spinner";
import AgentList from "@/components/agent/AgentList";
import AgentEditor from "@/components/agent/AgentEditor";
import CreateAgentModal from "@/components/agent/CreateAgentModal";

const PageLayout = styled.div`
  display: flex;
  gap: var(--space-lg);
  height: calc(100vh - 120px);
`;

export default function AgentPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSettings, setModelSettings] = useState<Record<string, ModelSettings>>({});
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState<AgentDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSystemVariables, setShowSystemVariables] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([agentApi.list(), mcpApi.list(), toolsApi.list(), skillsApi.list(), agentApi.systemVariables(), providerApi.getModels(), settingsApi.getDefaults()])
      .then(([agentList, mcpList, toolList, skillList, vars, providerModels, appDefaults]) => {
        setAgents(agentList);
        setMcps(mcpList);
        setInternalTools(toolList);
        setSkills(skillList);
        setSystemVariables(vars.variables);
        setModels(providerModels.models);
        setModelSettings(providerModels.modelSettings ?? {});
        setDefaults(appDefaults);
        if (agentList.length > 0) {
          setSelectedId(agentList[0].id);
          setEditAgent(structuredClone(agentList[0]));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function selectAgent(id: string) {
    const agent = agents.find((entry) => entry.id === id);
    if (!agent) return;
    setSelectedId(id);
    setEditAgent(structuredClone(agent));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await agentApi.create({ name: newName.trim() } satisfies CreateAgentBody);
      setAgents((prev) => [...prev, created]);
      setSelectedId(created.id);
      setEditAgent(structuredClone(created));
      setShowCreate(false);
      setNewName("");
    } catch (err) {
      logUiError("agent-create", err);
    }
  }

  async function handleSave() {
    if (!editAgent || !selectedId) return;
    setSaving(true);
    try {
      const updated = await agentApi.update(selectedId, {
        name: editAgent.name,
        description: editAgent.description,
        defaultChatMode: editAgent.defaultChatMode,
        modeConfigs: editAgent.modeConfigs,
        variables: editAgent.variables,
        defaultModel: editAgent.defaultModel,
        reasoningEffort: editAgent.reasoningEffort,
        temperature: editAgent.temperature,
      });
      setAgents((prev) => prev.map((agent) => (agent.id === selectedId ? updated : agent)));
      setEditAgent(structuredClone(updated));
    } catch (err) {
      logUiError("agent-save", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await agentApi.delete(selectedId);
      const remaining = agents.filter((agent) => agent.id !== selectedId);
      setAgents(remaining);
      if (remaining.length === 0) {
        setSelectedId(null);
        setEditAgent(null);
        return;
      }
      selectAgent(remaining[0].id);
    } catch (err) {
      logUiError("agent-delete", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageTitle>Agents</PageTitle>
      <PageLayout>
        <AgentList
          agents={agents}
          mcps={[...internalTools, ...mcps]}
          selectedId={selectedId}
          onSelect={selectAgent}
          onCreate={() => setShowCreate(true)}
        />
        <AgentEditor
          agent={editAgent}
          mcps={mcps}
          internalTools={internalTools}
          skills={skills}
          models={models}
          modelSettings={modelSettings}
          defaults={defaults}
          systemVariables={systemVariables}
          saving={saving}
          showSystemVariables={showSystemVariables}
          onToggleSystemVariables={() => setShowSystemVariables((prev) => !prev)}
          onChange={setEditAgent}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </PageLayout>
      <CreateAgentModal
        open={showCreate}
        name={newName}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  );
}
