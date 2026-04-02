import { useEffect, useState } from "react";
import styled from "styled-components";
import { settings as settingsApi } from "@/lib/api";
import type { AppDefaults } from "@/types/api";
import SettingsLayout from "@/components/SettingsLayout";
import Button from "@/components/Button";
import TextArea from "@/components/TextArea";
import Input from "@/components/Input";
import Spinner from "@/components/Spinner";

const PageWrapper = styled.div`
  max-width: 820px;
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

const SectionCard = styled.details`
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow: hidden;

  &[open] > summary {
    border-bottom: 1px solid var(--border);
  }
`;

const SectionSummary = styled.summary`
  list-style: none;
  cursor: pointer;
  padding: var(--space-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  color: var(--text-primary);
  font-weight: 600;

  &::-webkit-details-marker {
    display: none;
  }
`;

const SummaryMeta = styled.span`
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  font-weight: 400;
`;

const SectionBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
`;

const SubSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);

  &:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }
`;

const SubSectionTitle = styled.h3`
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
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

const Row = styled.div`
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  flex-wrap: wrap;
`;

const Field = styled.div<{ $grow?: number; $width?: string }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  flex: ${(p) => p.$grow ?? "unset"};
  min-width: ${(p) => p.$width ?? "unset"};
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

const Actions = styled.div`
  display: flex;
  gap: var(--space-sm);
  align-items: center;
`;

const SaveMsg = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const PlaceholderHint = styled.code`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
`;

