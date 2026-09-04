import { useState } from "react";
import type {
  AgentConfig,
  AgentDefinition,
  AppDefaults,
  InternalToolListItem,
  McpListItem,
  ModelInfo,
  ProviderConfig,
  SecuritySettings,
  SkillDefinition,
  ToolAccessScope,
} from "kk-agent-contract";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "kk-agent-contract";
import { getReasoningLevels } from "@/lib/modelCapabilities";
import { getAgentModelRef, toModelRef } from "@/lib/modelRefs";
import { EmptyHint } from "@/components/PageForm";
import {
  AgentWorkspacePanel,
  AgentWorkspaceTabs,
  EditorArea,
  WorkspaceTab,
} from "./AgentEditor.styled";
import {
  AgentInfoSection,
  ExternalMcpsSection,
  InternalToolsSection,
  PromptSectionsSection,
  SkillsSection,
  VariablesSection,
} from "./AgentEditor.sections";

type Props = {
  agent: AgentDefinition | null;
  providers: ProviderConfig[];
  mcps: McpListItem[];
  internalTools: InternalToolListItem[];
  skills: SkillDefinition[];
  models: ModelInfo[];
  templates: AppDefaults["agent"] | null;
  securityDefaults: SecuritySettings | null;
  systemVariables: string[];
  saving: boolean;
  showSystemVariables: boolean;
  onToggleSystemVariables: () => void;
  onChange: (agent: AgentDefinition) => void;
  onSave: () => void;
  onDelete: () => void;
};

type AgentWorkspace = "prompts" | "tools" | "mcps" | "skills";

const agentWorkspaces: Array<{ id: AgentWorkspace; label: string }> = [
  { id: "prompts", label: "Prompts" },
  { id: "tools", label: "Tools" },
  { id: "mcps", label: "MCPs" },
  { id: "skills", label: "Skills" },
];

export default function AgentEditor({
  agent,
  providers,
  mcps,
  internalTools,
  skills,
  models,
  templates,
  securityDefaults,
  systemVariables,
  saving,
  showSystemVariables,
  onToggleSystemVariables,
  onChange,
  onSave,
  onDelete,
}: Props) {
  const [selectedWorkspace, setSelectedWorkspace] = useState<AgentWorkspace>("prompts");

  if (!agent) {
    return (
      <EditorArea>
        <EmptyHint>Select an agent or create a new one.</EmptyHint>
      </EditorArea>
    );
  }

  const currentAgent = agent;
  const selectedModelRef = getAgentModelRef(currentAgent);
  const selectedModelInfo = selectedModelRef
    ? models.find((model) => toModelRef(model) === selectedModelRef)
    : undefined;
  const reasoningLevels = getReasoningLevels(selectedModelInfo);

  function getPromptSectionDefault(section: keyof AgentConfig["promptSections"]): string {
    return templates?.promptSections[section] ?? "";
  }

  function getToolInstructionFallback(toolId: string, fallback?: string): string {
    return templates?.toolInstructions[toolId] ?? fallback ?? "";
  }

  function getEffectiveToolInstruction(toolId: string, fallback?: string): string {
    return currentAgent.toolInstructions[toolId] ?? getToolInstructionFallback(toolId, fallback);
  }

  function getDefaultAccessScope(): ToolAccessScope {
    return securityDefaults?.accessScope ?? "user";
  }

  function getEffectiveAccessScope(toolId: string): ToolAccessScope {
    return currentAgent.toolAccessScopes[toolId] ?? getDefaultAccessScope();
  }

  function updateAgentConfig(nextConfig: AgentConfig) {
    onChange({ ...currentAgent, ...nextConfig });
  }

  function updateReasoningConfig(patch: NonNullable<AgentDefinition["llmRequestConfig"]>["reasoning"]) {
    onChange({
      ...currentAgent,
      llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(currentAgent.llmRequestConfig, { reasoning: patch })),
    });
  }

  return (
    <EditorArea>
      <AgentInfoSection
        currentAgent={currentAgent}
        providers={providers}
        models={models}
        showReasoning={reasoningLevels.length > 0}
        reasoningLevels={reasoningLevels}
        updateReasoningConfig={updateReasoningConfig}
        onChange={onChange}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
      />

      <AgentWorkspaceTabs role="tablist" aria-label="Agent-Arbeitsbereiche">
        {agentWorkspaces.map((workspace) => (
          <WorkspaceTab
            key={workspace.id}
            type="button"
            role="tab"
            aria-selected={selectedWorkspace === workspace.id}
            $active={selectedWorkspace === workspace.id}
            onClick={() => setSelectedWorkspace(workspace.id)}
          >
            {workspace.label}
          </WorkspaceTab>
        ))}
      </AgentWorkspaceTabs>

      <AgentWorkspacePanel role="tabpanel">
        {selectedWorkspace === "prompts" && (
          <>
            <VariablesSection
              currentAgent={currentAgent}
              showSystemVariables={showSystemVariables}
              systemVariables={systemVariables}
              onToggleSystemVariables={onToggleSystemVariables}
              onChange={onChange}
            />
            <PromptSectionsSection
              agentConfig={currentAgent}
              getPromptSectionDefault={getPromptSectionDefault}
              updateAgentConfig={updateAgentConfig}
            />
          </>
        )}

        {selectedWorkspace === "tools" && (
          <InternalToolsSection
            agentConfig={currentAgent}
            internalTools={internalTools}
            mcps={mcps}
            getEffectiveToolInstruction={getEffectiveToolInstruction}
            getToolInstructionFallback={getToolInstructionFallback}
            getDefaultAccessScope={getDefaultAccessScope}
            getEffectiveAccessScope={getEffectiveAccessScope}
            updateAgentConfig={updateAgentConfig}
          />
        )}

        {selectedWorkspace === "mcps" && (
          <ExternalMcpsSection
            agentConfig={currentAgent}
            internalTools={internalTools}
            mcps={mcps}
            updateAgentConfig={updateAgentConfig}
          />
        )}

        {selectedWorkspace === "skills" && (
          <SkillsSection
            agentConfig={currentAgent}
            skills={skills}
            updateAgentConfig={updateAgentConfig}
          />
        )}
      </AgentWorkspacePanel>
    </EditorArea>
  );
}
