import styled from "styled-components";
import type { ModelInfo, ModelSettings, ProviderConfig } from "@/types/api";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Input from "@/components/Input";
import ModelSettingsSection from "./ModelSettingsSection";

const Wrapper = styled.div<{ $active: boolean }>`
  background: var(--bg-elevated);
  border: 1px solid ${(p) => (p.$active ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  padding: var(--space-lg);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  cursor: pointer;
`;

const Name = styled.div`
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const Meta = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const ExpandedContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-md);
  border-top: 1px solid var(--border);
  padding-top: var(--space-md);
`;

const FormRow = styled.div`
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  flex-wrap: wrap;
`;

const FormField = styled.div<{ $flex?: number }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: ${(p) => p.$flex ?? "unset"};
  min-width: 150px;
`;

const Label = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const TestResult = styled.span<{ $ok: boolean }>`
  font-size: var(--font-size-sm);
  color: ${(p) => (p.$ok ? "var(--success)" : "var(--danger)")};
`;

type Props = {
  provider: ProviderConfig;
  isActive: boolean;
  isExpanded: boolean;
  isTesting: boolean;
  testResult?: { ok: boolean; error?: string };
  models: ModelInfo[];
  modelSettings: Record<string, ModelSettings>;
  onToggleExpand: () => void;
  onActivate: () => void;
  onTest: () => void;
  onDelete: () => void;
  onFieldChange: (field: keyof ProviderConfig, value: string) => void;
  onModelSettingsSave: (modelId: string, settings: ModelSettings) => void;
};

export default function ProviderCard({
  provider,
  isActive,
  isExpanded,
  isTesting,
  testResult,
  models,
  modelSettings,
  onToggleExpand,
  onActivate,
  onTest,
  onDelete,
  onFieldChange,
  onModelSettingsSave,
}: Props) {
  return (
    <Wrapper $active={isActive}>
      <Header onClick={onToggleExpand}>
        <Name>
          {isActive && <Badge variant="info">aktiv</Badge>}
          {provider.name}
          <Meta>{provider.baseUrl}</Meta>
        </Name>
        <HeaderActions>
          {!isActive && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onActivate(); }}>
              Aktivieren
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onTest(); }} disabled={isTesting}>
            {isTesting ? "..." : "Testen"}
          </Button>
          {testResult && <TestResult $ok={testResult.ok}>{testResult.ok ? "✓ OK" : `✗ ${testResult.error ?? "Fehler"}`}</TestResult>}
          <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>{isExpanded ? "▲" : "▼"}</span>
        </HeaderActions>
      </Header>

      {isExpanded && (
        <ExpandedContent>
          <FormRow>
            <FormField>
              <Label>Name</Label>
              <Input value={provider.name} onChange={(e) => onFieldChange("name", e.target.value)} />
            </FormField>
            <FormField $flex={1}>
              <Label>Base URL</Label>
              <Input value={provider.baseUrl} onChange={(e) => onFieldChange("baseUrl", e.target.value)} />
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

          {isActive && (
            <ModelSettingsSection models={models} modelSettings={modelSettings} onSave={onModelSettingsSave} />
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Provider löschen
            </Button>
          </div>
        </ExpandedContent>
      )}
    </Wrapper>
  );
}
