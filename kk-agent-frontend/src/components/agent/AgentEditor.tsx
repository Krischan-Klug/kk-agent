import { useState } from "react";
import type {
  AgentDefinition,
  AgentModeDefinition,
  AgentModeConfig,
  AppDefaults,
  ModeBehavior,
  McpListItem,
  ModelInfo,
  ModelSettings,
  ProviderConfig,
  SkillDefinition,
  ToolAccessScope,
} from "@/types/api";
import {
  buildMaxOutputOptions,
  buildTemperatureOptions,
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
} from "@/lib/modelCapabilities";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "@/lib/llmRequestConfig";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import {
  ActionsRow,
  EmptyHint,
  MutedText,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import {
  CapabilityHeader,
  CapabilityRow,
  CheckboxRow,
  EditorArea,
  ExpandButton,
  HeaderActions,
  IconActionButton,
  InlineSelect,
  NestedToolCard,
  NestedToolList,
  OverrideMark,
  ScopeRow,
  StatusDot,
  ToolDescription,
  ToolName,
} from "./AgentEditor.styled";
import {
  createCustomMode,
  getCapabilityToolNames,
  getConcreteRuntimeTools,
  hasAllowedToolForCapability,
  isScopeCapableTool,
  isToolAllowed,
  normalizeAllowedToolNames,
  OVERRIDE_EMOJI,
  RESET_EMOJI,
  setCapabilityInstruction,
  SKILL_EMOJI,
} from "./AgentEditor.helpers";
import {
  AgentInfoSection,
  AutonomousBudgetSection,
  ModeInstructionSection,
  ModeSettingsSection,
  PromptSectionsSection,
  VariablesSection,
} from "./AgentEditor.sections";

type Props = {
  agent: AgentDefinition | null;
  providers: ProviderConfig[];
  mcps: McpListItem[];
  internalTools: McpListItem[];
  skills: SkillDefinition[];
  models: ModelInfo[];
  modelSettings: Record<string, ModelSettings>;
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
  modelSettings,
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
  const [visibleSkillInstructions, setVisibleSkillInstructions] = useState<Record<string, boolean>>({});

  if (!agent) {
    return (
      <EditorArea>
        <EmptyHint>Waehle einen Agent aus oder erstelle einen neuen.</EmptyHint>
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
  const selectedModelInfo = currentAgent.defaultModel
    ? models.find((model) => model.id === currentAgent.defaultModel)
    : undefined;
  const selectedModelSettings = selectedModelInfo ? modelSettings[selectedModelInfo.id] : undefined;
  const selectedEndpoint = currentAgent.llmRequestConfig?.common?.endpoint
    ?? getResolvedEndpoint(selectedModelInfo, selectedModelSettings);
  const endpointCapabilities = getEndpointCapabilities(selectedModelInfo, selectedEndpoint);
  const reasoningLevels = getReasoningLevels(selectedModelInfo);
  const showReasoning = reasoningLevels.length > 0;
  const showTemperature = endpointCapabilities.temperatureSupported;
  const temperatureOptions = buildTemperatureOptions(endpointCapabilities.temperatureRange);
  const showMaxOutputTokens = endpointCapabilities.maxOutputTokensSupported;
  const maxOutputOptions = buildMaxOutputOptions(
    endpointCapabilities.maxOutputTokensRange,
    endpointCapabilities.maxOutputTokensRange?.max,
  );
  const selectedModeConfig = selectedModeDefinition.config;
  const modeTemplate = defaults?.agent.modeTemplates[selectedModeDefinition.behavior];
  const defaultModeInstruction = modeTemplate?.modeInstruction ?? "";
  const isCustomizedModeInstruction = selectedModeConfig.modeInstruction.trim() !== defaultModeInstruction.trim();
  const isSelectedModeDefault = currentAgent.defaultModeId === selectedModeDefinition.id;
  const canDisableSelectedMode = !selectedModeDefinition.enabled || enabledModes.length > 1;
  const canDeleteSelectedMode = selectedModeDefinition.source === "custom" && currentAgent.modes.length > 1;

  function getPromptSectionDefault(section: keyof AgentModeConfig["promptSections"]): string {
    return defaults?.agent.promptSections[section] ?? "";
  }

  function getToolInstructionFallback(toolId: string, fallback?: string): string {
    return modeTemplate?.toolInstructions?.[toolId] ?? fallback ?? "";
  }

  function getEffectiveToolInstruction(toolId: string, fallback?: string): string {
    return selectedModeConfig.toolInstructions[toolId] ?? getToolInstructionFallback(toolId, fallback);
  }

  function getEffectiveSkillInstruction(skillId: string, fallback: string): string {
    return selectedModeConfig.skillInstructions[skillId] ?? fallback;
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

  function updateLlmRequestConfig(patch: NonNullable<AgentDefinition["llmRequestConfig"]>) {
    onChange({
      ...currentAgent,
      llmRequestConfig: compactLlmRequestConfig(mergeLlmRequestConfigs(currentAgent.llmRequestConfig, patch)),
    });
  }

  function updateCommonRequestConfig(patch: NonNullable<AgentDefinition["llmRequestConfig"]>["common"]) {
    updateLlmRequestConfig({ common: patch });
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
    onChange({
      ...currentAgent,
      modes: [...currentAgent.modes, nextMode],
    });
    setSelectedModeId(nextMode.id);
  }

  function deleteCustomMode(modeId: string) {
    const nextModes = currentAgent.modes.filter((mode) => mode.id !== modeId);
    const nextEnabledModes = nextModes.filter((mode) => mode.enabled);
    if (nextEnabledModes.length === 0) return;
    const nextDefaultModeId = currentAgent.defaultModeId === modeId
      ? nextEnabledModes[0]!.id
      : currentAgent.defaultModeId;
    onChange({
      ...currentAgent,
      defaultModeId: nextDefaultModeId,
      modes: nextModes,
    });
    setSelectedModeId(nextDefaultModeId);
  }

  function updateSelectedModeBehavior(behavior: ModeBehavior) {
    updateModeDefinition(selectedModeDefinition.id, (mode) => ({
      ...mode,
      behavior,
      config: {
        ...mode.config,
        skillIds: mode.config.skillIds.filter((skillId) => {
          const skill = skills.find((entry) => entry.id === skillId);
          return !skill || skill.allowedModeBehaviors.includes(behavior);
        }),
      },
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
        showReasoning={showReasoning}
        reasoningLevels={reasoningLevels}
        showTemperature={showTemperature}
        temperatureOptions={temperatureOptions}
        showMaxOutputTokens={showMaxOutputTokens}
        maxOutputOptions={maxOutputOptions}
        setSelectedModeId={setSelectedModeId}
        addCustomMode={addCustomMode}
        updateCommonRequestConfig={updateCommonRequestConfig}
        onChange={onChange}
      />

      <ModeSettingsSection
        currentAgent={currentAgent}
        selectedModeDefinition={selectedModeDefinition}
        isSelectedModeDefault={isSelectedModeDefault}
        canDisableSelectedMode={canDisableSelectedMode}
        canDeleteSelectedMode={canDeleteSelectedMode}
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
        isCustomizedModeInstruction={isCustomizedModeInstruction}
        updateModeConfig={updateModeConfig}
      />

      {selectedModeDefinition.behavior === "autonomous" && (
        <AutonomousBudgetSection
          selectedModeConfig={selectedModeConfig}
          updateModeConfig={updateModeConfig}
        />
      )}

      <Section>
        <SectionTitle>Internal Tools</SectionTitle>
        {internalTools.map((toolGroup) => {
          const isActive = selectedModeConfig.toolIds.includes(toolGroup.id);
          const capabilityToolNames = getCapabilityToolNames(toolGroup);
          const isExpanded = expandedInternalTools[toolGroup.id] ?? false;
          const showInstruction = visibleToolInstructions[toolGroup.id] ?? false;
          const effectiveInstruction = getEffectiveToolInstruction(toolGroup.id, toolGroup.instruction);
          const isCustomized = effectiveInstruction.trim() !== getToolInstructionFallback(toolGroup.id, toolGroup.instruction).trim();
          const isScopeCapable = isScopeCapableTool(toolGroup.id);
          const effectiveAccessScope = getEffectiveAccessScope(toolGroup.id);
          const hasScopeOverride = selectedModeConfig.toolAccessScopes[toolGroup.id] !== undefined;

          return (
            <CapabilityRow key={toolGroup.id} $active={isActive}>
              <CapabilityHeader>
                <CheckboxRow>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => {
                      const nextToolIds = isActive
                        ? selectedModeConfig.toolIds.filter((id) => id !== toolGroup.id)
                        : [...selectedModeConfig.toolIds, toolGroup.id];
                      const nextAllowedRaw = isActive
                        ? selectedModeConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name))
                        : [...selectedModeConfig.allowedToolNames, ...capabilityToolNames];
                      const nextModeConfig = { ...selectedModeConfig, toolIds: nextToolIds };
                      const nextConcreteTools = getConcreteRuntimeTools(nextModeConfig, internalTools, mcps);
                      updateModeConfig({
                        ...nextModeConfig,
                        allowedToolNames: normalizeAllowedToolNames(nextAllowedRaw, nextConcreteTools),
                      });
                    }}
                  />
                  <span style={{ fontSize: "1.1em" }}>{toolGroup.emoji || "T"}</span>
                  <span style={{ fontWeight: 500 }}>{toolGroup.name}</span>
                  <StatusDot $running={toolGroup.running} />
                </CheckboxRow>
                {isActive && (
                  <HeaderActions>
                    <ExpandButton
                      type="button"
                      onClick={() => setExpandedInternalTools((previous) => ({
                        ...previous,
                        [toolGroup.id]: !isExpanded,
                      }))}
                    >
                      {isExpanded ? "Weniger" : "Details"}
                    </ExpandButton>
                    <ExpandButton
                      type="button"
                      onClick={() => setVisibleToolInstructions((previous) => ({
                        ...previous,
                        [toolGroup.id]: !showInstruction,
                      }))}
                    >
                      {showInstruction ? "Instruction ausblenden" : "Instruction anzeigen"}
                    </ExpandButton>
                    {isCustomized && (
                      <>
                        <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
                        <IconActionButton
                          type="button"
                          title="Auf Default zuruecksetzen"
                          onClick={() => updateModeConfig({
                            ...selectedModeConfig,
                            toolInstructions: setCapabilityInstruction(
                              selectedModeConfig.toolInstructions,
                              toolGroup.id,
                              getToolInstructionFallback(toolGroup.id, toolGroup.instruction),
                              getToolInstructionFallback(toolGroup.id, toolGroup.instruction),
                            ),
                          })}
                        >
                          {RESET_EMOJI}
                        </IconActionButton>
                      </>
                    )}
                  </HeaderActions>
                )}
              </CapabilityHeader>
              {isActive && (
                <>
                  {showInstruction && (
                    <TextArea
                      rows={4}
                      value={effectiveInstruction}
                      onChange={(e) => updateModeConfig({
                        ...selectedModeConfig,
                        toolInstructions: setCapabilityInstruction(
                          selectedModeConfig.toolInstructions,
                          toolGroup.id,
                          e.target.value,
                          getToolInstructionFallback(toolGroup.id, toolGroup.instruction),
                        ),
                      })}
                    />
                  )}
                  {isScopeCapable && (
                    <ScopeRow>
                      <CheckboxRow as="div">
                        <span>Access Scope</span>
                      </CheckboxRow>
                      <HeaderActions>
                        <InlineSelect
                          value={effectiveAccessScope}
                          onChange={(e) => {
                            const nextScope = e.target.value as ToolAccessScope;
                            const nextScopes = { ...selectedModeConfig.toolAccessScopes };
                            if (nextScope === getDefaultAccessScope(toolGroup.id)) {
                              delete nextScopes[toolGroup.id];
                            } else {
                              nextScopes[toolGroup.id] = nextScope;
                            }
                            updateModeConfig({ ...selectedModeConfig, toolAccessScopes: nextScopes });
                          }}
                        >
                          <option value="user">user</option>
                          <option value="system">system</option>
                        </InlineSelect>
                        {hasScopeOverride && (
                          <>
                            <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
                            <IconActionButton
                              type="button"
                              title="Auf Default zuruecksetzen"
                              onClick={() => {
                                const nextScopes = { ...selectedModeConfig.toolAccessScopes };
                                delete nextScopes[toolGroup.id];
                                updateModeConfig({ ...selectedModeConfig, toolAccessScopes: nextScopes });
                              }}
                            >
                              {RESET_EMOJI}
                            </IconActionButton>
                          </>
                        )}
                      </HeaderActions>
                    </ScopeRow>
                  )}
                  {isExpanded && (
                    <NestedToolList>
                      {toolGroup.tools.map((tool) => {
                        const allowed = isToolAllowed(selectedModeConfig, tool.name);
                        return (
                          <NestedToolCard key={tool.name} $active={allowed}>
                            <CheckboxRow>
                              <input
                                type="checkbox"
                                checked={allowed}
                                onChange={() => {
                                  const deduped = [...new Set(selectedModeConfig.allowedToolNames)];
                                  const updated = allowed
                                    ? deduped.filter((entry) => entry !== tool.name)
                                    : [...deduped, tool.name];
                                  const nextToolIds = hasAllowedToolForCapability(updated, capabilityToolNames)
                                    ? selectedModeConfig.toolIds
                                    : selectedModeConfig.toolIds.filter((entry) => entry !== toolGroup.id);
                                  const nextModeConfig = {
                                    ...selectedModeConfig,
                                    toolIds: nextToolIds,
                                  };
                                  updateModeConfig({
                                    ...nextModeConfig,
                                    allowedToolNames: normalizeAllowedToolNames(
                                      updated,
                                      getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                                    ),
                                  });
                                }}
                              />
                              <ToolName>{tool.name}</ToolName>
                            </CheckboxRow>
                            <ToolDescription>{tool.description}</ToolDescription>
                          </NestedToolCard>
                        );
                      })}
                    </NestedToolList>
                  )}
                </>
              )}
            </CapabilityRow>
          );
        })}
      </Section>

      <Section>
        <SectionTitle>External MCPs</SectionTitle>
        {mcps.map((mcp) => {
          const isActive = selectedModeConfig.mcpIds.includes(mcp.id);
          const capabilityToolNames = getCapabilityToolNames(mcp);
          const isExpanded = expandedMcps[mcp.id] ?? false;
          const showInstruction = visibleMcpInstructions[mcp.id] ?? false;
          const effectiveInstruction = selectedModeConfig.mcpInstructions[mcp.id] ?? mcp.instruction ?? "";
          const isCustomized = effectiveInstruction.trim() !== (mcp.instruction ?? "").trim();

          return (
            <CapabilityRow key={mcp.id} $active={isActive}>
              <CapabilityHeader>
                <CheckboxRow>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => {
                      const nextMcpIds = isActive
                        ? selectedModeConfig.mcpIds.filter((id) => id !== mcp.id)
                        : [...selectedModeConfig.mcpIds, mcp.id];
                      const nextAllowedRaw = isActive
                        ? selectedModeConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name))
                        : [...selectedModeConfig.allowedToolNames, ...capabilityToolNames];
                      const nextModeConfig = { ...selectedModeConfig, mcpIds: nextMcpIds };
                      updateModeConfig({
                        ...nextModeConfig,
                        allowedToolNames: normalizeAllowedToolNames(
                          nextAllowedRaw,
                          getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                        ),
                      });
                    }}
                  />
                  <span style={{ fontSize: "1.1em" }}>{mcp.emoji || "M"}</span>
                  <span>{mcp.name}</span>
                  <StatusDot $running={mcp.running} />
                </CheckboxRow>
                {isActive && (
                  <HeaderActions>
                    <ExpandButton
                      type="button"
                      onClick={() => setExpandedMcps((previous) => ({
                        ...previous,
                        [mcp.id]: !isExpanded,
                      }))}
                    >
                      {isExpanded ? "Weniger" : "Details"}
                    </ExpandButton>
                    <ExpandButton
                      type="button"
                      onClick={() => setVisibleMcpInstructions((previous) => ({
                        ...previous,
                        [mcp.id]: !showInstruction,
                      }))}
                    >
                      {showInstruction ? "Instruction ausblenden" : "Instruction anzeigen"}
                    </ExpandButton>
                    {isCustomized && (
                      <>
                        <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
                        <IconActionButton
                          type="button"
                          title="Auf Default zuruecksetzen"
                          onClick={() => updateModeConfig({
                            ...selectedModeConfig,
                            mcpInstructions: setCapabilityInstruction(
                              selectedModeConfig.mcpInstructions,
                              mcp.id,
                              mcp.instruction ?? "",
                              mcp.instruction,
                            ),
                          })}
                        >
                          {RESET_EMOJI}
                        </IconActionButton>
                      </>
                    )}
                  </HeaderActions>
                )}
              </CapabilityHeader>
              {isActive && showInstruction && (
                <TextArea
                  rows={4}
                  value={effectiveInstruction}
                  onChange={(e) => updateModeConfig({
                    ...selectedModeConfig,
                    mcpInstructions: setCapabilityInstruction(
                      selectedModeConfig.mcpInstructions,
                      mcp.id,
                      e.target.value,
                      mcp.instruction,
                    ),
                  })}
                />
              )}
              {isActive && isExpanded && (
                <NestedToolList>
                  {mcp.tools.map((tool) => {
                    const allowed = isToolAllowed(selectedModeConfig, tool.name);
                    return (
                      <NestedToolCard key={tool.name} $active={allowed}>
                        <CheckboxRow>
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={() => {
                              const deduped = [...new Set(selectedModeConfig.allowedToolNames)];
                              const updated = allowed
                                ? deduped.filter((entry) => entry !== tool.name)
                                : [...deduped, tool.name];
                              const nextMcpIds = hasAllowedToolForCapability(updated, capabilityToolNames)
                                ? selectedModeConfig.mcpIds
                                : selectedModeConfig.mcpIds.filter((entry) => entry !== mcp.id);
                              const nextModeConfig = {
                                ...selectedModeConfig,
                                mcpIds: nextMcpIds,
                              };
                              updateModeConfig({
                                ...nextModeConfig,
                                allowedToolNames: normalizeAllowedToolNames(
                                  updated,
                                  getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                                ),
                              });
                            }}
                          />
                          <ToolName>{tool.name}</ToolName>
                        </CheckboxRow>
                        <ToolDescription>{tool.description}</ToolDescription>
                      </NestedToolCard>
                    );
                  })}
                </NestedToolList>
              )}
            </CapabilityRow>
          );
        })}
      </Section>

      <Section>
        <SectionTitle>{SKILL_EMOJI} Skills</SectionTitle>
        {skills.map((skill) => {
          const isActive = selectedModeConfig.skillIds.includes(skill.id);
          const showInstruction = visibleSkillInstructions[skill.id] ?? false;
          const isAvailableInMode = skill.allowedModeBehaviors.includes(selectedModeDefinition.behavior);
          const effectiveInstruction = getEffectiveSkillInstruction(skill.id, skill.instruction);
          const isCustomized = effectiveInstruction.trim() !== skill.instruction.trim();

          return (
            <CapabilityRow key={skill.id} $active={isActive && skill.active && isAvailableInMode}>
              <CapabilityHeader>
                <CheckboxRow>
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={!skill.active || (!isAvailableInMode && !isActive)}
                    onChange={() => {
                      const nextSkillIds = isActive
                        ? selectedModeConfig.skillIds.filter((id) => id !== skill.id)
                        : [...selectedModeConfig.skillIds, skill.id];
                      updateModeConfig({
                        ...selectedModeConfig,
                        skillIds: [...new Set(nextSkillIds)],
                      });
                    }}
                  />
                  <span style={{ fontSize: "1.1em" }}>{SKILL_EMOJI}</span>
                  <span style={{ fontWeight: 500 }}>{skill.name}</span>
                  <StatusDot $running={skill.active && isAvailableInMode} />
                </CheckboxRow>
                {isActive && (
                  <HeaderActions>
                    <ExpandButton
                      type="button"
                      onClick={() => setVisibleSkillInstructions((previous) => ({
                        ...previous,
                        [skill.id]: !showInstruction,
                      }))}
                    >
                      {showInstruction ? "Instruction ausblenden" : "Instruction anzeigen"}
                    </ExpandButton>
                    {isCustomized && (
                      <>
                        <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
                        <IconActionButton
                          type="button"
                          title="Auf Skill-Default zuruecksetzen"
                          onClick={() => updateModeConfig({
                            ...selectedModeConfig,
                            skillInstructions: setCapabilityInstruction(
                              selectedModeConfig.skillInstructions,
                              skill.id,
                              skill.instruction,
                              skill.instruction,
                            ),
                          })}
                        >
                          {RESET_EMOJI}
                        </IconActionButton>
                      </>
                    )}
                  </HeaderActions>
                )}
              </CapabilityHeader>
              <MutedText>{skill.description}</MutedText>
              <MutedText>
                Behavior: {skill.allowedModeBehaviors.join(", ")}
                {skill.recommendedToolIds.length > 0 ? ` | Tools: ${skill.recommendedToolIds.join(", ")}` : ""}
                {skill.recommendedMcpIds.length > 0 ? ` | MCPs: ${skill.recommendedMcpIds.join(", ")}` : ""}
              </MutedText>
              {!skill.active && <MutedText>Skill ist global deaktiviert.</MutedText>}
              {skill.active && !isAvailableInMode && <MutedText>In diesem Mode nicht verfuegbar.</MutedText>}
              {isActive && showInstruction && (
                <TextArea
                  rows={6}
                  value={effectiveInstruction}
                  onChange={(e) => updateModeConfig({
                    ...selectedModeConfig,
                    skillInstructions: setCapabilityInstruction(
                      selectedModeConfig.skillInstructions,
                      skill.id,
                      e.target.value,
                      skill.instruction,
                    ),
                  })}
                />
              )}
            </CapabilityRow>
          );
        })}
        {skills.length === 0 && <EmptyHint>Keine Skills konfiguriert.</EmptyHint>}
      </Section>

      <ActionsRow>
        <Button onClick={onSave} disabled={saving}>{saving ? "Speichert..." : "Speichern"}</Button>
        <Button variant="danger" onClick={onDelete}>Loeschen</Button>
      </ActionsRow>
    </EditorArea>
  );
}
