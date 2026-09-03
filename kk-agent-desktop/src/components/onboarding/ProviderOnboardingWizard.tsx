import { useState } from "react";
import styled from "styled-components";
import type {
  ModelInfo,
  ModelProfileSummary,
  ProviderConfig,
} from "kk-agent-contract";
import { provider as providerApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import { ActionsRow, MutedText } from "@/components/PageForm";
import ProviderFormFields, { type ProviderFormValue } from "@/components/provider/ProviderFormFields";
import { DEFAULT_PROVIDER_BASE_URL } from "@/components/provider/constants";

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: min(520px, calc(100vw - 48px));
`;

const StatusBox = styled.div<{ $tone: "info" | "success" | "error" }>`
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid
    ${(p) => {
      if (p.$tone === "success") return "var(--success)";
      if (p.$tone === "error") return "var(--danger)";
      return "var(--border)";
    }};
  color: ${(p) => {
    if (p.$tone === "success") return "var(--success)";
    if (p.$tone === "error") return "var(--danger)";
    return "var(--text-secondary)";
  }};
  background: var(--bg-surface);
  font-size: var(--font-size-sm);
`;

const ModelRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
`;

const ModelName = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
`;

const Select = styled.select`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: var(--space-xs) var(--space-sm);
`;

type StepState =
  | { kind: "idle" }
  | { kind: "saving" }
  | {
      kind: "profiles";
      provider: ProviderConfig;
      models: ModelInfo[];
      profiles: ModelProfileSummary[];
      saving?: boolean;
      error?: string;
    }
  | { kind: "error"; message: string };

type Props = {
  onComplete: (provider: ProviderConfig) => void;
};

function parseModelsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function ProviderOnboardingWizard({ onComplete }: Props) {
  const [form, setForm] = useState<ProviderFormValue>({
    name: "Local LLM",
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    apiKey: "",
    models: "",
  });
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
  const [state, setState] = useState<StepState>({ kind: "idle" });

  const canSubmit =
    form.name.trim().length > 0 &&
    form.baseUrl.trim().length > 0 &&
    state.kind !== "saving";

  async function cleanupProvider(providerId: string) {
    try {
      await providerApi.removeProvider(providerId);
    } catch (error) {
      reportError("Failed to remove incomplete provider", error);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    let created: ProviderConfig | undefined;
    setState({ kind: "saving" });
    try {
      const parsedModels = parseModelsText(form.models);
      created = await providerApi.addProvider({
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim() || undefined,
        models: parsedModels.length > 0 ? parsedModels : undefined,
      });

      const testResult = await providerApi.testProvider(created.id);
      if (!testResult.ok) {
        await cleanupProvider(created.id);
        reportError("Provider connection failed", testResult.error || "Provider connection failed.");
        setState({
          kind: "error",
          message: testResult.error || "Provider connection failed.",
        });
        return;
      }

      const modelsResult = await providerApi.getModels(created.id);
      if (modelsResult.models.length === 0) {
        await cleanupProvider(created.id);
        reportError("Provider setup failed", "Provider reachable, but no models were found.");
        setState({
          kind: "error",
          message: "Provider reachable, but no models were found.",
        });
        return;
      }

      setState({
        kind: "profiles",
        provider: created,
        models: modelsResult.models,
        profiles: modelsResult.profiles,
      });
    } catch (error) {
      if (created) {
        await cleanupProvider(created.id);
      }
      const message = reportError("Provider onboarding failed", error).message;
      setState({ kind: "error", message });
    }
  }

  async function handleProfilesSubmit() {
    if (state.kind !== "profiles") return;
    const selections = Object.entries(selectedProfiles).filter(([, profileId]) => profileId);
    if (selections.length === 0) return;
    const readyState = state;
    setState({ ...readyState, saving: true, error: undefined });
    try {
      await Promise.all(selections.map(([modelId, profileId]) =>
        providerApi.setModelSettings(readyState.provider.id, modelId, { profileId }),
      ));
      onComplete(readyState.provider);
    } catch (error) {
      const message = reportError("Failed to save onboarding model profiles", error).message;
      setState({ ...readyState, saving: false, error: message });
    }
  }

  return (
    <Modal title="Set up provider" onClose={() => {}} showClose={false}>
      <Body>
        {state.kind === "profiles" ? (
          <>
            <MutedText>
              Select an inference profile for every model you want to use. The profile fixes its endpoint and capabilities.
            </MutedText>
            {state.models.map((model) => {
              const suggestion = state.profiles.find((profile) => profile.id === model.suggestedProfileId);
              return (
                <ModelRow key={model.id}>
                  <ModelName>{model.id}</ModelName>
                  <Select
                    value={selectedProfiles[model.id] ?? ""}
                    onChange={(event) => setSelectedProfiles((current) => ({
                      ...current,
                      [model.id]: event.target.value,
                    }))}
                  >
                    <option value="">not configured</option>
                    {state.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}{suggestion?.id === profile.id ? " (suggested)" : ""}
                      </option>
                    ))}
                  </Select>
                </ModelRow>
              );
            })}
          </>
        ) : (
          <>
            <MutedText>
              Set up a local or self-hosted LLM provider so sessions can be started.
            </MutedText>
            <ProviderFormFields
              value={form}
              onChange={setForm}
              autoFocus
            />
          </>
        )}
        {state.kind === "error" ? (
          <StatusBox $tone="error">{state.message}</StatusBox>
        ) : null}
        {state.kind === "profiles" && state.error ? (
          <StatusBox $tone="error">{state.error}</StatusBox>
        ) : null}
        <ActionsRow>
          {state.kind === "profiles" ? (
            <Button
              onClick={() => void handleProfilesSubmit()}
              disabled={state.saving || !Object.values(selectedProfiles).some(Boolean)}
            >
              {state.saving ? <Spinner size={14} /> : "Finish setup"}
            </Button>
          ) : (
            <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {state.kind === "saving" ? <Spinner size={14} /> : "Save & test"}
            </Button>
          )}
        </ActionsRow>
      </Body>
    </Modal>
  );
}
