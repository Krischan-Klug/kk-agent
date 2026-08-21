import { useEffect, useState } from "react";
import { agent as agentApi, mcp as mcpApi, provider as providerApi, settings as settingsApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { AgentDefinition, AppDefaults, CreateAgentBody, McpListItem, ModelInfo, ProviderConfig, SecuritySettings, SkillDefinition } from "@/types/api";
import { PageBody } from "@/components/Layout.styled";
import { MasterDetailLayout } from "@/components/MasterDetail.styled";
import Spinner from "@/components/Spinner";
import AgentList from "@/components/agent/AgentList";
import AgentEditor from "@/components/agent/AgentEditor";
import CreateAgentModal from "@/components/agent/CreateAgentModal";

const logger = createLogger("agent");

export default function AgentPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [templates, setTemplates] = useState<AppDefaults["agent"] | null>(null);
  const [securityDefaults, setSecurityDefaults] = useState<SecuritySettings | null>(null);
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState<AgentDefinition | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSystemVariables, setShowSystemVariables] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadModels() {
    try {
      const providerModels = await providerApi.getModels();
      setModels(providerModels.models.filter((model) => model.profile && model.capabilities));
    } catch (err) {
      logger.error("Failed to load models:", err);
      setModels([]);
    }
  }

  useEffect(() => {
    Promise.all([agentApi.list(), mcpApi.list(), toolsApi.list(), skillsApi.list(), agentApi.systemVariables(), providerApi.listProviders(), agentApi.templates(), settingsApi.getSecurity()])
      .then(async ([agentList, mcpList, toolList, skillList, vars, providerList, agentTemplates, security]) => {
        setAgents(agentList);
        setProviders(providerList);
        setMcps(mcpList);
        setInternalTools(toolList);
        setSkills(skillList);
        setSystemVariables(vars.variables);
        setTemplates(agentTemplates);
        setSecurityDefaults(security);
        if (agentList.length > 0) {
          const firstAgent = agentList[0];
          setSelectedId(firstAgent.id);
          setEditAgent(structuredClone(firstAgent));
          await loadModels();
        } else {
          setModels([]);
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
      logger.error("Failed to create agent:", err);
    }
  }

  async function handleSave() {
    if (!editAgent || !selectedId) return;
    setSaving(true);
    try {
      const updated = await agentApi.update(selectedId, {
        name: editAgent.name,
        description: editAgent.description,
        defaultModeId: editAgent.defaultModeId,
        modes: editAgent.modes,
        variables: editAgent.variables,
        defaultProviderId: editAgent.defaultProviderId,
        defaultModel: editAgent.defaultModel,
        llmRequestConfig: editAgent.llmRequestConfig,
      });
      setAgents((prev) => prev.map((agent) => (agent.id === selectedId ? updated : agent)));
      setEditAgent(structuredClone(updated));
      await loadModels();
    } catch (err) {
      logger.error("Failed to save agent:", err);
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
      logger.error("Failed to delete agent:", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <MasterDetailLayout>
        <AgentList
          agents={agents}
          mcps={[...internalTools, ...mcps]}
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
