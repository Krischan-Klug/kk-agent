import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { agent as agentApi, tools as toolsApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { InternalToolListItem, UpdateInternalToolBody } from "kk-agent-contract";
import SettingsLayout from "@/components/SettingsLayout";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import { ActionsRow, EmptyHint, FieldLabel, FormField, MutedText, Section } from "@/components/PageForm";
import { StatusDot } from "@/components/agent/AgentEditor.styled";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
`;

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
  font-weight: 600;
`;

const StatusButton = styled.button`
  display: inline-flex;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
`;

type ToolDraft = {
  name: string;
  instruction: string;
  previewThresholdChars: string;
  previewChars: string;
};

function toDraft(tool: InternalToolListItem): ToolDraft {
  return {
    name: tool.name,
    instruction: tool.instruction,
    previewThresholdChars: tool.config?.resultPolicy?.previewThresholdChars?.toString() ?? "",
    previewChars: tool.config?.resultPolicy?.previewChars?.toString() ?? "",
  };
}

function toUpdate(draft: ToolDraft): UpdateInternalToolBody {
  const previewThresholdChars = draft.previewThresholdChars ? Number(draft.previewThresholdChars) : undefined;
  const previewChars = draft.previewChars ? Number(draft.previewChars) : undefined;
  return {
    name: draft.name,
    instruction: draft.instruction,
    config: {
      resultPolicy: {
        ...(previewThresholdChars ? { previewThresholdChars } : {}),
        ...(previewChars ? { previewChars } : {}),
      },
    },
  };
}

export default function SettingsToolsPage() {
  const [items, setItems] = useState<InternalToolListItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ToolDraft>>({});
  const [editingId, setEditingId] = useState<string>();
  const [systemVariables, setSystemVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [tools, variables] = await Promise.all([toolsApi.list(), agentApi.systemVariables()]);
      setItems(tools);
      setSystemVariables(variables.variables);
    } catch (error) {
      reportError("Failed to load internal tools", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(tool: InternalToolListItem, body: UpdateInternalToolBody) {
    try {
      await toolsApi.update(tool.id, body);
      await load();
    } catch (error) {
      reportError("Failed to update internal tool", error);
    }
  }

  function openEditor(tool: InternalToolListItem) {
    setDrafts((current) => ({ ...current, [tool.id]: toDraft(tool) }));
    setEditingId(tool.id);
  }

  return (
    <SettingsLayout loading={loading}>
      <Grid>
        {items.map((tool) => {
          const draft = drafts[tool.id];
          const editing = editingId === tool.id && draft;
          const supportsPreview = ["filesystem", "terminal", "web-search"].includes(tool.id);
          const setDraft = (next: ToolDraft) => setDrafts((current) => ({ ...current, [tool.id]: next }));
          return (
            <Card key={tool.id}>
              <Header>
                <Identity>
                  <span>{tool.emoji || "🛠️"}</span>
                  <span>{tool.name}</span>
                  <StatusButton type="button" title={tool.runtime.error || tool.runtime.status} aria-label={tool.active ? "Disable" : "Enable"} onClick={() => void update(tool, { active: !tool.active })}>
                    <StatusDot $running={tool.runtime.status === "running"} />
                  </StatusButton>
                </Identity>
                <Button size="sm" variant="secondary" onClick={() => editing ? setEditingId(undefined) : openEditor(tool)}>{editing ? "Close" : "Edit"}</Button>
              </Header>
              {tool.runtime.error && <MutedText>{tool.runtime.error}</MutedText>}
              {editing && (
                <Section style={{ marginTop: "var(--space-md)" }}>
                  <FormField>
                    <FieldLabel>Name</FieldLabel>
                    <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </FormField>
                  {supportsPreview && (
                    <ActionsRow>
                      <FormField $flex={1} $minWidth="180px">
                        <FieldLabel>Preview threshold</FieldLabel>
                        <Input type="number" min={1} value={draft.previewThresholdChars} onChange={(event) => setDraft({ ...draft, previewThresholdChars: event.target.value })} />
                      </FormField>
                      <FormField $flex={1} $minWidth="180px">
                        <FieldLabel>Preview length</FieldLabel>
                        <Input type="number" min={200} value={draft.previewChars} onChange={(event) => setDraft({ ...draft, previewChars: event.target.value })} />
                      </FormField>
                    </ActionsRow>
                  )}
                  <FormField>
                    <FieldLabel>Instruction</FieldLabel>
                    <TextArea rows={10} value={draft.instruction} onChange={(event) => setDraft({ ...draft, instruction: event.target.value })} />
                    {systemVariables.length > 0 && <MutedText>Variables: {systemVariables.join(", ")}</MutedText>}
                  </FormField>
                  <ActionsRow>
                    <Button size="sm" onClick={() => void update(tool, toUpdate(draft)).then(() => setEditingId(undefined))}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(undefined)}>Cancel</Button>
                  </ActionsRow>
                </Section>
              )}
            </Card>
          );
        })}
        {items.length === 0 && <EmptyHint>No internal tools found.</EmptyHint>}
      </Grid>
    </SettingsLayout>
  );
}
