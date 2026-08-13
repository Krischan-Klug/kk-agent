import { useState } from "react";
import type {
  AgentDefinition,
  AgentModeDefinition,
  AgentModeConfig,
  AppDefaults,
  ModeBehavior,
  McpListItem,
  ModelInfo,
  ProviderConfig,
  SkillDefinition,
  ToolAccessScope,
} from "@/types/api";
import { getReasoningLevels } from "@/lib/modelCapabilities";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "@/lib/llmRequestConfig";
import { getAgentModelRef, toModelRef } from "@/lib/modelRefs";
import Button from "@/components/Button";
import { ActionsRow, EmptyHint } from "@/components/PageForm";
import { EditorArea } from "./AgentEditor.styled";
import { createCustomMode } from "./AgentEditor.helpers";
import {
  AgentInfoSection,
  AutonomousBudgetSection,
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
  internalTools: McpListItem[];
  skills: SkillDefinition[];
  models: ModelInfo[];
  defaults: AppDefaults | null;
  systemVariables: string[];
  saving: boolean;
  showSystemVariables: boolean;
  onToggleSystemVariables: () => void;
  onChange: (agent: AgentDefinition) => void;
  onSave: () => void;
  onDelete: () => void;
};

export default function AgentEditor({
  agent,
  providers,
  mcps,
  internalTools,
  skills,
  models,
  defaults,
  systemVariables,
  saving,
  showSystemVariables,
  onToggleSystemVariables,
  onChange,
  onSave,
  onDelete,
}: Props) {
  const [selectedModeId, setSelectedModeId] = useState<string>("edit");
  const [expandedInternalTools, setExpandedInternalTools] = useState<Record<string, boolean>>({});
  const [expandedMcps, setExpandedMcps] = useState<Record<string, boolean>>({});
  const [visibleToolInstructions, setVisibleToolInstructions] = useState<Record<string, boolean>>({});
  const [visibleMcpInstructions, setVisibleMcpInstructions] = useState<Record<string, boolean>>({});

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
  const modeTemplate = defaults?.agent.modeTemplates[selectedModeDefinition.behavior];
  const defaultModeInstruction = modeTemplate?.modeInstruction ?? "";

  function getPromptSectionDefault(section: keyof AgentModeConfig["promptSections"]): string {
    return defaults?.agent.promptSections[section] ?? "";
  }

  function getToolInstructionFallback(toolId: string, fallback?: string): string {
    return modeTemplate?.toolInstructions?.[toolId] ?? fallback ?? "";
  }

  function getEffectiveToolInstruction(toolId: string, fallback?: string): string {
    return selectedModeConfig.toolInstructions[toolId] ?? getToolInstructionFallback(toolId, fallback);
  }

  function getDefaultAccessScope(toolId: string): ToolAccessScope {
    const tool = internalTools.find((entry) => entry.id === toolId);
    return tool?.systemConfig?.accessScope === "system" ? "system" : "user";
  }

  function getEffectiveAccessScope(toolId: string): ToolAccessScope {
    return selectedModeConfig.toolAccessScopes[toolId] ?? getDefaultAccessScope(toolId);
  }

  function updateModeConfig(nextConfig: AgentModeConfig) {
    onChange({
      ...currentAgent,
      modes: currentAgent.modes.map((mode) => mode.id === effectiveSelectedModeId
        ? { ...mode, config: nextConfig }
        : mode),
    });
  }

  function updateCommonRequestConfig(patch: NonNullable<AgentDefinition["llmRequestConfig"]>["common"]) {
    onChange({
      ...currentAgent,
      llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(currentAgent.llmRequestConfig, { common: patch })),
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
    const nextMode = createCustomMode(currentAgent, defaults, selectedModeDefinition.behavior);
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
        updateCommonRequestConfig={updateCommonRequestConfig}
        updateRequestConfig={(value) => onChange({
          ...currentAgent,
          llmRequestConfig: compactLlmRequestConfig(value),
        })}
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

      <VariablesSection
        currentAgent={currentAgent}
        showSystemVariables={showSystemVariables}
        systemVariables={systemVariables}
        onToggleSystemVariables={onToggleSystemVariables}
        onChange={onChange}
      />

      <PromptSectionsSection
        selectedModeConfig={selectedModeConfig}
        getPromptSectionDefault={getPromptSectionDefault}
        updateModeConfig={updateModeConfig}
      />

      <ModeInstructionSection
        selectedModeConfig={selectedModeConfig}
        defaultModeInstruction={defaultModeInstruction}
        isCustomizedModeInstruction={selectedModeConfig.modeInstruction.trim() !== defaultModeInstruction.trim()}
        updateModeConfig={updateModeConfig}
      />

      {selectedModeDefinition.behavior === "autonomous" && (
        <AutonomousBudgetSection selectedModeConfig={selectedModeConfig} updateModeConfig={updateModeConfig} />
      )}

      <InternalToolsSection
        selectedModeConfig={selectedModeConfig}
        internalTools={internalTools}
        mcps={mcps}
        expandedInternalTools={expandedInternalTools}
        visibleToolInstructions={visibleToolInstructions}
        setExpandedInternalTools={setExpandedInternalTools}
        setVisibleToolInstructions={setVisibleToolInstructions}
        getEffectiveToolInstruction={getEffectiveToolInstruction}
        getToolInstructionFallback={getToolInstructionFallback}
        getDefaultAccessScope={getDefaultAccessScope}
        getEffectiveAccessScope={getEffectiveAccessScope}
        updateModeConfig={updateModeConfig}
      />

      <ExternalMcpsSection
        selectedModeConfig={selectedModeConfig}
        internalTools={internalTools}
        mcps={mcps}
        expandedMcps={expandedMcps}
        visibleMcpInstructions={visibleMcpInstructions}
        setExpandedMcps={setExpandedMcps}
        setVisibleMcpInstructions={setVisibleMcpInstructions}
        updateModeConfig={updateModeConfig}
      />

      <SkillsSection
        selectedModeConfig={selectedModeConfig}
        skills={skills}
        updateModeConfig={updateModeConfig}
      />

      <ActionsRow>
        <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        <Button variant="danger" onClick={onDelete}>Delete</Button>
      </ActionsRow>
    </EditorArea>
  );
}
