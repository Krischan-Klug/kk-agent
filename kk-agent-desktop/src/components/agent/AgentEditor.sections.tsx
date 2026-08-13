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
import { getAgentModelRef, getModelLabel, parseModelRef, toModelRef } from "@/lib/modelRefs";
import { toggleId } from "@/lib/idLists";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import KeyValueEditor from "@/components/KeyValueEditor";
import AutonomousBudgetFields from "@/components/AutonomousBudgetFields";
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
  CapabilityRow,
  CheckboxRow,
  HeaderActions,
  InlineSelect,
  LabelRow,
  ModeStatusDot,
  ModeTab,
  ModeTabContent,
  ModeTabs,
  ScopeRow,
  Select,
} from "./AgentEditor.styled";
import {
  isScopeCapableTool,
  MODE_BEHAVIORS,
  PROMPT_SECTION_META,
  SKILL_EMOJI,
} from "./AgentEditor.helpers";
import { CapabilityToggleHeader, OverrideActions } from "./CapabilitySection";
import RuntimeToolCapabilitySection from "./RuntimeToolCapabilitySection";
import SamplingSettings from "@/components/SamplingSettings";

type AgentInfoSectionProps = {
  currentAgent: AgentDefinition;
  enabledModes: AgentModeDefinition[];
  effectiveSelectedModeId: string;
  providers: ProviderConfig[];
  models: ModelInfo[];
  showReasoning: boolean;
  reasoningLevels: ReasoningEffort[];
  setSelectedModeId: Dispatch<SetStateAction<string>>;
  addCustomMode: () => void;
  updateCommonRequestConfig: (patch: NonNullable<AgentDefinition["llmRequestConfig"]>["common"]) => void;
  updateRequestConfig: (value: AgentDefinition["llmRequestConfig"]) => void;
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
  setSelectedModeId,
  addCustomMode,
  updateCommonRequestConfig,
  updateRequestConfig,
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
          <FieldLabel>Description</FieldLabel>
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
              Add custom mode
            </Button>
          </ActionsRow>
        </FormField>
        <FormField>
          <FieldLabel>Default Model</FieldLabel>
          <Select
            value={getAgentModelRef(currentAgent)}
            onChange={(e) => {
              const parsed = parseModelRef(e.target.value);
              onChange({
                ...currentAgent,
                defaultProviderId: parsed?.providerId,
                defaultModel: parsed?.modelId,
              });
            }}
          >
            <option value="">-- Kein Default --</option>
            {models.map((model) => (
              <option key={toModelRef(model)} value={toModelRef(model)}>
                {getModelLabel(model, providers)}
              </option>
            ))}
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
      </FormRow>
      <SamplingSettings
        value={currentAgent.llmRequestConfig}
        onChange={updateRequestConfig}
      />
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
              <span>Enabled</span>
            </CheckboxRow>
            {!isSelectedModeDefault && selectedModeDefinition.enabled && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ ...currentAgent, defaultModeId: selectedModeDefinition.id })}
              >
                Set as default
              </Button>
            )}
            {canDeleteSelectedMode && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => deleteCustomMode(selectedModeDefinition.id)}
              >
                Delete
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
          {showSystemVariables ? "Hide system variables" : "Show system variables"}
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
                  <OverrideActions
                    onReset={() => updateModeConfig({
                      ...selectedModeConfig,
                      promptSections: {
                        ...selectedModeConfig.promptSections,
                        [entry.key]: getPromptSectionDefault(entry.key),
                      },
                    })}
                  />
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
            <OverrideActions
              onReset={() => updateModeConfig({ ...selectedModeConfig, modeInstruction: defaultModeInstruction })}
            />
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
      <AutonomousBudgetFields
        value={selectedModeConfig.autonomousBudget}
        onChange={(autonomousBudget) => updateModeConfig({ ...selectedModeConfig, autonomousBudget })}
      />
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
    <RuntimeToolCapabilitySection
      title="Internal Tools"
      groups={internalTools}
      idField="toolIds"
      instructionField="toolInstructions"
      selectedModeConfig={selectedModeConfig}
      internalTools={internalTools}
      mcps={mcps}
      expanded={expandedInternalTools}
      visibleInstructions={visibleToolInstructions}
      setExpanded={setExpandedInternalTools}
      setVisibleInstructions={setVisibleToolInstructions}
      emojiFallback="T"
      getEffectiveInstruction={(tool) => getEffectiveToolInstruction(tool.id, tool.instruction)}
      getInstructionFallback={(tool) => getToolInstructionFallback(tool.id, tool.instruction)}
      renderActiveControls={(tool) => {
        if (!isScopeCapableTool(tool.id)) return null;
        const effectiveAccessScope = getEffectiveAccessScope(tool.id);
        const hasScopeOverride = selectedModeConfig.toolAccessScopes[tool.id] !== undefined;

        return (
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
                  if (nextScope === getDefaultAccessScope(tool.id)) delete nextScopes[tool.id];
                  else nextScopes[tool.id] = nextScope;
                  updateModeConfig({ ...selectedModeConfig, toolAccessScopes: nextScopes });
                }}
              >
                <option value="user">user</option>
                <option value="system">system</option>
              </InlineSelect>
              {hasScopeOverride && (
                <OverrideActions
                  onReset={() => {
                      const nextScopes = { ...selectedModeConfig.toolAccessScopes };
                      delete nextScopes[tool.id];
                      updateModeConfig({ ...selectedModeConfig, toolAccessScopes: nextScopes });
                    }}
                />
              )}
            </HeaderActions>
          </ScopeRow>
        );
      }}
      updateModeConfig={updateModeConfig}
    />
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
    <RuntimeToolCapabilitySection
      title="External MCPs"
      groups={mcps}
      idField="mcpIds"
      instructionField="mcpInstructions"
      selectedModeConfig={selectedModeConfig}
      internalTools={internalTools}
      mcps={mcps}
      expanded={expandedMcps}
      visibleInstructions={visibleMcpInstructions}
      setExpanded={setExpandedMcps}
      setVisibleInstructions={setVisibleMcpInstructions}
      detailsOpenLabel="Weniger"
      emojiFallback="M"
      getEffectiveInstruction={(mcp) => selectedModeConfig.mcpInstructions[mcp.id] ?? mcp.instruction ?? ""}
      getInstructionFallback={(mcp) => mcp.instruction ?? ""}
      updateModeConfig={updateModeConfig}
    />
  );
}

type SkillsSectionProps = {
  selectedModeConfig: AgentModeConfig;
  skills: SkillDefinition[];
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export function SkillsSection({
  selectedModeConfig,
  skills,
  updateModeConfig,
}: SkillsSectionProps) {
  return (
    <Section>
      <SectionTitle>{SKILL_EMOJI} Skills</SectionTitle>
      {skills.map((skill) => {
        const isActive = selectedModeConfig.skillIds.includes(skill.id);

        return (
          <CapabilityRow key={skill.id} $active={isActive}>
            <CapabilityToggleHeader
              active={isActive}
              emoji={SKILL_EMOJI}
              name={skill.name}
              onToggle={() => {
                updateModeConfig({
                  ...selectedModeConfig,
                  skillIds: toggleId(selectedModeConfig.skillIds, skill.id),
                });
              }}
            />
            <MutedText>{skill.description}</MutedText>
            <MutedText>{skill.source} · {skill.path}</MutedText>
          </CapabilityRow>
        );
      })}
      {skills.length === 0 && <EmptyHint>No skills configured.</EmptyHint>}
    </Section>
  );
}
