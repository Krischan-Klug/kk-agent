import type {
  AgentConfig,
  AgentDefinition,
  ModelInfo,
  ProviderConfig,
  ReasoningEffort,
  SkillDefinition,
  ToolAccessScope,
} from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
import SkillIcon from "@/components/SkillIcon";
import { normalizeCanonicalReasoningEffort } from "@/lib/modelCapabilities";
import { getAgentModelRef, getModelLabel, parseModelRef, toModelRef } from "@/lib/modelRefs";
import { toggleId } from "@/lib/idLists";
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
  HeaderActions,
  InlineSelect,
  LabelRow,
  AgentColorButton,
  AgentCustomColorPicker,
  AgentColorInput,
  AgentColorPicker,
  PromptSectionField,
  PromptSectionsGrid,
  ScopeRow,
  Select,
  SkillCapabilityRow,
  SkillsGrid,
  ToggleLabel,
  AgentActions,
} from "./AgentEditor.styled";
import {
  isScopeCapableTool,
  PROMPT_SECTION_META,
} from "./AgentEditor.helpers";
import { CapabilityToggleHeader, OverrideActions } from "./CapabilitySection";
import RuntimeToolCapabilitySection from "./RuntimeToolCapabilitySection";
import { AGENT_COLOR_OPTIONS, getAgentColor } from "@/lib/agentColors";

type AgentInfoSectionProps = {
  currentAgent: AgentDefinition;
  providers: ProviderConfig[];
  models: ModelInfo[];
  showReasoning: boolean;
  reasoningLevels: ReasoningEffort[];
  updateReasoningConfig: (patch: NonNullable<AgentDefinition["llmRequestConfig"]>["reasoning"]) => void;
  onChange: (agent: AgentDefinition) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
};

export function AgentInfoSection({
  currentAgent,
  providers,
  models,
  showReasoning,
  reasoningLevels,
  updateReasoningConfig,
  onChange,
  saving,
  onSave,
  onDelete,
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
        <FormField $minWidth="180px">
          <FieldLabel>Agent Color</FieldLabel>
          <AgentColorPicker>
            {AGENT_COLOR_OPTIONS.map((color) => {
              const active = getAgentColor(currentAgent.color) === color.value;
              return (
                <AgentColorButton
                  key={color.value}
                  type="button"
                  $active={active}
                  $color={color.value}
                  aria-label={`${color.label} auswählen`}
                  aria-pressed={active}
                  title={color.label}
                  onClick={() => onChange({ ...currentAgent, color: color.value })}
                />
              );
            })}
            <AgentCustomColorPicker title="Eigene Farbe wählen">
              <AgentColorInput
                type="color"
                value={getAgentColor(currentAgent.color)}
                aria-label="Eigene Farbe wählen"
                onChange={(e) => onChange({ ...currentAgent, color: e.target.value })}
              />
            </AgentCustomColorPicker>
          </AgentColorPicker>
        </FormField>
      </FormRow>
      <FormRow>
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
          <>
            <FormField>
              <FieldLabel>Default Reasoning</FieldLabel>
              <Select
                value={currentAgent.llmRequestConfig?.reasoning?.effort ?? ""}
                onChange={(e) => updateReasoningConfig({
                  effort: normalizeCanonicalReasoningEffort(e.target.value),
                })}
              >
                <option value="">-- Default --</option>
                {reasoningLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </FormField>
          </>
        )}
        <AgentActions>
          <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          <Button variant="danger" onClick={onDelete}>Delete</Button>
        </AgentActions>
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
      <FormRow style={{ alignItems: "center" }}>
        <SectionTitle>Variables</SectionTitle>
        <ActionsRow>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({
              ...currentAgent,
              variables: { ...currentAgent.variables, [`VAR_${Object.keys(currentAgent.variables).length + 1}`]: "" },
            })}
          >
            + Variable
          </Button>
          <Button size="sm" variant="secondary" onClick={onToggleSystemVariables}>
            {showSystemVariables ? "Hide system variables" : "Show system variables"}
          </Button>
        </ActionsRow>
      </FormRow>
      <KeyValueEditor
        values={currentAgent.variables}
        onChange={(value) => onChange({ ...currentAgent, variables: value })}
        showAddButton={false}
      />
      {showSystemVariables && <MutedText>{systemVariables.join(", ")}</MutedText>}
    </Section>
  );
}

type PromptSectionsSectionProps = {
  agentConfig: AgentConfig;
  getPromptSectionDefault: (section: keyof AgentConfig["promptSections"]) => string;
  updateAgentConfig: (nextConfig: AgentConfig) => void;
};

export function PromptSectionsSection({
  agentConfig,
  getPromptSectionDefault,
  updateAgentConfig,
}: PromptSectionsSectionProps) {
  return (
    <Section>
      <SectionTitle>Prompt Sections</SectionTitle>
      <PromptSectionsGrid>
        {PROMPT_SECTION_META.map((entry) => {
        const isCustomized = agentConfig.promptSections[entry.key].trim() !== getPromptSectionDefault(entry.key).trim();
        return (
          <PromptSectionField key={entry.key}>
            <LabelRow>
              <FieldLabel>{entry.label}</FieldLabel>
              {isCustomized && (
                <HeaderActions>
                  <OverrideActions
                    onReset={() => updateAgentConfig({
                      ...agentConfig,
                      promptSections: {
                        ...agentConfig.promptSections,
                        [entry.key]: getPromptSectionDefault(entry.key),
                      },
                    })}
                  />
                </HeaderActions>
              )}
            </LabelRow>
            <TextArea
              rows={4}
              value={agentConfig.promptSections[entry.key]}
              onChange={(e) => updateAgentConfig({
                ...agentConfig,
                promptSections: { ...agentConfig.promptSections, [entry.key]: e.target.value },
              })}
              placeholder={getPromptSectionDefault(entry.key)}
            />
          </PromptSectionField>
        );
        })}
      </PromptSectionsGrid>
    </Section>
  );
}

