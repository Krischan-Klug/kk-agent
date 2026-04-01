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

  return (
    <SettingsLayout>
      <PageWrapper>
        <Panel>
          <PanelTitle>Defaults</PanelTitle>
          <Hint>Globale Fallbacks fuer neue Agents und Sessions. Alles bleibt editierbar, aber in kompakteren Gruppen.</Hint>

          <SectionCard open>
            <SectionSummary>
              <span>Agent Basis</span>
              <SummaryMeta>System-Prompt, Max Iterations, Loop Mode</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>System-Prompt</FieldLabel>
              <TextArea
                rows={5}
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
              <span>Phase Prompts</span>
              <SummaryMeta>planning, executing, verifying</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Planning Prompt</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.phasePrompts.planningPrompt}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phasePrompts: { ...prev.agent.phasePrompts, planningPrompt: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Executing Prompt</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.phasePrompts.executingPrompt}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phasePrompts: { ...prev.agent.phasePrompts, executingPrompt: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Verifying Prompt</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.phasePrompts.verifyingPrompt}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phasePrompts: { ...prev.agent.phasePrompts, verifyingPrompt: e.target.value },
                  },
                } : prev)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Phase Guidance</span>
              <SummaryMeta>planning, executing, verifying</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Planning Guidance</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.phaseGuidance.planning}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phaseGuidance: { ...prev.agent.phaseGuidance, planning: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Executing Guidance</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.phaseGuidance.executing}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phaseGuidance: { ...prev.agent.phaseGuidance, executing: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Verifying Guidance</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.phaseGuidance.verifying}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    phaseGuidance: { ...prev.agent.phaseGuidance, verifying: e.target.value },
                  },
                } : prev)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Prompt Sections</span>
              <SummaryMeta>Task, Memory, Tool Rules</SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Task Prompt mit Session</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.promptSections.taskWithSession}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    promptSections: { ...prev.agent.promptSections, taskWithSession: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Memory Prompt mit Session</FieldLabel>
              <TextArea
                rows={3}
                value={draft.agent.promptSections.memoryWithSession}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    promptSections: { ...prev.agent.promptSections, memoryWithSession: e.target.value },
                  },
                } : prev)}
              />

              <FieldLabel>Tool Rules mit Session</FieldLabel>
              <TextArea
                rows={4}
                value={draft.agent.promptSections.toolRulesWithSession}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  agent: {
                    ...prev.agent,
                    promptSections: { ...prev.agent.promptSections, toolRulesWithSession: e.target.value },
                  },
                } : prev)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Loop Verify</span>
              <SummaryMeta><PlaceholderHint>{`{{TASK_SUMMARY}}`} / {`{{FEEDBACK}}`}</PlaceholderHint></SummaryMeta>
            </SectionSummary>
            <SectionBody>
              <FieldLabel>Verification Instruction</FieldLabel>
              <TextArea
                rows={6}
                value={draft.loop.verificationInstruction}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  loop: { ...prev.loop, verificationInstruction: e.target.value },
                } : prev)}
              />

              <FieldLabel>Verification Retry Message</FieldLabel>
              <TextArea
                rows={3}
                value={draft.loop.verificationRetryMessage}
                onChange={(e) => setDraft((prev) => prev ? {
                  ...prev,
                  loop: { ...prev.loop, verificationRetryMessage: e.target.value },
                } : prev)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Retry Instructions</span>
              <SummaryMeta>empty response, invalid tool call</SummaryMeta>
            </SectionSummary>
            <SectionBody>
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
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionSummary>
              <span>Reasoning</span>
              <SummaryMeta>global fallback effort</SummaryMeta>
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
