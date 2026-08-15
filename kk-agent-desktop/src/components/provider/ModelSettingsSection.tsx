import styled from "styled-components";
import type {
  LlmRequestConfig,
  ModelInfo,
  ModelProfileSummary,
  ModelSettings,
} from "@/types/api";
import {
  getReasoningLevels,
  normalizeCanonicalReasoningEffort,
} from "@/lib/modelCapabilities";
import {
  compactLlmRequestConfig,
  mergeLlmRequestConfigs,
} from "@/lib/llmRequestConfig";
import { toModelRef } from "@/lib/modelRefs";
import { useToggleSet } from "@/hooks/useToggleSet";
import SamplingSettings from "@/components/SamplingSettings";

const SectionDivider = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: var(--space-sm);
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
  min-width: 0;
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

const Muted = styled.span`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const CapabilityRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

const CapabilityGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const CapabilityLabel = styled.span`
  margin-right: 2px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 7px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-muted);
  border: 1px solid var(--border);
`;

const EndpointChip = styled(Chip)`
  color: var(--text-secondary);
  background: var(--bg-elevated);
  font-family: var(--font-mono);
`;

const ProfileControl = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
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
  max-width: min(100%, 430px);

  &:focus {
    border-color: var(--border-focus);
    outline: none;
  }
`;

const SettingsToggle = styled.button`
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 2px var(--space-xs);

  &:hover { color: var(--text-primary); }
`;

const Issue = styled.div`
  margin-top: var(--space-xs);
  color: var(--warning, #d6a84b);
  font-size: var(--font-size-xs);
`;

const INPUT_MODALITY_EMOJIS: Record<string, string> = {
  text: "⌨️",
  image: "🖼️",
  audio: "🎙️",
  video: "🎥",
};

const OUTPUT_MODALITY_EMOJIS: Record<string, string> = {
  text: "💬",
  image: "🎨",
  audio: "🔊",
  video: "🎬",
};

function modalityLabel(modality: string): string {
  return `${modality.charAt(0).toUpperCase()}${modality.slice(1)}`;
}

type Props = {
  models: ModelInfo[];
  profiles: ModelProfileSummary[];
  modelSettings: Record<string, ModelSettings>;
  onSave: (model: ModelInfo, settings: ModelSettings) => void;
};

