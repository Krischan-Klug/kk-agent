import React from "react";
import styled from "styled-components";
import type { EndpointType, ModelInfo, ModelSettings, ReasoningLevelConfig } from "@/types/api";
import {
  DEFAULT_REASONING_LEVELS,
  buildMaxOutputOptions,
  getDefaultLevelConfig,
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
} from "@/lib/modelCapabilities";
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
  flex-wrap: wrap;
`;

const ContextInfo = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
`;

const CapabilityBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 0.7rem;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-muted);
  border: 1px solid var(--border);
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
  background: ${(p) => (p.$isDefault ? "rgba(193, 95, 60, 0.08)" : "var(--bg-elevated)")};
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
          Keine Modelle verfuegbar. Ist der Provider gestartet?
        </span>
      ) : (
        models.map((model) => {
          const settings = modelSettings[model.id] ?? {};
          const isOpen = expandedModels.has(model.id);
          const endpoints = model.capabilities.supportedEndpoints;
          const showReasoning = model.capabilities.supportsReasoning;
          const reasoningLevels = showReasoning ? getReasoningLevels(model) : [...DEFAULT_REASONING_LEVELS];
          const selectedEndpoint = getResolvedEndpoint(model, settings);
          const endpointCapabilities = getEndpointCapabilities(model, selectedEndpoint);
          const maxOutputOptions = buildMaxOutputOptions(
            endpointCapabilities.maxOutputTokensRange,
            endpointCapabilities.maxOutputTokensRange?.max,
          );
          const showSettings = showReasoning || endpointCapabilities.temperatureSupported || endpointCapabilities.maxOutputTokensSupported;

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
                  {model.capabilities.supportsTools && <CapabilityBadge>🛠️ Tools</CapabilityBadge>}
                  {showReasoning && (
                    <CapabilityBadge>
                      🧠 {model.capabilities.reasoningSource === "observed" ? "observed" : model.capabilities.reasoningControl}
                    </CapabilityBadge>
                  )}
                  {endpointCapabilities.temperatureSupported && endpointCapabilities.temperatureRange && (
                    <CapabilityBadge>
                      🔥 {endpointCapabilities.temperatureRange.min}-{endpointCapabilities.temperatureRange.max}
                    </CapabilityBadge>
                  )}
                  {endpointCapabilities.maxOutputTokensSupported && endpointCapabilities.maxOutputTokensRange && (
                    <CapabilityBadge>
                      📦 {endpointCapabilities.maxOutputTokensRange.max.toLocaleString()}
                    </CapabilityBadge>
                  )}
                  {model.capabilities.supportsStreaming && <CapabilityBadge>🌊 Streaming</CapabilityBadge>}
                </ModelName>
                <SettingsRow>
                  {endpoints.length > 1 && (
                    <>
                      <Label>Endpoint:</Label>
                      <Select
                        value={selectedEndpoint}
                        onChange={(e) => onSave(model.id, { ...settings, endpoint: e.target.value as EndpointType })}
                      >
                        {ENDPOINT_OPTIONS.filter((endpoint) => endpoints.includes(endpoint.value)).map((endpoint) => (
                          <option key={endpoint.value} value={endpoint.value}>{endpoint.label}</option>
                        ))}
                      </Select>
                    </>
                  )}
                  {showSettings && (
                    <>
                      <Label>{showReasoning ? "Default" : "Profil"}</Label>
                      <Select value={settings.reasoningEffort ?? ""} onChange={(e) => handleDefaultChange(model.id, e.target.value)}>
                        <option value="">--</option>
                        {reasoningLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                      </Select>
                    </>
                  )}
                  {showSettings && (
                    <SettingsToggle onClick={() => expandedModels.toggle(model.id)}>
                      {isOpen ? "▲ Settings" : "▼ Settings"}
                    </SettingsToggle>
                  )}
                </SettingsRow>
              </ModelHeader>
              {showSettings && isOpen && (
                <LevelGrid>
                  <LevelHeaderCell>Level</LevelHeaderCell>
                  <LevelHeaderCell>
                    Temperature
                    {endpointCapabilities.temperatureRange && (
                      <UnitHint>
                        {endpointCapabilities.temperatureRange.min}-{endpointCapabilities.temperatureRange.max}
                      </UnitHint>
                    )}
                  </LevelHeaderCell>
                  <LevelHeaderCell>Max Output<UnitHint>tokens</UnitHint></LevelHeaderCell>
                  {reasoningLevels.map((level, index) => {
                    const levelConfig = settings.levels?.[level] ?? {};
                    const isDefault = level === settings.reasoningEffort;
                    const isLast = index === reasoningLevels.length - 1;
                    const defaults = getDefaultLevelConfig(level);
                    return (
                      <React.Fragment key={level}>
                        <LevelLabelCell $isDefault={isDefault} $isLast={isLast}>
                          {isDefault && <DefaultDot />}
                          {level}
                        </LevelLabelCell>
                        <LevelCell $isDefault={isDefault} $isLast={isLast}>
                          <SmallInput
                            type="number"
                            min={endpointCapabilities.temperatureRange?.min ?? 0}
                            max={endpointCapabilities.temperatureRange?.max ?? 2}
                            step={endpointCapabilities.temperatureRange?.step ?? 0.1}
                            $isDefault={isDefault}
                            placeholder={defaults?.temperature?.toString() ?? "auto"}
                            value={levelConfig.temperature ?? ""}
                            onChange={(e) => handleLevelChange(model.id, level, "temperature", e.target.value)}
                          />
                        </LevelCell>
                        <LevelCell $isDefault={isDefault} $isLast={isLast}>
                          <SmallInput
                            type="number"
                            min={endpointCapabilities.maxOutputTokensRange?.min ?? 1}
                            max={endpointCapabilities.maxOutputTokensRange?.max}
                            step={endpointCapabilities.maxOutputTokensRange?.step ?? 1}
                            $isDefault={isDefault}
                            placeholder={
                              defaults?.maxOutputTokens != null
                                ? defaults.maxOutputTokens.toString()
                                : maxOutputOptions[0]?.label ?? "auto"
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
