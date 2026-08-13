import styled from "styled-components";
import type { ModelInfo, ModelSettings, ProviderConfig } from "@/types/api";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Input from "@/components/Input";
import TextArea from "@/components/TextArea";
import { ActionsRow, FormField, FormRow } from "@/components/PageForm";
import ModelSettingsSection from "./ModelSettingsSection";

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

const Label = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const TestResult = styled.span<{ $ok: boolean }>`
  font-size: var(--font-size-sm);
  color: ${(p) => (p.$ok ? "var(--success)" : "var(--danger)")};
`;

function modelsToString(models?: string[]): string {
  return (models ?? []).join("\n");
}

type Props = {
  provider: ProviderConfig;
  isExpanded: boolean;
  isTesting: boolean;
  testResult?: { ok: boolean; error?: string };
  models: ModelInfo[];
  modelSettings: Record<string, ModelSettings>;
  onToggleExpand: () => void;
  onTest: () => void;
  onDelete: () => void;
  onFieldChange: (field: keyof ProviderConfig, value: string) => void;
  onModelSettingsSave: (model: ModelInfo, settings: ModelSettings) => void;
};

export default function ProviderCard({
  provider,
  isExpanded,
  isTesting,
  testResult,
  models,
  modelSettings,
  onToggleExpand,
  onTest,
  onDelete,
  onFieldChange,
  onModelSettingsSave,
}: Props) {
  const statusState = testResult ? (testResult.ok ? "ok" : "error") : "unknown";
  const statusTitle = isTesting
    ? "Testing"
    : testResult
      ? testResult.ok
        ? "Verified"
        : "Test failed"
      : "Not tested yet";

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
            <Button size="sm" variant="secondary" onClick={onToggleExpand}>
              {isExpanded ? "Close" : "Edit"}
            </Button>
          </Controls>
        </HeaderTop>
      </Header>

      {isExpanded && (
        <ExpandedContent>
          <FormRow>
            <FormField>
              <Label>Name</Label>
              <Input
                value={provider.name}
                onChange={(e) => onFieldChange("name", e.target.value)}
              />
            </FormField>
            <FormField $flex={1}>
              <Label>Base URL</Label>
              <Input
                value={provider.baseUrl}
                onChange={(e) => onFieldChange("baseUrl", e.target.value)}
              />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField $flex={1}>
              <Label>API Key</Label>
              <Input
                type="password"
                value={provider.apiKey ?? ""}
                onChange={(e) => onFieldChange("apiKey", e.target.value)}
                placeholder="optional"
              />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField $flex={1}>
              <Label>Models (optional, eine ID pro Zeile)</Label>
              <TextArea
                value={modelsToString(provider.models)}
                onChange={(e) => onFieldChange("models", e.target.value)}
                placeholder={"e.g. glm-4.6\nglm-4.5"}
                rows={3}
              />
            </FormField>
          </FormRow>

          <ModelSettingsSection
            models={models}
            modelSettings={modelSettings}
            onSave={onModelSettingsSave}
          />

          <ActionsRow>
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