export default function ModelSettingsSection({
  models,
  profiles,
  modelSettings,
  onSave,
}: Props) {
  const expandedModels = useToggleSet();

  function saveModelSettings(model: ModelInfo, patch: Partial<ModelSettings>) {
    const settings = modelSettings[toModelRef(model)] ?? {};
    onSave(model, { ...settings, ...patch });
  }

  function saveRequestConfig(model: ModelInfo, nextConfig: LlmRequestConfig | undefined) {
    saveModelSettings(model, { llmRequestConfig: compactLlmRequestConfig(nextConfig) });
  }

  function handleLlmConfigChange(
    model: ModelInfo,
    patch: NonNullable<ModelSettings["llmRequestConfig"]>,
  ) {
    const settings = modelSettings[toModelRef(model)] ?? {};
    saveRequestConfig(model, mergeLlmRequestConfigs(settings.llmRequestConfig, patch));
  }

  return (
    <>
      <SectionDivider>Models</SectionDivider>
      {models.length === 0 ? (
        <Muted>No models available. Is the provider started?</Muted>
      ) : models.map((model) => {
        const modelRef = toModelRef(model);
        const settings = modelSettings[modelRef] ?? {};
        const isOpen = expandedModels.has(modelRef);
        const reasoningLevels = getReasoningLevels(model);
        const configured = Boolean(model.profile && model.capabilities);
        const suggestion = profiles.find((profile) => profile.id === model.suggestedProfileId);

        return (
          <ModelCard key={modelRef} id={`model-${encodeURIComponent(modelRef)}`}>
            <ModelHeader>
              <ModelMeta>
                <ModelName>
                  {model.id}
                  {model.maxContextLength && (
                    <Muted>
                      ctx: {model.contextLength ? `${model.contextLength.toLocaleString()} / ` : ""}
                      {model.maxContextLength.toLocaleString()}
                    </Muted>
                  )}
                </ModelName>
                <ProfileControl>
                  <Label htmlFor={`profile-${modelRef}`}>Inference profile</Label>
                  <Select
                    id={`profile-${modelRef}`}
                    value={settings.profileId ?? ""}
                    onChange={(event) => {
                      const profileId = event.target.value || undefined;
                      onSave(model, profileId ? { profileId } : {});
                    }}
                  >
                    <option value="">not configured</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}{profile.id === suggestion?.id ? " (suggested)" : ""}
                      </option>
                    ))}
                  </Select>
                </ProfileControl>
                {configured && model.capabilities && model.profile ? (
                  <CapabilityRow>
                    <CapabilityGroup>
                      <CapabilityLabel>Input</CapabilityLabel>
                      {model.capabilities.inputModalities.map((modality) => (
                        <Chip key={`input-${modality}`} title={`Input capability: ${modality}`}>
                          {INPUT_MODALITY_EMOJIS[modality] ?? "📦"} {modalityLabel(modality)}
                        </Chip>
                      ))}
                    </CapabilityGroup>
                    <CapabilityGroup>
                      <CapabilityLabel>Output</CapabilityLabel>
                      {model.capabilities.outputModalities.map((modality) => (
                        <Chip key={`output-${modality}`} title={`Output capability: ${modality}`}>
                          {OUTPUT_MODALITY_EMOJIS[modality] ?? "📦"} {modalityLabel(modality)}
                        </Chip>
                      ))}
                    </CapabilityGroup>
                    {(model.capabilities.tools.mode === "native" || reasoningLevels.length > 0) && (
                      <CapabilityGroup>
                        <CapabilityLabel>Features</CapabilityLabel>
                        {model.capabilities.tools.mode === "native" && (
                          <Chip title="Native tool calling">🛠️ Tools</Chip>
                        )}
                        {reasoningLevels.length > 0 && (
                          <Chip title={`Reasoning levels: ${reasoningLevels.join(", ")}`}>
                            🧠 Reasoning
                          </Chip>
                        )}
                      </CapabilityGroup>
                    )}
                    <EndpointChip title="API endpoint">🔌 {model.capabilities.endpoint}</EndpointChip>
                  </CapabilityRow>
                ) : (
                  <Muted>
                    Select a profile to enable this model.
                    {suggestion ? ` Suggested: ${suggestion.label}.` : ""}
                  </Muted>
                )}
                {model.compatibilityIssues.map((issue) => (
                  <Issue key={`${issue.code}-${issue.message}`}>{issue.message}</Issue>
                ))}
              </ModelMeta>
              {configured && (
                <SettingsToggle type="button" onClick={() => expandedModels.toggle(modelRef)}>
                  {isOpen ? "Hide settings" : "Show settings"}
                </SettingsToggle>
              )}
            </ModelHeader>

            {configured && isOpen && (
              <>
                {reasoningLevels.length > 0 && (
                  <QuickSettings>
                    <FieldCard>
                      <Label>Default reasoning</Label>
                      <Select
                        value={settings.llmRequestConfig?.reasoning?.effort ?? ""}
                        onChange={(event) => handleLlmConfigChange(model, {
                          reasoning: {
                            effort: normalizeCanonicalReasoningEffort(event.target.value),
                          },
                        })}
                      >
                        <option value="">manufacturer default</option>
                        {reasoningLevels.map((level) => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </Select>
                    </FieldCard>
                    <FieldCard>
                      <Label>Reasoning history</Label>
                      <Select
                        value={settings.llmRequestConfig?.reasoning?.history ?? "auto"}
                        onChange={(event) => handleLlmConfigChange(model, {
                          reasoning: {
                            history: event.target.value as "auto" | "discard" | "tool-turns" | "all",
                          },
                        })}
                      >
                        <option value="auto">manufacturer default</option>
                        <option value="discard">current turn only</option>
                        <option value="tool-turns">tool turns only</option>
                        <option value="all">preserve all</option>
                      </Select>
                    </FieldCard>
                  </QuickSettings>
                )}

                <SamplingSettings
                  value={settings.llmRequestConfig}
                  onChange={(nextConfig) => saveRequestConfig(model, nextConfig)}
                />
              </>
            )}
          </ModelCard>
        );
      })}
    </>
  );
}