type InternalToolsSectionProps = {
  agentConfig: AgentConfig;
  internalTools: RuntimeCapability[];
  mcps: RuntimeCapability[];
  getEffectiveToolInstruction: (toolId: string, fallback?: string) => string;
  getToolInstructionFallback: (toolId: string, fallback?: string) => string;
  getDefaultAccessScope: (toolId: string) => ToolAccessScope;
  getEffectiveAccessScope: (toolId: string) => ToolAccessScope;
  updateAgentConfig: (nextConfig: AgentConfig) => void;
};

export function InternalToolsSection({
  agentConfig,
  internalTools,
  mcps,
  getEffectiveToolInstruction,
  getToolInstructionFallback,
  getDefaultAccessScope,
  getEffectiveAccessScope,
  updateAgentConfig,
}: InternalToolsSectionProps) {
  return (
    <RuntimeToolCapabilitySection
      title="Internal Tools"
      groups={internalTools}
      idField="toolIds"
      instructionField="toolInstructions"
      agentConfig={agentConfig}
      internalTools={internalTools}
      mcps={mcps}
      emojiFallback="T"
      getEffectiveInstruction={(tool) => getEffectiveToolInstruction(tool.id, tool.instruction)}
      getInstructionFallback={(tool) => getToolInstructionFallback(tool.id, tool.instruction)}
      renderActiveControls={(tool) => {
        if (!isScopeCapableTool(tool.id)) return null;
        const effectiveAccessScope = getEffectiveAccessScope(tool.id);
        const hasScopeOverride = agentConfig.toolAccessScopes[tool.id] !== undefined;

        return (
          <ScopeRow>
            <ToggleLabel as="span">
              <span>Access Scope</span>
            </ToggleLabel>
            <HeaderActions>
              <InlineSelect
                value={effectiveAccessScope}
                onChange={(e) => {
                  const nextScope = e.target.value as ToolAccessScope;
                  const nextScopes = { ...agentConfig.toolAccessScopes };
                  if (nextScope === getDefaultAccessScope(tool.id)) delete nextScopes[tool.id];
                  else nextScopes[tool.id] = nextScope;
                  updateAgentConfig({ ...agentConfig, toolAccessScopes: nextScopes });
                }}
              >
                <option value="user">user</option>
                <option value="system">system</option>
              </InlineSelect>
              {hasScopeOverride && (
                <OverrideActions
                  onReset={() => {
                      const nextScopes = { ...agentConfig.toolAccessScopes };
                      delete nextScopes[tool.id];
                      updateAgentConfig({ ...agentConfig, toolAccessScopes: nextScopes });
                    }}
                />
              )}
            </HeaderActions>
          </ScopeRow>
        );
      }}
      updateAgentConfig={updateAgentConfig}
    />
  );
}

type ExternalMcpsSectionProps = {
  agentConfig: AgentConfig;
  internalTools: RuntimeCapability[];
  mcps: RuntimeCapability[];
  updateAgentConfig: (nextConfig: AgentConfig) => void;
};

export function ExternalMcpsSection({
  agentConfig,
  internalTools,
  mcps,
  updateAgentConfig,
}: ExternalMcpsSectionProps) {
  return (
    <RuntimeToolCapabilitySection
      title="External MCPs"
      groups={mcps}
      idField="mcpIds"
      instructionField="mcpInstructions"
      agentConfig={agentConfig}
      internalTools={internalTools}
      mcps={mcps}
      emojiFallback="M"
      getEffectiveInstruction={(mcp) => agentConfig.mcpInstructions[mcp.id] ?? mcp.instruction ?? ""}
      getInstructionFallback={(mcp) => mcp.instruction ?? ""}
      updateAgentConfig={updateAgentConfig}
    />
  );
}

type SkillsSectionProps = {
  agentConfig: AgentConfig;
  skills: SkillDefinition[];
  updateAgentConfig: (nextConfig: AgentConfig) => void;
};

export function SkillsSection({
  agentConfig,
  skills,
  updateAgentConfig,
}: SkillsSectionProps) {
  return (
    <Section>
      <SectionTitle><SkillIcon style={{ marginRight: "var(--space-xs)", verticalAlign: "-0.1em" }} />Skills</SectionTitle>
      <SkillsGrid>
      {skills.map((skill) => {
        const isActive = agentConfig.skillIds.includes(skill.id);

        return (
          <SkillCapabilityRow key={skill.id} $active={isActive} title={skill.path}>
            <CapabilityToggleHeader
              active={isActive}
              icon={<SkillIcon />}
              name={skill.name}
              onToggle={() => {
                updateAgentConfig({
                  ...agentConfig,
                  skillIds: toggleId(agentConfig.skillIds, skill.id),
                });
              }}
            />
            <MutedText>{skill.description}</MutedText>
            <MutedText>{skill.source} · {skill.path}</MutedText>
          </SkillCapabilityRow>
        );
      })}
      </SkillsGrid>
      {skills.length === 0 && <EmptyHint>No skills configured.</EmptyHint>}
    </Section>
  );
}
