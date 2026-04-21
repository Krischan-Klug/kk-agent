import styled from "styled-components";
import type { LlmRequestConfig, ModelInfo, ModelSettings } from "@/types/api";
import {
  getEndpointCapabilities,
  getReasoningLevels,
  getResolvedEndpoint,
  normalizeCanonicalReasoningEffort,
} from "@/lib/modelCapabilities";
import {
  compactLlmRequestConfig,
  mergeLlmRequestConfigs,
} from "@/lib/llmRequestConfig";
import { useToggleSet } from "@/hooks/useToggleSet";
import LlmRequestConfigEditor from "@/components/LlmRequestConfigEditor";
import { ENDPOINT_OPTIONS } from "./constants";

const SectionDivider = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: var(--space-sm);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
`;

const ModelMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
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

const BadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
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

const SegmentWrap = styled.div`
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-elevated);
  padding: 2px;
`;

const SegmentButton = styled.button<{ $active: boolean }>`
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  background: ${(p) => (p.$active ? "var(--accent)" : "transparent")};
  color: ${(p) => (p.$active ? "var(--bg-base)" : "var(--text-secondary)")};
  font-size: var(--font-size-xs);
  cursor: pointer;
`;

const StaticEndpointBadge = styled(CapabilityBadge)`
  color: var(--text-secondary);
  background: var(--bg-elevated);
`;

const QuickSettings = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-sm);
  margin-top: var(--space-sm);
`;

const FieldCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-base);
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

type Props = {
  models: ModelInfo[];
  modelSettings: Record<string, ModelSettings>;
  onSave: (modelId: string, settings: ModelSettings) => void;
};

export default function ModelSettingsSection({ models, modelSettings, onSave }: Props) {
  const expandedModels = useToggleSet();

  function saveModelSettings(modelId: string, patch: Partial<ModelSettings>) {
    const settings = modelSettings[modelId] ?? {};
    onSave(modelId, {
      ...settings,
      ...patch,
    });
  }

  function saveRequestConfig(modelId: string, nextConfig: LlmRequestConfig | undefined) {
    saveModelSettings(modelId, {
      llmRequestConfig: compactLlmRequestConfig(nextConfig),
    });
  }

  function handleLlmConfigChange(modelId: string, patch: NonNullable<ModelSettings["llmRequestConfig"]>) {
    const settings = modelSettings[modelId] ?? {};
    saveRequestConfig(modelId, mergeLlmRequestConfigs(settings.llmRequestConfig, patch));
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
          const selectedEndpoint = getResolvedEndpoint(model, settings);
          const supportedEndpoints = model.capabilities.supportedEndpoints;
          const reasoningLevels = getReasoningLevels(model);
          const endpointCapabilities = getEndpointCapabilities(model, selectedEndpoint);
          const showReasoning = reasoningLevels.length > 0;

          return (
            <ModelCard key={model.id} id={`model-${encodeURIComponent(model.id)}`}>
              <ModelHeader>
                <ModelMeta>
                  <ModelName>
                    {model.id}
                    {model.maxContextLength && (
                      <ContextInfo>
                        ctx: {model.contextLength ? `${model.contextLength.toLocaleString()} / ` : ""}
                        {model.maxContextLength.toLocaleString()}
                      </ContextInfo>
                    )}
                  </ModelName>
                  <BadgeRow>
                    {model.capabilities.supportsTools && <CapabilityBadge>Tools</CapabilityBadge>}
                    {showReasoning && <CapabilityBadge>Reasoning {reasoningLevels.join(", ")}</CapabilityBadge>}
                    {endpointCapabilities.temperatureSupported && endpointCapabilities.temperatureRange && (
                      <CapabilityBadge>
                        Temperature {endpointCapabilities.temperatureRange.min}-{endpointCapabilities.temperatureRange.max}
                      </CapabilityBadge>
                    )}
                    {endpointCapabilities.maxOutputTokensSupported && endpointCapabilities.maxOutputTokensRange && (
                      <CapabilityBadge>
                        Max output {endpointCapabilities.maxOutputTokensRange.max.toLocaleString()}
                      </CapabilityBadge>
                    )}
                    {model.capabilities.supportsStreaming && <CapabilityBadge>Streaming</CapabilityBadge>}
                  </BadgeRow>
                </ModelMeta>
                <SettingsRow>
                  {supportedEndpoints.length > 1 ? (
                    <SegmentWrap>
                      {ENDPOINT_OPTIONS.filter((option) => supportedEndpoints.includes(option.value)).map((option) => (
                        <SegmentButton
                          key={option.value}
                          type="button"
                          $active={selectedEndpoint === option.value}
                          onClick={() => handleLlmConfigChange(model.id, {
                            common: {
                              endpoint: option.value,
                            },
                          })}
                        >
                          {option.value}
                        </SegmentButton>
                      ))}
                    </SegmentWrap>
                  ) : (
                    <StaticEndpointBadge>{selectedEndpoint}</StaticEndpointBadge>
                  )}
                  <SettingsToggle type="button" onClick={() => expandedModels.toggle(model.id)}>
                    {isOpen ? "Hide settings" : "Show settings"}
                  </SettingsToggle>
                </SettingsRow>
              </ModelHeader>
              {isOpen && (
                <>
                  {showReasoning && (
                    <QuickSettings>
                      <FieldCard>
                        <Label>Default reasoning</Label>
                        <Select
                          value={settings.llmRequestConfig?.common?.reasoningEffort ?? ""}
                          onChange={(event) => handleLlmConfigChange(model.id, {
                            common: {
                              reasoningEffort: normalizeCanonicalReasoningEffort(event.target.value),
                            },
                          })}
                        >
                          <option value="">default</option>
                          {reasoningLevels.map((level) => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </Select>
                      </FieldCard>
                    </QuickSettings>
                  )}

                  <LlmRequestConfigEditor
                    value={settings.llmRequestConfig}
                    selectedEndpoint={selectedEndpoint}
                    endpointCapabilities={endpointCapabilities}
                    onChange={(patch) => handleLlmConfigChange(model.id, patch)}
                  />
                </>
              )}
            </ModelCard>
          );
        })
      )}
    </>
  );
}
