import type { Dispatch, SetStateAction } from "react";
import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeDefinition,
  ModeBehavior,
  McpListItem,
  ModelInfo,
  ProviderConfig,
  ReasoningEffort,
  SkillDefinition,
  ToolAccessScope,
} from "@/types/api";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import KeyValueEditor from "@/components/KeyValueEditor";
import {
  ActionsRow,
  EmptyHint,
  FieldLabel,
  FormField,
  FormRow,
  MutedText,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import {
  CapabilityHeader,
  CapabilityRow,
  CheckboxRow,
  ExpandButton,
  HeaderActions,
  IconActionButton,
  InlineSelect,
  LabelRow,
  ModeStatusDot,
  ModeTab,
  ModeTabContent,
  ModeTabs,
  NestedToolCard,
  NestedToolList,
  OverrideMark,
  ScopeRow,
  Select,
  StatusDot,
  ToolDescription,
  ToolName,
} from "./AgentEditor.styled";
import {
  getCapabilityToolNames,
  getConcreteRuntimeTools,
  hasAllowedToolForCapability,
  isScopeCapableTool,
  isToolAllowed,
  MODE_BEHAVIORS,
  normalizeAllowedToolNames,
  OVERRIDE_EMOJI,
  PROMPT_SECTION_META,
  RESET_EMOJI,
  setCapabilityInstruction,
  SKILL_EMOJI,
} from "./AgentEditor.helpers";

type SelectOption = {
  value: string | number;
  label: string;
};

type AgentInfoSectionProps = {
  currentAgent: AgentDefinition;
  enabledModes: AgentModeDefinition[];
  effectiveSelectedModeId: string;
  providers: ProviderConfig[];
  models: ModelInfo[];
  showReasoning: boolean;
  reasoningLevels: ReasoningEffort[];
  showTemperature: boolean;
  temperatureOptions: SelectOption[];
  showMaxOutputTokens: boolean;
  maxOutputOptions: SelectOption[];
  setSelectedModeId: Dispatch<SetStateAction<string>>;
  addCustomMode: () => void;
  updateCommonRequestConfig: (patch: NonNullable<AgentDefinition["llmRequestConfig"]>["common"]) => void;
  onChange: (agent: AgentDefinition) => void;
};

export function AgentInfoSection({
  currentAgent,
  enabledModes,
  effectiveSelectedModeId,
  providers,
  models,
  showReasoning,
  reasoningLevels,
  showTemperature,
  temperatureOptions,
  showMaxOutputTokens,
  maxOutputOptions,
  setSelectedModeId,
  addCustomMode,
  updateCommonRequestConfig,
  onChange,
}: AgentInfoSectionProps) {
  return (
    <Section>
      <SectionTitle>Agent Info</SectionTitle>
      <FormRow>
        <FormField $flex={1}>
          <FieldLabel>Name</FieldLabel>
          <Input value={currentAgent.name} onChange={(e) => onChange({ ...currentAgent, name: e.target.value })} />
        </FormField>
        <FormField $flex={2}>
          <FieldLabel>Beschreibung</FieldLabel>
          <Input value={currentAgent.description} onChange={(e) => onChange({ ...currentAgent, description: e.target.value })} />
        </FormField>
        <FormField>
          <FieldLabel>Default Mode</FieldLabel>
          <Select
            value={currentAgent.defaultModeId}
            onChange={(e) => onChange({ ...currentAgent, defaultModeId: e.target.value })}
          >
            {enabledModes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </Select>
        </FormField>
      </FormRow>
      <FormRow>
        <FormField>
          <FieldLabel>Default Provider</FieldLabel>
          <Select
            value={currentAgent.defaultProviderId ?? ""}
            onChange={(e) => onChange({
              ...currentAgent,
              defaultProviderId: e.target.value || undefined,
              defaultModel: undefined,
            })}
          >
            <option value="">-- Kein Default --</option>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </Select>
        </FormField>
        <FormField>
          <FieldLabel>Modes</FieldLabel>
          <ModeTabs>
            {currentAgent.modes.map((mode) => (
              <ModeTab key={mode.id} type="button" $active={mode.id === effectiveSelectedModeId} onClick={() => setSelectedModeId(mode.id)}>
                <ModeTabContent>
                  <ModeStatusDot $enabled={mode.enabled} $active={mode.id === effectiveSelectedModeId} />
                  <span>{mode.label}</span>
                </ModeTabContent>
              </ModeTab>
            ))}
          </ModeTabs>
          <ActionsRow>
            <Button type="button" size="sm" variant="secondary" onClick={addCustomMode}>
              Custom Mode hinzufuegen
            </Button>
          </ActionsRow>
        </FormField>
        <FormField>
          <FieldLabel>Default Model</FieldLabel>
          <Select
            value={currentAgent.defaultModel ?? ""}
            onChange={(e) => onChange({ ...currentAgent, defaultModel: e.target.value || undefined })}
            disabled={!currentAgent.defaultProviderId}
          >
            <option value="">-- Kein Default --</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
          </Select>
        </FormField>
        {showReasoning && (
          <FormField>
            <FieldLabel>Default Reasoning</FieldLabel>
            <Select
              value={currentAgent.llmRequestConfig?.common?.reasoningEffort ?? ""}
              onChange={(e) => updateCommonRequestConfig({
                reasoningEffort: normalizeCanonicalReasoningEffort(e.target.value),
              })}
            >
              <option value="">-- Default --</option>
              {reasoningLevels.map((level) => <option key={level} value={level}>{level}</option>)}
            </Select>
          </FormField>
        )}
        {showTemperature && (
          <FormField>
            <FieldLabel>Temperature Override</FieldLabel>
            <Select
              value={currentAgent.llmRequestConfig?.common?.temperature !== undefined
                ? currentAgent.llmRequestConfig.common.temperature.toFixed(1)
                : ""}
              onChange={(e) => updateCommonRequestConfig({
                temperature: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            >
              <option value="">-- Default --</option>
              {temperatureOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </FormField>
        )}
        {showMaxOutputTokens && (
          <FormField>
            <FieldLabel>Max Output Tokens Override</FieldLabel>
            <Select
              value={currentAgent.llmRequestConfig?.common?.maxOutputTokens !== undefined
                ? String(currentAgent.llmRequestConfig.common.maxOutputTokens)
                : ""}
              onChange={(e) => updateCommonRequestConfig({
                maxOutputTokens: e.target.value === "" ? undefined : Number(e.target.value),
              })}
            >
              <option value="">-- Default --</option>
              {maxOutputOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </FormField>
        )}
      </FormRow>
    </Section>
  );
}

type ModeSettingsSectionProps = {
  currentAgent: AgentDefinition;
  selectedModeDefinition: AgentModeDefinition;
  isSelectedModeDefault: boolean;
  canDisableSelectedMode: boolean;
  canDeleteSelectedMode: boolean;
  updateModeDefinition: (modeId: string, transform: (mode: AgentModeDefinition) => AgentModeDefinition) => void;
  updateSelectedModeBehavior: (behavior: ModeBehavior) => void;
  deleteCustomMode: (modeId: string) => void;
  onChange: (agent: AgentDefinition) => void;
};

export function ModeSettingsSection({
  currentAgent,
  selectedModeDefinition,
  isSelectedModeDefault,
  canDisableSelectedMode,
  canDeleteSelectedMode,
  updateModeDefinition,
  updateSelectedModeBehavior,
  deleteCustomMode,
  onChange,
}: ModeSettingsSectionProps) {
  return (
    <Section>
      <SectionTitle>Mode Settings</SectionTitle>
      <FormRow>
        <FormField $flex={1} $minWidth="220px">
          <FieldLabel>Mode Label</FieldLabel>
          <Input
            value={selectedModeDefinition.label}
            disabled={selectedModeDefinition.source === "builtin"}
            onChange={(e) => updateModeDefinition(selectedModeDefinition.id, (mode) => ({
              ...mode,
              label: e.target.value,
            }))}
          />
        </FormField>
        <FormField $minWidth="180px">
          <FieldLabel>Mode Behavior</FieldLabel>
          <Select
            value={selectedModeDefinition.behavior}
            disabled={selectedModeDefinition.source === "builtin"}
            onChange={(e) => updateSelectedModeBehavior(e.target.value as ModeBehavior)}
          >
            {MODE_BEHAVIORS.map((behavior) => (
              <option key={behavior} value={behavior}>{behavior}</option>
            ))}
          </Select>
        </FormField>
        <FormField $minWidth="220px">
          <FieldLabel>Mode Status</FieldLabel>
          <ActionsRow>
            <CheckboxRow>
              <input
                type="checkbox"
                checked={selectedModeDefinition.enabled}
                disabled={!canDisableSelectedMode}
                onChange={(e) => updateModeDefinition(selectedModeDefinition.id, (mode) => ({
                  ...mode,
                  enabled: e.target.checked,
                }))}
              />
              <span>Aktiviert</span>
            </CheckboxRow>
            {!isSelectedModeDefault && selectedModeDefinition.enabled && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ ...currentAgent, defaultModeId: selectedModeDefinition.id })}
              >
                Als Default setzen
              </Button>
            )}
            {canDeleteSelectedMode && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => deleteCustomMode(selectedModeDefinition.id)}
              >
                Loeschen
              </Button>
            )}
          </ActionsRow>
          <MutedText>
            Source: {selectedModeDefinition.source} | Id: {selectedModeDefinition.id}
          </MutedText>
        </FormField>
      </FormRow>
    </Section>
  );
}

type VariablesSectionProps = {
  currentAgent: AgentDefinition;
  showSystemVariables: boolean;
  systemVariables: string[];
  onToggleSystemVariables: () => void;
  onChange: (agent: AgentDefinition) => void;
};

export function VariablesSection({
  currentAgent,
  showSystemVariables,
  systemVariables,
  onToggleSystemVariables,
  onChange,
}: VariablesSectionProps) {
  return (
    <Section>
      <SectionTitle>Variables</SectionTitle>
      <KeyValueEditor values={currentAgent.variables} onChange={(value) => onChange({ ...currentAgent, variables: value })} />
      <ActionsRow>
        <Button size="sm" variant="secondary" onClick={onToggleSystemVariables}>
          {showSystemVariables ? "Systemvariablen ausblenden" : "Systemvariablen anzeigen"}
        </Button>
      </ActionsRow>
      {showSystemVariables && <MutedText>{systemVariables.join(", ")}</MutedText>}
    </Section>
  );
}

type PromptSectionsSectionProps = {
  selectedModeConfig: AgentModeConfig;
  getPromptSectionDefault: (section: keyof AgentModeConfig["promptSections"]) => string;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function PromptSectionsSection({
  selectedModeConfig,
  getPromptSectionDefault,
  updateModeConfig,
}: PromptSectionsSectionProps) {
  return (
    <Section>
      <SectionTitle>Prompt Sections</SectionTitle>
      {PROMPT_SECTION_META.map((entry) => {
        const isCustomized = selectedModeConfig.promptSections[entry.key].trim() !== getPromptSectionDefault(entry.key).trim();
        return (
          <FormField key={entry.key}>
            <LabelRow>
              <FieldLabel>{entry.label}</FieldLabel>
              {isCustomized && (
                <HeaderActions>
                  <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
                  <IconActionButton
                    type="button"
                    title="Auf Default zuruecksetzen"
                    onClick={() => updateModeConfig({
                      ...selectedModeConfig,
                      promptSections: {
                        ...selectedModeConfig.promptSections,
                        [entry.key]: getPromptSectionDefault(entry.key),
                      },
                    })}
                  >
                    {RESET_EMOJI}
                  </IconActionButton>
                </HeaderActions>
              )}
            </LabelRow>
            <TextArea
              rows={4}
              value={selectedModeConfig.promptSections[entry.key]}
              onChange={(e) => updateModeConfig({
                ...selectedModeConfig,
                promptSections: { ...selectedModeConfig.promptSections, [entry.key]: e.target.value },
              })}
              placeholder={getPromptSectionDefault(entry.key)}
            />
          </FormField>
        );
      })}
    </Section>
  );
}

type ModeInstructionSectionProps = {
  selectedModeConfig: AgentModeConfig;
  defaultModeInstruction: string;
  isCustomizedModeInstruction: boolean;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function ModeInstructionSection({
  selectedModeConfig,
  defaultModeInstruction,
  isCustomizedModeInstruction,
  updateModeConfig,
}: ModeInstructionSectionProps) {
  return (
    <Section>
      <FormRow style={{ justifyContent: "space-between", alignItems: "center" }}>
        <SectionTitle>Mode Instruction</SectionTitle>
        {isCustomizedModeInstruction && (
          <HeaderActions>
            <OverrideMark title="Agent-Override">{OVERRIDE_EMOJI}</OverrideMark>
            <IconActionButton
              type="button"
              title="Auf Default zuruecksetzen"
              onClick={() => updateModeConfig({ ...selectedModeConfig, modeInstruction: defaultModeInstruction })}
            >
              {RESET_EMOJI}
            </IconActionButton>
          </HeaderActions>
        )}
      </FormRow>
      <TextArea
        rows={4}
        value={selectedModeConfig.modeInstruction}
        onChange={(e) => updateModeConfig({ ...selectedModeConfig, modeInstruction: e.target.value })}
        placeholder={defaultModeInstruction}
      />
    </Section>
  );
}

type AutonomousBudgetSectionProps = {
  selectedModeConfig: AgentModeConfig;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function AutonomousBudgetSection({
  selectedModeConfig,
  updateModeConfig,
}: AutonomousBudgetSectionProps) {
  return (
    <Section>
      <SectionTitle>Autonomous Budget</SectionTitle>
      <FormRow style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span>Max input tokens</span>
          <input
            type="number"
            min={0}
            value={selectedModeConfig.autonomousBudget?.maxInputTokens ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? undefined : Number(e.target.value);
              updateModeConfig({
                ...selectedModeConfig,
                autonomousBudget: { ...selectedModeConfig.autonomousBudget, maxInputTokens: value },
              });
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span>Max output tokens</span>
          <input
            type="number"
            min={0}
            value={selectedModeConfig.autonomousBudget?.maxOutputTokens ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? undefined : Number(e.target.value);
              updateModeConfig({
                ...selectedModeConfig,
                autonomousBudget: { ...selectedModeConfig.autonomousBudget, maxOutputTokens: value },
              });
            }}
          />
        </label>
      </FormRow>
    </Section>
  );
}

type InternalToolsSectionProps = {
  selectedModeConfig: AgentModeConfig;
  internalTools: McpListItem[];
  mcps: McpListItem[];
  expandedInternalTools: Record<string, boolean>;
  visibleToolInstructions: Record<string, boolean>;
  setExpandedInternalTools: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleToolInstructions: Dispatch<SetStateAction<Record<string, boolean>>>;
  getEffectiveToolInstruction: (toolId: string, fallback?: string) => string;
  getToolInstructionFallback: (toolId: string, fallback?: string) => string;
  getDefaultAccessScope: (toolId: string) => ToolAccessScope;
  getEffectiveAccessScope: (toolId: string) => ToolAccessScope;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function InternalToolsSection({
  selectedModeConfig,
  internalTools,
  mcps,
  expandedInternalTools,
  visibleToolInstructions,
  setExpandedInternalTools,
  setVisibleToolInstructions,
  getEffectiveToolInstruction,
  getToolInstructionFallback,
  getDefaultAccessScope,
  getEffectiveAccessScope,
  updateModeConfig,
}: InternalToolsSectionProps) {
  return (
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
                                const nextModeConfig = { ...selectedModeConfig, toolIds: nextToolIds };
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
  );
}

type ExternalMcpsSectionProps = {
  selectedModeConfig: AgentModeConfig;
  internalTools: McpListItem[];
  mcps: McpListItem[];
  expandedMcps: Record<string, boolean>;
  visibleMcpInstructions: Record<string, boolean>;
  setExpandedMcps: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleMcpInstructions: Dispatch<SetStateAction<Record<string, boolean>>>;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function ExternalMcpsSection({
  selectedModeConfig,
  internalTools,
  mcps,
  expandedMcps,
  visibleMcpInstructions,
  setExpandedMcps,
  setVisibleMcpInstructions,
  updateModeConfig,
}: ExternalMcpsSectionProps) {
  return (
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
                            const nextModeConfig = { ...selectedModeConfig, mcpIds: nextMcpIds };
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
  );
}

type SkillsSectionProps = {
  selectedModeConfig: AgentModeConfig;
  selectedModeDefinition: AgentModeDefinition;
  skills: SkillDefinition[];
  visibleSkillInstructions: Record<string, boolean>;
  setVisibleSkillInstructions: Dispatch<SetStateAction<Record<string, boolean>>>;
  getEffectiveSkillInstruction: (skillId: string, fallback: string) => string;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function SkillsSection({
  selectedModeConfig,
  selectedModeDefinition,
  skills,
  visibleSkillInstructions,
  setVisibleSkillInstructions,
  getEffectiveSkillInstruction,
  updateModeConfig,
}: SkillsSectionProps) {
  return (
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
  );
}
