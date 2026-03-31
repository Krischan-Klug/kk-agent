import styled from "styled-components";
import type { AgentDefinition, McpListItem } from "@/types/api";
import { REASONING_LEVELS } from "@/constants/reasoningDefaults";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import Toggle from "@/components/Toggle";
import Spinner from "@/components/Spinner";
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
  SurfaceBox,
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

const McpRow = styled.div<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  opacity: ${(p) => (p.$active ? 1 : 0.5)};
`;

const McpHeader = styled(FormRow)`
  justify-content: space-between;
  align-items: center;
`;

const StatusDot = styled.span<{ $running: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => (p.$running ? "var(--success)" : "var(--danger)")};
  flex-shrink: 0;
`;

type Props = {
  agent: AgentDefinition | null;
  mcps: McpListItem[];
  models: string[];
  systemVariables: string[];
  saving: boolean;
  showSystemVariables: boolean;
  onToggleSystemVariables: () => void;
  onChange: (agent: AgentDefinition) => void;
  onSave: () => void;
  onDelete: () => void;
};

function updateAgentVariables(agent: AgentDefinition, variables: Record<string, string>): AgentDefinition {
  return { ...agent, variables };
}

export default function AgentEditor({
  agent,
  mcps,
  models,
  systemVariables,
  saving,
  showSystemVariables,
  onToggleSystemVariables,
  onChange,
  onSave,
  onDelete,
}: Props) {
  if (!agent) {
    return (
      <EditorArea>
        <EmptyHint>Wähle einen Agent aus oder erstelle einen neuen.</EmptyHint>
      </EditorArea>
    );
  }

  return (
    <EditorArea>
      <Section>
        <SectionTitle>📋 Agent Info</SectionTitle>
        <FormRow>
          <FormField $flex={1}>
            <FieldLabel>Name</FieldLabel>
            <Input value={agent.name} onChange={(e) => onChange({ ...agent, name: e.target.value })} />
          </FormField>
          <FormField $flex={2}>
            <FieldLabel>Beschreibung</FieldLabel>
            <Input value={agent.description} onChange={(e) => onChange({ ...agent, description: e.target.value })} />
          </FormField>
          <FormField>
            <FieldLabel>Default Model</FieldLabel>
            <Select
              value={agent.defaultModel ?? ""}
              onChange={(e) => onChange({ ...agent, defaultModel: e.target.value || undefined })}
            >
              <option value="">-- Kein Default --</option>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </Select>
          </FormField>
          <FormField>
            <FieldLabel>Default Reasoning</FieldLabel>
            <Select
              value={agent.reasoningEffort ?? ""}
              onChange={(e) => onChange({ ...agent, reasoningEffort: e.target.value || undefined })}
            >
              <option value="">-- Default --</option>
              {REASONING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </Select>
          </FormField>
          <FormField>
            <FieldLabel>Temperature</FieldLabel>
            <Input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={agent.temperature ?? ""}
              onChange={(e) => onChange({
                ...agent,
                temperature: e.target.value === "" ? undefined : Number(e.target.value),
              })}
              placeholder="Default"
              style={{ width: 110 }}
            />
          </FormField>
        </FormRow>
      </Section>

      <Section>
        <SectionTitle>📝 System Prompt</SectionTitle>
        <TextArea
          value={agent.systemPrompt}
          onChange={(e) => onChange({ ...agent, systemPrompt: e.target.value })}
          rows={15}
          placeholder="Der System-Prompt für diesen Agent..."
        />
      </Section>

      <Section>
        <SectionTitle>🔄 Iteration</SectionTitle>
        <FormRow>
          <FormField>
            <FieldLabel>Max Iterationen</FieldLabel>
            <Input
              type="number"
              value={agent.maxIterations}
              onChange={(e) => onChange({ ...agent, maxIterations: parseInt(e.target.value, 10) || 10 })}
              style={{ width: 80 }}
            />
          </FormField>
          <FormField $flex={1}>
            <FieldLabel>&nbsp;</FieldLabel>
            <MutedText>
              Der Agent iteriert (LLM → Tools → repeat) bis keine Tool-Calls mehr kommen oder das Limit erreicht ist.
            </MutedText>
          </FormField>
        </FormRow>
      </Section>

      <Section>
        <SectionTitle>🔧 MCP-Tools</SectionTitle>
        {mcps.map((mcp) => {
          const isActive = agent.mcpIds.includes(mcp.id);
          const isOverridden = mcp.id in agent.mcpInstructions;
          return (
            <McpRow key={mcp.id} $active={isActive}>
              <McpHeader>
                <CheckboxRow>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onChange({
                      ...agent,
                      mcpIds: isActive
                        ? agent.mcpIds.filter((id) => id !== mcp.id)
                        : [...agent.mcpIds, mcp.id],
                    })}
                  />
                  <span style={{ fontSize: "1.1em" }}>{mcp.emoji || "🛠️"}</span>
                  <span style={{ fontWeight: 500 }}>{mcp.name}</span>
                  <StatusDot $running={mcp.running} />
                  {!mcp.running && <span style={{ color: "var(--danger)", fontSize: "0.7rem" }}>stopped</span>}
                </CheckboxRow>
                {isActive && (
                  <FormRow style={{ alignItems: "center", gap: "var(--space-xs)" }}>
                    <MutedText>Instruction überschreiben</MutedText>
                    <Toggle
                      checked={isOverridden}
                      onChange={() => {
                        const next = { ...agent.mcpInstructions };
                        if (isOverridden) delete next[mcp.id];
                        else next[mcp.id] = "";
                        onChange({ ...agent, mcpInstructions: next });
                      }}
                    />
                  </FormRow>
                )}
              </McpHeader>
              {isActive && isOverridden && (
                <TextArea
                  value={agent.mcpInstructions[mcp.id] ?? ""}
                  onChange={(e) => onChange({
                    ...agent,
                    mcpInstructions: { ...agent.mcpInstructions, [mcp.id]: e.target.value },
                  })}
                  rows={2}
                  placeholder="Leer = MCP-Instruction komplett unterdrücken"
                />
              )}
            </McpRow>
          );
        })}
      </Section>

      <Section>
        <SectionTitle>📐 Variablen</SectionTitle>
        <ActionsRow>
          <Button size="sm" variant="secondary" onClick={onToggleSystemVariables}>
            {showSystemVariables ? "System-Variablen ausblenden" : "System-Variablen anzeigen"}
          </Button>
        </ActionsRow>
        {showSystemVariables && (
          <SurfaceBox>
            {systemVariables.map((variable) => <Badge key={variable}>{`{{${variable}}}`}</Badge>)}
          </SurfaceBox>
        )}
        <KeyValueEditor
          values={agent.variables}
          onChange={(variables) => onChange(updateAgentVariables(agent, variables))}
        />
      </Section>

      <ActionsRow>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Spinner size={14} /> : "Speichern"}
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Agent löschen
        </Button>
      </ActionsRow>
    </EditorArea>
  );
}
