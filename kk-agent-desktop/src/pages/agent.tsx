import { useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, settings as settingsApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { AgentDefinition, AppDefaults, CreateAgentBody, InternalToolListItem, McpListItem, ModelInfo, ProviderConfig, SecuritySettings, SkillDefinition } from "kk-agent-contract";
import { PageBody } from "@/components/Layout.styled";
import { MasterDetailLayout } from "@/components/MasterDetail.styled";
import Spinner from "@/components/Spinner";
import AgentList from "@/components/agent/AgentList";
import AgentEditor from "@/components/agent/AgentEditor";
import CreateAgentModal from "@/components/agent/CreateAgentModal";

export default function AgentPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [internalTools, setInternalTools] = useState<InternalToolListItem[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [templates, setTemplates] = useState<AppDefaults["agent"] | null>(null);
  const [securityDefaults, setSecurityDefaults] = useState<SecuritySettings | null>(null);
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<AgentDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSystemVariables, setShowSystemVariables] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedId = editAgent?.id ?? null;

  async function loadModels() {
    try {
      const providerModels = await providerApi.getModels();
      setModels(providerModels.models.filter((model) => model.profile && model.capabilities));
    } catch (err) {
      reportError("Failed to load models", err);
      setModels([]);
    }
  }

  useEffect(() => {
    const providerModels = providerApi.getModels().catch((error) => {
      reportError("Failed to load models", error);
      return { models: [] };
    });
    void Promise.all([agentApi.list(), mcpApi.list(), toolsApi.list(), skillsApi.list(), agentApi.systemVariables(), providerApi.listProviders(), providerModels, agentApi.templates(), settingsApi.getSecurity()])
      .then(([agentList, mcpList, toolList, skillList, vars, providerList, providerModels, agentTemplates, security]) => {
        setAgents(agentList);
        setProviders(providerList);
        setMcps(mcpList);
        setInternalTools(toolList);
        setSkills(skillList);
        setSystemVariables(vars.variables);
        setTemplates(agentTemplates);
        setSecurityDefaults(security);
        setModels(providerModels.models.filter((model) => model.profile && model.capabilities));
        setEditAgent(agentList[0] ? structuredClone(agentList[0]) : null);
      })
      .catch((error) => reportError("Failed to load agent configuration", error))
      .finally(() => setLoading(false));
  }, []);

  function selectAgent(id: string) {
    const agent = agents.find((entry) => entry.id === id);
    if (!agent) return;
    setEditAgent(structuredClone(agent));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await agentApi.create({ name: newName.trim() } satisfies CreateAgentBody);
      setAgents((prev) => [...prev, created]);
      setEditAgent(structuredClone(created));
      setShowCreate(false);
      setNewName("");
    } catch (err) {
      reportError("Failed to create agent", err);
    }
  }

  async function handleSave() {
    if (!editAgent) return;
    setSaving(true);
    try {
      const updated = await agentApi.update(editAgent.id, {
        name: editAgent.name,
        description: editAgent.description,
        defaultModeId: editAgent.defaultModeId,
        modes: editAgent.modes,
        variables: editAgent.variables,
        defaultProviderId: editAgent.defaultProviderId,
        defaultModel: editAgent.defaultModel,
        llmRequestConfig: editAgent.llmRequestConfig,
      });
      setAgents((prev) => prev.map((agent) => (agent.id === editAgent.id ? updated : agent)));
      setEditAgent(structuredClone(updated));
      await loadModels();
    } catch (err) {
      reportError("Failed to save agent", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editAgent) return;
    try {
      await agentApi.delete(editAgent.id);
      const remaining = agents.filter((agent) => agent.id !== editAgent.id);
      setAgents(remaining);
      setEditAgent(remaining[0] ? structuredClone(remaining[0]) : null);
    } catch (err) {
      reportError("Failed to delete agent", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <MasterDetailLayout>
        <AgentList
          agents={agents}
          tools={internalTools}
          mcps={mcps}
          selectedId={selectedId}
          onSelect={selectAgent}
          onCreate={() => setShowCreate(true)}
        />
        <AgentEditor
          agent={editAgent}
          providers={providers}
          mcps={mcps}
          internalTools={internalTools}
          skills={skills}
          models={models}
          templates={templates}
          securityDefaults={securityDefaults}
          systemVariables={systemVariables}
          saving={saving}
          showSystemVariables={showSystemVariables}
          onToggleSystemVariables={() => setShowSystemVariables((prev) => !prev)}
          onChange={setEditAgent}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </MasterDetailLayout>
      <CreateAgentModal
        open={showCreate}
        name={newName}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onClose={() => setShowCreate(false)}
      />
    </PageBody>
  );
}
