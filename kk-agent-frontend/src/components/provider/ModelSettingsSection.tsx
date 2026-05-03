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
import { toModelRef } from "@/lib/modelRefs";
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

const CapabilityRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
`;

const IconChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-size: 0.7rem;
  font-weight: 700;
  font-family: var(--font-mono);
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

const StaticEndpointBadge = styled(IconChip)`
  min-width: unset;
  height: auto;
  padding: 2px 8px;
  font-weight: 500;
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
  onSave: (model: ModelInfo, settings: ModelSettings) => void;
};

export default function ModelSettingsSection({ models, modelSettings, onSave }: Props) {
  const expandedModels = useToggleSet();

  function saveModelSettings(model: ModelInfo, patch: Partial<ModelSettings>) {
    const settings = modelSettings[toModelRef(model)] ?? {};
    onSave(model, {
      ...settings,
      ...patch,
    });
  }

  function saveRequestConfig(model: ModelInfo, nextConfig: LlmRequestConfig | undefined) {
    saveModelSettings(model, {
      llmRequestConfig: compactLlmRequestConfig(nextConfig),
    });
  }

  function handleLlmConfigChange(model: ModelInfo, patch: NonNullable<ModelSettings["llmRequestConfig"]>) {
    const settings = modelSettings[toModelRef(model)] ?? {};
    saveRequestConfig(model, mergeLlmRequestConfigs(settings.llmRequestConfig, patch));
  }

  return (
    <>
      <SectionDivider>Models</SectionDivider>
      {models.length === 0 ? (
        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
          No models available. Is the provider started?
        </span>
      ) : (
        models.map((model) => {
          const modelRef = toModelRef(model);
          const settings = modelSettings[modelRef] ?? {};
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
                  <CapabilityRow>
                    {model.capabilities.supportsTools && <IconChip title="Tools available">🛠️</IconChip>}
                    {showReasoning && <IconChip title={`Reasoning available: ${reasoningLevels.join(", ")}`}>🧠</IconChip>}
                  </CapabilityRow>
                </ModelMeta>
                <SettingsRow>
                  {supportedEndpoints.length > 1 ? (
                    <SegmentWrap>
                      {ENDPOINT_OPTIONS.filter((option) => supportedEndpoints.includes(option.value)).map((option) => (
                        <SegmentButton
                          key={option.value}
                          type="button"
                          $active={selectedEndpoint === option.value}
                          onClick={() => handleLlmConfigChange(model, {
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
                          onChange={(event) => handleLlmConfigChange(model, {
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
                    onChange={(patch) => handleLlmConfigChange(model, patch)}
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
