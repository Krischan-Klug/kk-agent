import type { Dispatch, SetStateAction } from "react";
import type {
  AgentDefinition,
  AgentModeConfig,
  AgentModeDefinition,
  ModeBehavior,
  ModelInfo,
  ProviderConfig,
  ReasoningEffort,
} from "@/types/api";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import KeyValueEditor from "@/components/KeyValueEditor";
import {
  ActionsRow,
  FieldLabel,
  FormField,
  FormRow,
  MutedText,
  Section,
  SectionTitle,
} from "@/components/PageForm";
import {
  CheckboxRow,
  HeaderActions,
  IconActionButton,
  LabelRow,
  ModeStatusDot,
  ModeTab,
  ModeTabContent,
  ModeTabs,
  OverrideMark,
  Select,
} from "./AgentEditor.styled";
import {
  MODE_BEHAVIORS,
  OVERRIDE_EMOJI,
  PROMPT_SECTION_META,
  RESET_EMOJI,
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
