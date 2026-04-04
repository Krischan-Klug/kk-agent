import { useEffect, useState } from "react";
import styled from "styled-components";
import { settings as settingsApi, tools as toolsApi } from "@/lib/api";
import type { AppDefaults, AgentPromptSections, ChatMode, McpListItem } from "@/types/api";
import SettingsLayout from "@/components/SettingsLayout";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import Spinner from "@/components/Spinner";

const PageWrapper = styled.div`
  max-width: 920px;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding-bottom: var(--space-xl);
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
`;

const PanelTitle = styled.h2`
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
`;

const FieldLabel = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: 2px;
  display: block;
`;

const Hint = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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
    border-color: var(--accent);
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
`;

const Row = styled.div`
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  flex-wrap: wrap;
`;

const Actions = styled.div`
  display: flex;
  gap: var(--space-sm);
  align-items: center;
`;

const SaveMsg = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--text-primary);
`;

const PROMPT_SECTION_META: Array<{ key: keyof AgentPromptSections; label: string }> = [
  { key: "identity", label: "🪪 Identity" },
  { key: "system", label: "🧠 System" },
  { key: "security", label: "🔒 Security" },
  { key: "toolUsage", label: "🛠️ Tool Usage" },
  { key: "communication", label: "💬 Communication" },
];

const CHAT_MODES: ChatMode[] = ["plan", "edit"];

export default function DefaultsPage() {
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [draft, setDraft] = useState<AppDefaults | null>(null);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([settingsApi.getDefaults(), toolsApi.list()]).then(([data, tools]) => {
      setDefaults(data);
      setDraft(data);
      setInternalTools(tools);
    });
  }, []);

  if (!draft) return <Spinner />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsApi.updateDefaults(draft);
      setDefaults(updated);
      setDraft(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsLayout>
      <PageWrapper>
        <Panel>
          <PanelTitle>Defaults</PanelTitle>
          <Hint>Globale Defaults fuer neue Agenten im manuellen Mode-Modell.</Hint>

          <SectionTitle>Agent Core</SectionTitle>
          <Row>
            <Field>
              <FieldLabel>Default Chat Mode</FieldLabel>
              <Select
                value={draft.agent.defaultChatMode}
                onChange={(e) => setDraft({
                  ...draft,
                  agent: { ...draft.agent, defaultChatMode: e.target.value as ChatMode },
                })}
              >
                {CHAT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Max Iterations</FieldLabel>
              <Input
                type="number"
                min={1}
                max={100}
                value={draft.agent.maxIterations}
                onChange={(e) => setDraft({
                  ...draft,
                  agent: { ...draft.agent, maxIterations: Number(e.target.value) },
                })}
              />
            </Field>
          </Row>

          <SectionTitle>Prompt Sections</SectionTitle>
          {PROMPT_SECTION_META.map((entry) => (
            <Field key={entry.key}>
              <FieldLabel>{entry.label}</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.promptSections[entry.key]}
                onChange={(e) => setDraft({
                  ...draft,
                  agent: {
                    ...draft.agent,
                    promptSections: { ...draft.agent.promptSections, [entry.key]: e.target.value },
                  },
                })}
              />
            </Field>
          ))}

          <SectionTitle>Mode Instructions</SectionTitle>
          {CHAT_MODES.map((mode) => (
            <Field key={mode}>
              <FieldLabel>{mode}</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.modeInstructions[mode]}
                onChange={(e) => setDraft({
                  ...draft,
                  agent: {
                    ...draft.agent,
                    modeInstructions: { ...draft.agent.modeInstructions, [mode]: e.target.value },
                  },
                })}
              />
            </Field>
          ))}

          <SectionTitle>Mode Tool Instructions</SectionTitle>
          {CHAT_MODES.map((mode) => (
            <Field key={`tool-instructions-${mode}`}>
              <FieldLabel>{mode}</FieldLabel>
              <Row>
                {internalTools.map((tool) => (
                  <Field key={`${mode}-${tool.id}`} style={{ flex: "1 1 420px" }}>
                    <FieldLabel>{tool.emoji ? `${tool.emoji} ` : ""}{tool.name}</FieldLabel>
                    <TextArea
                      rows={4}
                      value={draft.agent.modeToolInstructions[mode]?.[tool.id] ?? ""}
                      onChange={(e) => setDraft({
                        ...draft,
                        agent: {
                          ...draft.agent,
                          modeToolInstructions: {
                            ...draft.agent.modeToolInstructions,
                            [mode]: {
                              ...draft.agent.modeToolInstructions[mode],
                              [tool.id]: e.target.value,
                            },
                          },
                        },
                      })}
                      placeholder={tool.instruction ?? ""}
                    />
                  </Field>
                ))}
              </Row>
            </Field>
          ))}

          <SectionTitle>Retry</SectionTitle>
          <Field>
            <FieldLabel>Empty Response Retry</FieldLabel>
            <TextArea
              rows={3}
              value={draft.retry.emptyResponseInstruction}
              onChange={(e) => setDraft({
                ...draft,
                retry: { ...draft.retry, emptyResponseInstruction: e.target.value },
              })}
            />
          </Field>
          <Field>
            <FieldLabel>Invalid Tool Retry</FieldLabel>
            <TextArea
              rows={3}
              value={draft.retry.invalidToolInstruction}
              onChange={(e) => setDraft({
                ...draft,
                retry: { ...draft.retry, invalidToolInstruction: e.target.value },
              })}
            />
          </Field>
          <SectionTitle>Reasoning / Attachment</SectionTitle>
          <Field>
            <FieldLabel>Default Reasoning Effort</FieldLabel>
            <Input
              value={draft.reasoning.defaultEffort}
              onChange={(e) => setDraft({
                ...draft,
                reasoning: { ...draft.reasoning, defaultEffort: e.target.value },
              })}
            />
          </Field>
          <Field>
            <FieldLabel>Vision Unsupported Instruction</FieldLabel>
            <TextArea
              rows={3}
              value={draft.attachment.visionNotSupportedInstruction}
              onChange={(e) => setDraft({
                ...draft,
                attachment: { ...draft.attachment, visionNotSupportedInstruction: e.target.value },
              })}
            />
          </Field>

          <Actions>
            <Button onClick={() => void handleSave()} disabled={!dirty || saving}>
              {saving ? "Speichert..." : "Speichern"}
            </Button>
            {saved && <SaveMsg>Gespeichert.</SaveMsg>}
            {error && <SaveMsg>{error}</SaveMsg>}
          </Actions>
        </Panel>
      </PageWrapper>
    </SettingsLayout>
  );
}
