import React from "react";
import styled from "styled-components";
import type { EndpointType, ModelInfo, ModelSettings, ReasoningLevelConfig } from "@/types/api";
import { REASONING_LEVELS, REASONING_LEVEL_DEFAULTS } from "@/constants/reasoningDefaults";
import { useToggleSet } from "@/hooks/useToggleSet";
import { ENDPOINT_OPTIONS } from "./constants";

const SectionDivider = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: var(--space-sm);
`;

const Label = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const Select = styled.select`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-sm);

  &:focus {
    border-color: var(--border-focus);
    outline: none;
  }
`;

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const SettingsToggle = styled.button`
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 2px var(--space-xs);

  &:hover {
    color: var(--text-primary);
  }
`;

const ModelCard = styled.div`
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
`;

const ModelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
`;

const ModelName = styled.div`
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
`;

const ContextInfo = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
`;

const LevelGrid = styled.div`
  display: grid;
  grid-template-columns: 90px 1fr 1fr;
  margin-top: var(--space-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
  font-size: var(--font-size-sm);
`;

const LevelHeaderCell = styled.div`
  padding: var(--space-xs) var(--space-sm);
  font-weight: 600;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
`;

const LevelCell = styled.div<{ $isDefault?: boolean; $isLast?: boolean }>`
  padding: var(--space-xs) var(--space-sm);
  display: flex;
  align-items: center;
  background: ${(p) => (p.$isDefault ? "var(--accent-muted)" : "var(--bg-base)")};
  border-bottom: ${(p) => (p.$isLast ? "none" : "1px solid var(--border)")};
`;

const LevelLabelCell = styled(LevelCell)`
  font-weight: 600;
  color: ${(p) => (p.$isDefault ? "var(--accent)" : "var(--text-secondary)")};
  gap: var(--space-xs);
  font-family: var(--font-mono);
`;

const DefaultDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
`;

const SmallInput = styled.input<{ $isDefault?: boolean }>`
  background: ${(p) => (p.$isDefault ? "rgba(108, 138, 255, 0.08)" : "var(--bg-elevated)")};
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  padding: 2px 6px;
  width: 100%;
  font-family: var(--font-mono);

  &::placeholder {
    color: var(--text-muted);
    font-style: italic;
  }

  &:focus {
    border-color: var(--border-focus);
    outline: none;
  }
`;

const UnitHint = styled.span`
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.7rem;
  margin-left: var(--space-xs);
  opacity: 0.7;
`;

type Props = {
  models: ModelInfo[];
  modelSettings: Record<string, ModelSettings>;
  onSave: (modelId: string, settings: ModelSettings) => void;
};

export default function ModelSettingsSection({ models, modelSettings, onSave }: Props) {
  const expandedModels = useToggleSet();

  function handleDefaultChange(modelId: string, value: string) {
    const settings = modelSettings[modelId] ?? {};
    onSave(modelId, { ...settings, reasoningEffort: value || undefined });
  }

  function handleLevelChange(modelId: string, level: string, field: keyof ReasoningLevelConfig, value: string) {
    const settings = modelSettings[modelId] ?? {};
    const levels = { ...settings.levels };
    const levelConfig = { ...levels[level] };
    const numVal = value === "" ? undefined : Number(value);
    levelConfig[field] = numVal;
    if (levelConfig.temperature === undefined && levelConfig.maxOutputTokens === undefined) delete levels[level];
    else levels[level] = levelConfig;
    onSave(modelId, { ...settings, levels: Object.keys(levels).length > 0 ? levels : undefined });
  }

  return (
    <>
      <SectionDivider>Modelle</SectionDivider>
      {models.length === 0 ? (
        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
          Keine Modelle verfügbar. Ist der Provider gestartet?
        </span>
      ) : (
        models.map((model) => {
          const settings = modelSettings[model.id] ?? {};
          const isOpen = expandedModels.has(model.id);

          return (
            <ModelCard key={model.id}>
              <ModelHeader>
                <ModelName>
                  {model.id}
                  {model.maxContextLength && (
                    <ContextInfo>
                      ctx: {model.contextLength ? `${model.contextLength.toLocaleString()} / ` : ""}
                      {model.maxContextLength.toLocaleString()}
                    </ContextInfo>
                  )}
                </ModelName>
                <SettingsRow>
                  <Label>Endpoint:</Label>
                  <Select
                    value={settings.endpoint ?? "chat-completions"}
                    onChange={(e) => onSave(model.id, { ...settings, endpoint: e.target.value as EndpointType })}
                  >
                    {ENDPOINT_OPTIONS.map((endpoint) => <option key={endpoint.value} value={endpoint.value}>{endpoint.label}</option>)}
                  </Select>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", fontSize: "var(--font-size-sm)", color: "var(--text-muted)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.reasoningOnOff ?? false}
                      onChange={(e) => onSave(model.id, { ...settings, reasoningOnOff: e.target.checked || undefined })}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    🧠 On/Off-Mapping
                  </label>
                  <Label>Default:</Label>
                  <Select value={settings.reasoningEffort ?? ""} onChange={(e) => handleDefaultChange(model.id, e.target.value)}>
                    <option value="">--</option>
                    {REASONING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </Select>
                  <SettingsToggle onClick={() => expandedModels.toggle(model.id)}>
                    {isOpen ? "▲ Settings" : "▼ Settings"}
                  </SettingsToggle>
                </SettingsRow>
              </ModelHeader>
              {isOpen && (
                <LevelGrid>
                  <LevelHeaderCell>Level</LevelHeaderCell>
                  <LevelHeaderCell>Temperature<UnitHint>0–2</UnitHint></LevelHeaderCell>
                  <LevelHeaderCell>Max Output<UnitHint>tokens</UnitHint></LevelHeaderCell>
                  {REASONING_LEVELS.map((level, index) => {
                    const levelConfig = settings.levels?.[level] ?? {};
                    const isDefault = level === settings.reasoningEffort;
                    const isLast = index === REASONING_LEVELS.length - 1;
                    const defaults = REASONING_LEVEL_DEFAULTS[level];
                    return (
                      <React.Fragment key={level}>
                        <LevelLabelCell $isDefault={isDefault} $isLast={isLast}>
                          {isDefault && <DefaultDot />}
                          {level}
                        </LevelLabelCell>
                        <LevelCell $isDefault={isDefault} $isLast={isLast}>
                          <SmallInput
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            $isDefault={isDefault}
                            placeholder={defaults?.temperature?.toString() ?? "auto"}
                            value={levelConfig.temperature ?? ""}
                            onChange={(e) => handleLevelChange(model.id, level, "temperature", e.target.value)}
                          />
                        </LevelCell>
                        <LevelCell $isDefault={isDefault} $isLast={isLast}>
                          <SmallInput
                            type="number"
                            min="-1"
                            step="1024"
                            $isDefault={isDefault}
                            placeholder={
                              defaults?.maxOutputTokens != null
                                ? defaults.maxOutputTokens === -1 ? "unlimited" : defaults.maxOutputTokens.toString()
                                : "auto"
                            }
                            value={levelConfig.maxOutputTokens ?? ""}
                            onChange={(e) => handleLevelChange(model.id, level, "maxOutputTokens", e.target.value)}
                          />
                        </LevelCell>
                      </React.Fragment>
                    );
                  })}
                </LevelGrid>
              )}
            </ModelCard>
          );
        })
      )}
    </>
  );
}
