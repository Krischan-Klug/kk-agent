import { useState } from "react";
import type {
  AgentDefinition,
  AgentModeDefinition,
  AgentModeConfig,
  AppDefaults,
  ModeBehavior,
  InternalToolListItem,
  McpListItem,
  ModelInfo,
  ProviderConfig,
  SkillDefinition,
  SecuritySettings,
  ToolAccessScope,
} from "kk-agent-contract";
import { getReasoningLevels } from "@/lib/modelCapabilities";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "kk-agent-contract";
import { getAgentModelRef, toModelRef } from "@/lib/modelRefs";
import { EmptyHint } from "@/components/PageForm";
import {
  AgentWorkspacePanel,
  AgentWorkspaceTabs,
  EditorArea,
  ModeTab,
} from "./AgentEditor.styled";
import { createCustomMode } from "./AgentEditor.helpers";
import {
  AgentInfoSection,
  ExternalMcpsSection,
  InternalToolsSection,
  ModeInstructionSection,
  ModeSettingsSection,
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
  const [selectedModeId, setSelectedModeId] = useState<string>("edit");
  const [selectedWorkspace, setSelectedWorkspace] = useState<AgentWorkspace>("prompts");

  if (!agent) {
    return (
      <EditorArea>
        <EmptyHint>Select an agent or create a new one.</EmptyHint>
      </EditorArea>
    );
  }

  const currentAgent = agent;
  const enabledModes = currentAgent.modes.filter((mode) => mode.enabled);
  const fallbackMode = currentAgent.modes.find((mode) => mode.id === currentAgent.defaultModeId)
    ?? enabledModes[0]
    ?? currentAgent.modes[0];
  const selectedModeDefinition = currentAgent.modes.find((mode) => mode.id === selectedModeId) ?? fallbackMode;
  const effectiveSelectedModeId = selectedModeDefinition?.id ?? currentAgent.defaultModeId;
  const selectedModelRef = getAgentModelRef(currentAgent);
  const selectedModelInfo = selectedModelRef
    ? models.find((model) => toModelRef(model) === selectedModelRef)
    : undefined;
  const reasoningLevels = getReasoningLevels(selectedModelInfo);
  const selectedModeConfig = selectedModeDefinition.config;
  const modeTemplate = templates?.modeTemplates[selectedModeDefinition.behavior];
  const defaultModeInstruction = modeTemplate?.modeInstruction ?? "";

  function getPromptSectionDefault(section: keyof AgentModeConfig["promptSections"]): string {
    return templates?.promptSections[section] ?? "";
  }

  function getToolInstructionFallback(toolId: string, fallback?: string): string {
    return modeTemplate?.toolInstructions?.[toolId] ?? fallback ?? "";
  }

  function getEffectiveToolInstruction(toolId: string, fallback?: string): string {
    return selectedModeConfig.toolInstructions[toolId] ?? getToolInstructionFallback(toolId, fallback);
  }

  function getDefaultAccessScope(): ToolAccessScope {
    return securityDefaults?.accessScope ?? "user";
  }

  function getEffectiveAccessScope(toolId: string): ToolAccessScope {
    return selectedModeConfig.toolAccessScopes[toolId] ?? getDefaultAccessScope();
  }

  function updateModeConfig(nextConfig: AgentModeConfig) {
    onChange({
      ...currentAgent,
      modes: currentAgent.modes.map((mode) => mode.id === effectiveSelectedModeId
        ? { ...mode, config: nextConfig }
        : mode),
    });
  }

  function updateReasoningConfig(patch: NonNullable<AgentDefinition["llmRequestConfig"]>["reasoning"]) {
    onChange({
      ...currentAgent,
      llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(currentAgent.llmRequestConfig, { reasoning: patch })),
    });
  }

  function updateModeDefinition(modeId: string, transform: (mode: AgentModeDefinition) => AgentModeDefinition) {
    const nextModes = currentAgent.modes.map((mode) => mode.id === modeId ? transform(mode) : mode);
    const nextEnabledModes = nextModes.filter((mode) => mode.enabled);
    if (nextEnabledModes.length === 0) return;
    const nextDefaultModeId = nextEnabledModes.some((mode) => mode.id === currentAgent.defaultModeId)
      ? currentAgent.defaultModeId
      : nextEnabledModes[0]!.id;
    onChange({
      ...currentAgent,
      defaultModeId: nextDefaultModeId,
      modes: nextModes,
    });
  }

  function addCustomMode() {
    const nextMode = createCustomMode(currentAgent, templates, selectedModeDefinition.behavior);
    onChange({ ...currentAgent, modes: [...currentAgent.modes, nextMode] });
    setSelectedModeId(nextMode.id);
  }

  function deleteCustomMode(modeId: string) {
    const nextModes = currentAgent.modes.filter((mode) => mode.id !== modeId);
    const nextEnabledModes = nextModes.filter((mode) => mode.enabled);
    if (nextEnabledModes.length === 0) return;
    const nextDefaultModeId = currentAgent.defaultModeId === modeId
      ? nextEnabledModes[0]!.id
      : currentAgent.defaultModeId;
    onChange({ ...currentAgent, defaultModeId: nextDefaultModeId, modes: nextModes });
    setSelectedModeId(nextDefaultModeId);
  }

  function updateSelectedModeBehavior(behavior: ModeBehavior) {
    updateModeDefinition(selectedModeDefinition.id, (mode) => ({
      ...mode,
      behavior,
      config: mode.config,
    }));
  }

  return (
    <EditorArea>
      <AgentInfoSection
        currentAgent={currentAgent}
        enabledModes={enabledModes}
        effectiveSelectedModeId={effectiveSelectedModeId}
        providers={providers}
        models={models}
        showReasoning={reasoningLevels.length > 0}
        reasoningLevels={reasoningLevels}
        setSelectedModeId={setSelectedModeId}
        addCustomMode={addCustomMode}
        updateReasoningConfig={updateReasoningConfig}
        onChange={onChange}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
      />

      <AgentWorkspaceTabs role="tablist" aria-label="Agent-Arbeitsbereiche">
        {agentWorkspaces.map((workspace) => (
          <ModeTab
            key={workspace.id}
            type="button"
            role="tab"
            aria-selected={selectedWorkspace === workspace.id}
            $active={selectedWorkspace === workspace.id}
            $variant="accent"
            onClick={() => setSelectedWorkspace(workspace.id)}
          >
            {workspace.label}
          </ModeTab>
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
            <ModeSettingsSection
              currentAgent={currentAgent}
              selectedModeDefinition={selectedModeDefinition}
              isSelectedModeDefault={currentAgent.defaultModeId === selectedModeDefinition.id}
              canDisableSelectedMode={!selectedModeDefinition.enabled || enabledModes.length > 1}
              canDeleteSelectedMode={selectedModeDefinition.source === "custom" && currentAgent.modes.length > 1}
              updateModeDefinition={updateModeDefinition}
              updateSelectedModeBehavior={updateSelectedModeBehavior}
              deleteCustomMode={deleteCustomMode}
              onChange={onChange}
            />
            <ModeInstructionSection
              selectedModeConfig={selectedModeConfig}
              defaultModeInstruction={defaultModeInstruction}
              isCustomizedModeInstruction={selectedModeConfig.modeInstruction.trim() !== defaultModeInstruction.trim()}
              updateModeConfig={updateModeConfig}
            />
            <PromptSectionsSection
              selectedModeConfig={selectedModeConfig}
              getPromptSectionDefault={getPromptSectionDefault}
              updateModeConfig={updateModeConfig}
            />
          </>
        )}

        {selectedWorkspace === "tools" && (
          <InternalToolsSection
            selectedModeConfig={selectedModeConfig}
            internalTools={internalTools}
            mcps={mcps}
            getEffectiveToolInstruction={getEffectiveToolInstruction}
            getToolInstructionFallback={getToolInstructionFallback}
            getDefaultAccessScope={getDefaultAccessScope}
            getEffectiveAccessScope={getEffectiveAccessScope}
            updateModeConfig={updateModeConfig}
          />
        )}

        {selectedWorkspace === "mcps" && (
          <ExternalMcpsSection
            selectedModeConfig={selectedModeConfig}
            internalTools={internalTools}
            mcps={mcps}
            updateModeConfig={updateModeConfig}
          />
        )}

        {selectedWorkspace === "skills" && (
          <SkillsSection
            selectedModeConfig={selectedModeConfig}
            skills={skills}
            updateModeConfig={updateModeConfig}
          />
        )}
      </AgentWorkspacePanel>

    </EditorArea>
  );
}