export default function DefaultsPage() {
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [draft, setDraft] = useState<AppDefaults | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.getDefaults().then((d) => {
      setDefaults(d);
      setDraft(d);
    });
  }, []);

  if (!draft) return <Spinner />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);

  async function handleSave() {
    const currentDraft = draft;
    if (!currentDraft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsApi.updateDefaults(currentDraft);
      setDefaults(updated);
      setDraft(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof AppDefaults>(
    section: K,
    field: keyof AppDefaults[K],
    value: string | number,
  ) {
    setDraft((prev) => prev ? { ...prev, [section]: { ...prev[section], [field]: value } } : prev);
  }

  function updateAgentNested<
    K extends keyof AppDefaults["agent"],
    F extends keyof AppDefaults["agent"][K],
  >(
    section: K,
    field: F,
    value: AppDefaults["agent"][K][F],
  ) {
    setDraft((prev) => prev ? {
      ...prev,
      agent: {
        ...prev.agent,
        [section]: {
          ...prev.agent[section],
          [field]: value,
        },
      },
    } : prev);
  }

  function updateTopLevelNested<
    K extends Exclude<keyof AppDefaults, "agent">,
    F extends keyof AppDefaults[K],
  >(
    section: K,
    field: F,
    value: AppDefaults[K][F],
  ) {
    setDraft((prev) => prev ? {
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    } : prev);
  }

  return (
    <SettingsLayout>
      <PageWrapper>
        <Panel>
          <PanelTitle>Defaults</PanelTitle>
          <Hint>Globale Fallbacks fuer neue Agents und Sessions. Alles bleibt editierbar, aber in kompakteren Gruppen.</Hint>

          <SectionCard open>
            <SectionSummary>
              <span>Core Behavior</span>
              <SummaryMeta>System-Prompt, Iterationen, Loop-Modus</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>System-Prompt</FieldLabel>
              <TextArea
                rows={10}
                value={draft.agent.systemPrompt}
                onChange={(e) => update("agent", "systemPrompt", e.target.value)}
              />
              <Row>
                <Field $width="120px">
                  <FieldLabel>Max Iterations</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.agent.maxIterations}
                    onChange={(e) => update("agent", "maxIterations", Number(e.target.value))}
                  />
                </Field>
                <Field $width="180px">
                  <FieldLabel>Loop Mode</FieldLabel>
                  <Select
                    value={draft.agent.loopMode}
                    onChange={(e) => update("agent", "loopMode", e.target.value)}
                  >
                    <option value="simple">simple</option>
                    <option value="plan_execute">plan_execute</option>
                    <option value="full_verify">full_verify</option>
                  </Select>
                </Field>
              </Row>
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Phases</span>
              <SummaryMeta>Planning, Executing, Verifying</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <SubSection>
                <SubSectionTitle>Planning</SubSectionTitle>
                <FieldLabel>Prompt</FieldLabel>
                <TextArea
                  rows={4}
                  value={draft.agent.phasePrompts.planningPrompt}
                  onChange={(e) => updateAgentNested("phasePrompts", "planningPrompt", e.target.value)}
                />
                <FieldLabel>Guidance</FieldLabel>
                <TextArea
                  rows={3}
                  value={draft.agent.phaseGuidance.planning}
                  onChange={(e) => updateAgentNested("phaseGuidance", "planning", e.target.value)}
                />
              </SubSection>

              <SubSection>
                <SubSectionTitle>Executing</SubSectionTitle>
                <FieldLabel>Prompt</FieldLabel>
                <TextArea
                  rows={4}
                  value={draft.agent.phasePrompts.executingPrompt}
                  onChange={(e) => updateAgentNested("phasePrompts", "executingPrompt", e.target.value)}
                />
                <FieldLabel>Guidance</FieldLabel>
                <TextArea
                  rows={3}
                  value={draft.agent.phaseGuidance.executing}
                  onChange={(e) => updateAgentNested("phaseGuidance", "executing", e.target.value)}
                />
              </SubSection>

              <SubSection>
                <SubSectionTitle>Verifying</SubSectionTitle>
                <FieldLabel>Prompt</FieldLabel>
                <TextArea
                  rows={4}
                  value={draft.agent.phasePrompts.verifyingPrompt}
                  onChange={(e) => updateAgentNested("phasePrompts", "verifyingPrompt", e.target.value)}
                />
                <FieldLabel>Guidance</FieldLabel>
                <TextArea
                  rows={3}
                  value={draft.agent.phaseGuidance.verifying}
                  onChange={(e) => updateAgentNested("phaseGuidance", "verifying", e.target.value)}
                />
              </SubSection>
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Context Blocks</span>
              <SummaryMeta>Task, Memory, Tool Rules</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Task Prompt mit Session</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.promptSections.taskWithSession}
                onChange={(e) => updateAgentNested("promptSections", "taskWithSession", e.target.value)}
              />

              <FieldLabel>Memory Prompt mit Session</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.promptSections.memoryWithSession}
                onChange={(e) => updateAgentNested("promptSections", "memoryWithSession", e.target.value)}
              />

              <FieldLabel>Tool Rules mit Session</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.promptSections.toolRulesWithSession}
                onChange={(e) => updateAgentNested("promptSections", "toolRulesWithSession", e.target.value)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Error Handling</span>
              <SummaryMeta>Retry, Verify, Vision-Fallback</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Verification Instruction</FieldLabel>
              <TextArea
                rows={6}
                value={draft.loop.verificationInstruction}
                onChange={(e) => updateTopLevelNested("loop", "verificationInstruction", e.target.value)}
              />
              <Hint><PlaceholderHint>{`{{TASK_SUMMARY}}`}</PlaceholderHint></Hint>

              <FieldLabel>Verification Retry Message</FieldLabel>
              <TextArea
                rows={3}
                value={draft.loop.verificationRetryMessage}
                onChange={(e) => updateTopLevelNested("loop", "verificationRetryMessage", e.target.value)}
              />
              <Hint><PlaceholderHint>{`{{FEEDBACK}}`}</PlaceholderHint></Hint>

              <FieldLabel>Leere Antwort</FieldLabel>
              <TextArea
                rows={3}
                value={draft.retry.emptyResponseInstruction}
                onChange={(e) => update("retry", "emptyResponseInstruction", e.target.value)}
              />

              <FieldLabel>Ungueltiger Tool-Aufruf</FieldLabel>
              <TextArea
                rows={3}
                value={draft.retry.invalidToolInstruction}
                onChange={(e) => update("retry", "invalidToolInstruction", e.target.value)}
              />

              <FieldLabel>Vision Fallback</FieldLabel>
              <TextArea
                rows={4}
                value={draft.attachment.visionNotSupportedInstruction}
                onChange={(e) => updateTopLevelNested("attachment", "visionNotSupportedInstruction", e.target.value)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Model Defaults</span>
              <SummaryMeta>globaler Fallback fuer Reasoning</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <Field $width="180px">
                <FieldLabel>Default Effort</FieldLabel>
                <Select
                  value={draft.reasoning.defaultEffort}
                  onChange={(e) => update("reasoning", "defaultEffort", e.target.value)}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </Select>
              </Field>
              <Hint>Fallback wenn weder Session noch Model-Settings einen Wert setzen.</Hint>
            </SectionBody>
          </SectionCard>
        </Panel>

        <Actions>
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
          {saved && <SaveMsg>Gespeichert!</SaveMsg>}
          {error && <SaveMsg style={{ color: "var(--error)" }}>{error}</SaveMsg>}
        </Actions>
      </PageWrapper>
    </SettingsLayout>
  );
}
