import { useState } from "react";
import styled from "styled-components";
import type {
  ModelInfo,
  ModelProfileSummary,
  ModelSettings,
  ProviderConfig,
} from "kk-agent-contract";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { ActionsRow } from "@/components/PageForm";
import { reportError } from "@/lib/errorReporting";
import ModelSettingsSection from "./ModelSettingsSection";
import ProviderFormFields, { type ProviderFormValue } from "./ProviderFormFields";

const Header = styled.div<{ $withBody: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: ${(p) => (p.$withBody ? "var(--space-md)" : "0")};
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: nowrap;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

const NameText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
`;

const Meta = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: nowrap;
  flex-shrink: 0;
`;

const ProviderStatusDot = styled.span<{ $state: "ok" | "error" | "unknown" }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${(p) => {
    if (p.$state === "ok") return "var(--success)";
    if (p.$state === "error") return "var(--danger)";
    return "var(--text-muted)";
  }};
`;

const ExpandedContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
`;

const TestResult = styled.span<{ $ok: boolean }>`
  font-size: var(--font-size-sm);
  color: ${(p) => (p.$ok ? "var(--success)" : "var(--danger)")};
`;

type Props = {
  provider: ProviderConfig;
  isTesting: boolean;
  testResult?: { ok: boolean; error?: string };
  models: ModelInfo[];
  profiles: ModelProfileSummary[];
  modelSettings: Record<string, ModelSettings>;
  onTest: () => void;
  onDelete: () => void;
  onSave: (value: ProviderFormValue) => Promise<void>;
  onModelSettingsSave: (model: ModelInfo, settings: ModelSettings) => void;
};

export default function ProviderCard({
  provider,
  isTesting,
  testResult,
  models,
  profiles,
  modelSettings,
  onTest,
  onDelete,
  onSave,
  onModelSettingsSave,
}: Props) {
  const [isExpanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProviderFormValue>({
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? "",
  });
  const statusState = testResult ? (testResult.ok ? "ok" : "error") : "unknown";
  const statusTitle = isTesting
    ? "Testing"
    : testResult
      ? testResult.ok
        ? "Verified"
        : "Test failed"
      : "Not tested yet";

  function toggleExpanded() {
    if (!isExpanded) {
      setDraft({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey ?? "",
      });
    }
    setExpanded((expanded) => !expanded);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setExpanded(false);
    } catch (error) {
      reportError("Failed to update provider", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Header $withBody={isExpanded}>
        <HeaderTop>
          <NameRow>
            <NameText title={provider.name}>{provider.name}</NameText>
            <ProviderStatusDot $state={statusState} title={statusTitle} />
            <Meta title={provider.baseUrl}>{provider.baseUrl}</Meta>
          </NameRow>
          <Controls>
            <Button size="sm" variant="secondary" onClick={toggleExpanded}>
              {isExpanded ? "Close" : "Edit"}
            </Button>
          </Controls>
        </HeaderTop>
      </Header>

      {isExpanded && (
        <ExpandedContent>
          <ProviderFormFields value={draft} onChange={setDraft} />

          <ModelSettingsSection
            models={models}
            profiles={profiles}
            modelSettings={modelSettings}
            onSave={onModelSettingsSave}
          />

          <ActionsRow>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || !draft.name.trim() || !draft.baseUrl.trim()}
            >
              {saving ? "..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? "..." : "Test"}
            </Button>
            {testResult && (
              <TestResult $ok={testResult.ok}>
                {testResult.ok ? "OK" : (testResult.error ?? "Error")}
              </TestResult>
            )}
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete provider
            </Button>
          </ActionsRow>
        </ExpandedContent>
      )}
    </Card>
  );
}
