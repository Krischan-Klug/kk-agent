import { useState } from "react";
import styled from "styled-components";
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
  normalizeCanonicalReasoningEffort,
} from "@/lib/modelCapabilities";
import { compactLlmRequestConfig, mergeLlmRequestConfigs } from "@/lib/llmRequestConfig";
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

const EditorArea = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
`;

const Select = styled.select`
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--border-focus);
  }
`;

const ModeTabs = styled.div`
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
`;

const ModeTab = styled.button<{ $active: boolean }>`
  padding: 6px 10px;
  background: ${(p) => (p.$active ? "var(--accent)" : "var(--accent-muted)")};
  color: ${(p) => (p.$active ? "var(--bg-base)" : "var(--accent)")};
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
`;

const ModeTabContent = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const ModeStatusDot = styled.span<{ $enabled: boolean; $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $enabled, $active }) => {
    if ($enabled) {
      return $active ? "var(--bg-base)" : "var(--success)";
    }
    return "var(--text-muted)";
  }};
  opacity: ${({ $enabled }) => ($enabled ? 1 : 0.85)};
`;

const CapabilityRow = styled.div<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  opacity: ${(p) => (p.$active ? 1 : 0.6)};
`;

const CapabilityHeader = styled(FormRow)`
  justify-content: space-between;
  align-items: center;
`;

const HeaderActions = styled(FormRow)`
  align-items: center;
  gap: var(--space-xs);
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;

  input {
    accent-color: var(--accent);
  }
`;

const StatusDot = styled.span<{ $running: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => (p.$running ? "var(--success)" : "var(--danger)")};
  flex-shrink: 0;
`;

const ExpandButton = styled.button`
  padding: 2px 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }
`;

const NestedToolList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-xs);
  margin-top: var(--space-xs);
`;

const NestedToolCard = styled.div<{ $active: boolean }>`
  padding: var(--space-sm);
  background: var(--bg-elevated);
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-sm);
  opacity: ${(p) => (p.$active ? 1 : 0.6)};
`;

const ToolName = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
`;

const ToolDescription = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
`;

const OverrideMark = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const IconActionButton = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    color: var(--accent);
  }
`;

const InlineSelect = styled.select`
  padding: 4px 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--accent);
  }
`;

const ScopeRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
`;

const MODE_BEHAVIORS: ModeBehavior[] = ["plan", "edit", "autonomous"];
const PROMPT_SECTION_META: Array<{ key: keyof AgentModeConfig["promptSections"]; label: string }> = [
  { key: "identity", label: "\u{1FAAA} Identity" },
  { key: "system", label: "\u{1F9E0} System" },
  { key: "runtime", label: "\u2699\uFE0F Runtime" },
  { key: "tasks", label: "\u{1F4DD} Tasks" },
  { key: "security", label: "\u{1F512} Security" },
  { key: "toolUsage", label: "\u{1F6E0}\uFE0F Tool Usage" },
  { key: "communication", label: "\u{1F4AC} Communication" },
];
const OVERRIDE_EMOJI = "\u270F\uFE0F";
const RESET_EMOJI = "\u21BA";
const SKILL_EMOJI = "\u{1F4DA}";

function slugifyModeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "mode";
}

function buildUniqueModeId(seed: string, existingIds: string[]): string {
  const base = slugifyModeId(seed);
  if (!existingIds.includes(base)) return base;
  let index = 2;
  while (existingIds.includes(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function buildModeConfigFromDefaults(behavior: ModeBehavior, defaults: AppDefaults | null): AgentModeConfig {
  const template = defaults?.agent.modeTemplates[behavior];
  return {
    promptSections: { ...(defaults?.agent.promptSections ?? {
      identity: "",
      system: "",
      runtime: "",
      tasks: "",
      security: "",
      toolUsage: "",
      communication: "",
    }) },
    modeInstruction: template?.modeInstruction ?? "",
    toolIds: [...(template?.toolIds ?? [])],
    mcpIds: [],
    skillIds: [],
    toolAccessScopes: {},
    toolInstructions: { ...(template?.toolInstructions ?? {}) },
    mcpInstructions: {},
    skillInstructions: {},
    allowedToolNames: [...(template?.allowedToolNames ?? [])],
    autonomousBudget: template?.autonomousBudget ? { ...template.autonomousBudget } : {},
  };
}

function createCustomMode(agent: AgentDefinition, defaults: AppDefaults | null, behavior: ModeBehavior = "edit"): AgentModeDefinition {
  const existingIds = agent.modes.map((mode) => mode.id);
  return {
    id: buildUniqueModeId("custom-mode", existingIds),
    label: "Custom Mode",
    behavior,
    source: "custom",
    enabled: true,
    config: buildModeConfigFromDefaults(behavior, defaults),
  };
}

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

type ConcreteCapabilityTool = {
  capabilityId: string;
  capabilityName: string;
  name: string;
  description: string;
};

function getConcreteCapabilityTools(capabilityIds: string[], capabilities: McpListItem[]): ConcreteCapabilityTool[] {
  const capabilityMap = new Map(capabilities.map((entry) => [entry.id, entry]));
  return capabilityIds
    .map((id) => capabilityMap.get(id))
    .filter((entry): entry is McpListItem => Boolean(entry))
    .flatMap((entry) => entry.tools.map((tool) => ({
      capabilityId: entry.id,
      capabilityName: entry.name,
      name: tool.name,
      description: tool.description,
    })));
}

function getConcreteInternalTools(modeConfig: AgentModeConfig, internalTools: McpListItem[]) {
  return getConcreteCapabilityTools(modeConfig.toolIds, internalTools);
}

function getConcreteMcpTools(modeConfig: AgentModeConfig, mcps: McpListItem[]) {
  return getConcreteCapabilityTools(modeConfig.mcpIds, mcps);
}

function getConcreteRuntimeTools(modeConfig: AgentModeConfig, internalTools: McpListItem[], mcps: McpListItem[]) {
  return [
    ...getConcreteInternalTools(modeConfig, internalTools),
    ...getConcreteMcpTools(modeConfig, mcps),
  ];
}

function getCapabilityToolNames(capability: McpListItem): string[] {
  return capability.tools.map((tool) => tool.name);
}

function normalizeAllowedToolNames(nextAllowed: string[], concreteTools: Array<{ name: string }>): string[] {
  const activeToolNames = new Set(concreteTools.map((tool) => tool.name));
  return [...new Set(nextAllowed)].filter((name) => activeToolNames.has(name));
}

function isToolAllowed(modeConfig: AgentModeConfig, toolName: string): boolean {
  return modeConfig.allowedToolNames.includes(toolName);
}

function hasAllowedToolForCapability(allowedToolNames: string[], capabilityToolNames: string[]): boolean {
  return capabilityToolNames.some((toolName) => allowedToolNames.includes(toolName));
}

function setCapabilityInstruction(
  current: Record<string, string>,
  capabilityId: string,
  nextValue: string,
  fallback?: string,
): Record<string, string> {
  const trimmedNext = nextValue.trim();
  const trimmedFallback = (fallback ?? "").trim();
  const next = { ...current };
  if (trimmedNext === trimmedFallback) {
    delete next[capabilityId];
    return next;
  }
  next[capabilityId] = nextValue;
  return next;
}

function isScopeCapableTool(toolId: string): boolean {
  return toolId === "filesystem" || toolId === "terminal";
}

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
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...currentAgent, defaultModeId: e.target.value })}
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

      {selectedModeDefinition.behavior === "autonomous" && (
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
