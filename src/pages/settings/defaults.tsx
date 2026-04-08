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

const SectionCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
`;

const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
`;

const SectionToggleMeta = styled.span`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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

const PROMPT_SECTION_META: Array<{ key: keyof AgentPromptSections; label: string }> = [
  { key: "identity", label: "\u{1FAAA} Identity" },
  { key: "system", label: "\u{1F9E0} System" },
  { key: "runtime", label: "\u2699\uFE0F Runtime" },
  { key: "tasks", label: "\u{1F4DD} Tasks" },
  { key: "security", label: "\u{1F512} Security" },
  { key: "toolUsage", label: "\u{1F6E0}\uFE0F Tool Usage" },
  { key: "communication", label: "\u{1F4AC} Communication" },
];

const CHAT_MODES: ChatMode[] = ["plan", "edit", "autonomous"];

export default function DefaultsPage() {
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [draft, setDraft] = useState<AppDefaults | null>(null);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<ChatMode>("edit");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    agentCore: true,
    promptSections: true,
    modeInstructions: true,
    modeToolInstructions: false,
    misc: false,
    reasoning: false,
  });

  useEffect(() => {
    Promise.all([settingsApi.getDefaults(), toolsApi.list()]).then(([data, tools]) => {
      setDefaults(data);
      setDraft(data);
      setInternalTools(tools);
    });
  }, []);

  if (!draft) return <Spinner />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);
  const selectedModeAutonomousBudget = draft.agent.modeAutonomousBudgets?.[selectedMode] ?? {};

  function toggleSection(key: keyof typeof expandedSections) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("agentCore")}>
              <SectionTitle>Agent Core</SectionTitle>
              <SectionToggleMeta>{expandedSections.agentCore ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.agentCore && (
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
            )}
          </SectionCard>

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("promptSections")}>
              <SectionTitle>Prompt Sections</SectionTitle>
              <SectionToggleMeta>{expandedSections.promptSections ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.promptSections && PROMPT_SECTION_META.map((entry) => (
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
          </SectionCard>

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("modeInstructions")}>
              <SectionTitle>Mode Instructions</SectionTitle>
              <SectionToggleMeta>{expandedSections.modeInstructions ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.modeInstructions && (
              <>
                <ModeTabs>
                  {CHAT_MODES.map((mode) => (
                    <ModeTab
                      key={mode}
                      type="button"
                      $active={mode === selectedMode}
                      onClick={() => setSelectedMode(mode)}
                    >
                      {mode}
                    </ModeTab>
                  ))}
                </ModeTabs>
                <Field>
                  <FieldLabel>{selectedMode}</FieldLabel>
                  <TextArea
                    rows={4}
                    value={draft.agent.modeInstructions[selectedMode]}
                    onChange={(e) => setDraft({
                      ...draft,
                      agent: {
                        ...draft.agent,
                        modeInstructions: { ...draft.agent.modeInstructions, [selectedMode]: e.target.value },
                      },
                    })}
                  />
                </Field>
                {selectedMode === "autonomous" && (
                <Row>
                  <Field style={{ minWidth: "180px" }}>
                    <FieldLabel>Max Input Tokens</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      value={selectedModeAutonomousBudget.maxInputTokens ?? ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : Number(e.target.value);
                        setDraft({
                          ...draft,
                          agent: {
                            ...draft.agent,
                            modeAutonomousBudgets: {
                              ...draft.agent.modeAutonomousBudgets,
                              [selectedMode]: {
                                ...selectedModeAutonomousBudget,
                                maxInputTokens: value,
                              },
                            },
                          },
                        });
                      }}
                    />
                  </Field>
                  <Field style={{ minWidth: "180px" }}>
                    <FieldLabel>Max Output Tokens</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      value={selectedModeAutonomousBudget.maxOutputTokens ?? ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : Number(e.target.value);
                        setDraft({
                          ...draft,
                          agent: {
                            ...draft.agent,
                            modeAutonomousBudgets: {
                              ...draft.agent.modeAutonomousBudgets,
                              [selectedMode]: {
                                ...selectedModeAutonomousBudget,
                                maxOutputTokens: value,
                              },
                            },
                          },
                        });
                      }}
                    />
                  </Field>
                  <Field style={{ minWidth: "180px" }}>
                    <FieldLabel>Max Wall Clock Ms</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      value={selectedModeAutonomousBudget.maxWallClockMs ?? ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : Number(e.target.value);
                        setDraft({
                          ...draft,
                          agent: {
                            ...draft.agent,
                            modeAutonomousBudgets: {
                              ...draft.agent.modeAutonomousBudgets,
                              [selectedMode]: {
                                ...selectedModeAutonomousBudget,
                                maxWallClockMs: value,
                              },
                            },
                          },
                        });
                      }}
                    />
                  </Field>
                  <Field style={{ minWidth: "180px" }}>
                    <FieldLabel>Max Auto Continues</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      value={selectedModeAutonomousBudget.maxConsecutiveAutoContinues ?? ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : Number(e.target.value);
                        setDraft({
                          ...draft,
                          agent: {
                            ...draft.agent,
                            modeAutonomousBudgets: {
                              ...draft.agent.modeAutonomousBudgets,
                              [selectedMode]: {
                                ...selectedModeAutonomousBudget,
                                maxConsecutiveAutoContinues: value,
                              },
                            },
                          },
                        });
                      }}
                    />
                  </Field>
                </Row>
                )}
              </>
            )}
          </SectionCard>

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("modeToolInstructions")}>
              <SectionTitle>Mode Tool Instructions</SectionTitle>
              <SectionToggleMeta>{expandedSections.modeToolInstructions ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.modeToolInstructions && (
              <>
                <ModeTabs>
                  {CHAT_MODES.map((mode) => (
                    <ModeTab
                      key={`tool-mode-${mode}`}
                      type="button"
                      $active={mode === selectedMode}
                      onClick={() => setSelectedMode(mode)}
                    >
                      {mode}
                    </ModeTab>
                  ))}
                </ModeTabs>
                <Row>
                  {internalTools.map((tool) => (
                    <Field key={`${selectedMode}-${tool.id}`} style={{ flex: "1 1 420px" }}>
                      <FieldLabel>{tool.emoji ? `${tool.emoji} ` : ""}{tool.name}</FieldLabel>
                      <TextArea
                        rows={4}
                        value={draft.agent.modeToolInstructions[selectedMode]?.[tool.id] ?? ""}
                        onChange={(e) => setDraft({
                          ...draft,
                          agent: {
                            ...draft.agent,
                            modeToolInstructions: {
                              ...draft.agent.modeToolInstructions,
                              [selectedMode]: {
                                ...draft.agent.modeToolInstructions[selectedMode],
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
              </>
            )}
          </SectionCard>

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("misc")}>
              <SectionTitle>Misc</SectionTitle>
              <SectionToggleMeta>{expandedSections.misc ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.misc && (
              <>
                <Field>
                  <FieldLabel>No Open Tasks Instruction</FieldLabel>
                  <TextArea
                    rows={3}
                    value={draft.misc.noTasksInstruction}
                    onChange={(e) => setDraft({
                      ...draft,
                      misc: { ...draft.misc, noTasksInstruction: e.target.value },
                    })}
                  />
                </Field>
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
              </>
            )}
          </SectionCard>

          <SectionCard>
            <SectionToggle type="button" onClick={() => toggleSection("reasoning")}>
              <SectionTitle>Reasoning</SectionTitle>
              <SectionToggleMeta>{expandedSections.reasoning ? "Einklappen" : "Aufklappen"}</SectionToggleMeta>
            </SectionToggle>
            {expandedSections.reasoning && (
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
            )}
          </SectionCard>

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
