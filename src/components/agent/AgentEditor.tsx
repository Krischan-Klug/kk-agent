import { useState } from "react";
import styled from "styled-components";
import type {
  AgentDefinition,
  AgentModeConfig,
  AppDefaults,
  ChatMode,
  McpListItem,
  ModelInfo,
  ModelSettings,
  ToolAccessScope,
} from "@/types/api";
import {
  buildTemperatureOptions,
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
} from "@/lib/modelCapabilities";
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

const MODE_ORDER: ChatMode[] = ["plan", "edit"];
const PROMPT_SECTION_META: Array<{ key: keyof AgentModeConfig["promptSections"]; label: string }> = [
  { key: "identity", label: "🪪 Identity" },
  { key: "system", label: "🧠 System" },
  { key: "riskyActions", label: "⚠️ Risky Actions" },
  { key: "toolUsage", label: "🛠️ Tool Usage" },
  { key: "communication", label: "💬 Communication" },
];
const OVERRIDE_EMOJI = "✏️";
const RESET_EMOJI = "↺";

type Props = {
  agent: AgentDefinition | null;
  mcps: McpListItem[];
  internalTools: McpListItem[];
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

function getConcreteInternalTools(modeConfig: AgentModeConfig, internalTools: McpListItem[]) {
  const capabilityMap = new Map(internalTools.map((entry) => [entry.id, entry]));
  return modeConfig.toolIds
    .map((id) => capabilityMap.get(id))
    .filter((entry): entry is McpListItem => Boolean(entry))
    .flatMap((entry) => entry.tools.map((tool) => ({ capabilityId: entry.id, capabilityName: entry.name, ...tool })));
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
  mcps,
  internalTools,
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
  const [selectedMode, setSelectedMode] = useState<ChatMode>("edit");
  const [expandedInternalTools, setExpandedInternalTools] = useState<Record<string, boolean>>({});
  const [visibleToolInstructions, setVisibleToolInstructions] = useState<Record<string, boolean>>({});
  const [visibleMcpInstructions, setVisibleMcpInstructions] = useState<Record<string, boolean>>({});

  if (!agent) {
    return (
      <EditorArea>
        <EmptyHint>Waehle einen Agent aus oder erstelle einen neuen.</EmptyHint>
      </EditorArea>
    );
  }

  const currentAgent = agent;
  const effectiveSelectedMode = MODE_ORDER.includes(selectedMode) ? selectedMode : currentAgent.defaultChatMode;
  const selectedModelInfo = models.find((model) => model.id === currentAgent.defaultModel) ?? models[0];
  const selectedModelSettings = selectedModelInfo ? modelSettings[selectedModelInfo.id] : undefined;
  const selectedEndpoint = getResolvedEndpoint(selectedModelInfo, selectedModelSettings);
  const endpointCapabilities = getEndpointCapabilities(selectedModelInfo, selectedEndpoint);
  const reasoningLevels = getReasoningLevels(selectedModelInfo);
  const showReasoning = reasoningLevels.length > 0;
  const showTemperature = endpointCapabilities.temperatureSupported;
  const temperatureOptions = buildTemperatureOptions(endpointCapabilities.temperatureRange);
  const selectedModeConfig = currentAgent.modeConfigs[effectiveSelectedMode];
  const concreteTools = getConcreteInternalTools(selectedModeConfig, internalTools);
  const defaultModeInstruction = defaults?.agent.modeInstructions[effectiveSelectedMode] ?? "";
  const isCustomizedModeInstruction = selectedModeConfig.modeInstruction.trim() !== defaultModeInstruction.trim();

  function getPromptSectionDefault(section: keyof AgentModeConfig["promptSections"]): string {
    return defaults?.agent.promptSections[section] ?? "";
  }

  function getToolInstructionFallback(toolId: string, fallback?: string): string {
    return defaults?.agent.modeToolInstructions[effectiveSelectedMode]?.[toolId] ?? fallback ?? "";
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
      modeConfigs: {
        ...currentAgent.modeConfigs,
        [effectiveSelectedMode]: nextConfig,
      },
    });
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
            <FieldLabel>Default Chat Mode</FieldLabel>
            <Select
              value={currentAgent.defaultChatMode}
              onChange={(e) => onChange({ ...currentAgent, defaultChatMode: e.target.value as ChatMode })}
            >
              {MODE_ORDER.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </Select>
          </FormField>
        </FormRow>
        <FormRow>
          <FormField>
            <FieldLabel>Mode Config</FieldLabel>
            <ModeTabs>
              {MODE_ORDER.map((mode) => (
                <ModeTab key={mode} type="button" $active={mode === effectiveSelectedMode} onClick={() => setSelectedMode(mode)}>
                  {mode}
                </ModeTab>
              ))}
            </ModeTabs>
            <MutedText>Die Konfiguration darunter gilt nur fuer den aktuell ausgewaehlten Mode.</MutedText>
          </FormField>
          <FormField>
            <FieldLabel>Default Model</FieldLabel>
            <Select
              value={currentAgent.defaultModel ?? ""}
              onChange={(e) => onChange({ ...currentAgent, defaultModel: e.target.value || undefined })}
            >
              <option value="">-- Kein Default --</option>
              {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
            </Select>
          </FormField>
          {showReasoning && (
            <FormField>
              <FieldLabel>Default Reasoning</FieldLabel>
              <Select
                value={currentAgent.reasoningEffort ?? ""}
                onChange={(e) => onChange({ ...currentAgent, reasoningEffort: e.target.value || undefined })}
              >
                <option value="">-- Default --</option>
                {reasoningLevels.map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </FormField>
          )}
          {showTemperature && (
            <FormField>
              <FieldLabel>Temperature</FieldLabel>
              <Select
                value={currentAgent.temperature !== undefined ? currentAgent.temperature.toFixed(1) : ""}
                onChange={(e) => onChange({
                  ...currentAgent,
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
          <FormField>
            <FieldLabel>Max Iterationen</FieldLabel>
            <Input
              type="number"
              value={currentAgent.maxIterations}
              onChange={(e) => onChange({ ...currentAgent, maxIterations: parseInt(e.target.value, 10) || 10 })}
              style={{ width: 100 }}
            />
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
                      const nextConcreteTools = getConcreteInternalTools(
                        { ...selectedModeConfig, toolIds: nextToolIds },
                        internalTools,
                      );
                      updateModeConfig({
                        ...selectedModeConfig,
                        toolIds: nextToolIds,
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
                                  updateModeConfig({
                                    ...selectedModeConfig,
                                    allowedToolNames: normalizeAllowedToolNames(updated, concreteTools),
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
                    onChange={() => updateModeConfig({
                      ...selectedModeConfig,
                      mcpIds: isActive
                        ? selectedModeConfig.mcpIds.filter((id) => id !== mcp.id)
                        : [...selectedModeConfig.mcpIds, mcp.id],
                    })}
                  />
                  <span>{mcp.name}</span>
                </CheckboxRow>
                {isActive && (
                  <HeaderActions>
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
            </CapabilityRow>
          );
        })}
      </Section>

      <ActionsRow>
        <Button onClick={onSave} disabled={saving}>{saving ? "Speichert..." : "Speichern"}</Button>
        <Button variant="danger" onClick={onDelete}>Loeschen</Button>
      </ActionsRow>
    </EditorArea>
  );
}
